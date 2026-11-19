import { HttpException, Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/configuration';
import logger from '../common/logger';
import { gitBranch } from '../common/git-branch';
import GitlabClient from '../mr/gitlab-client';
import JiraClient from '../mr/jira-client';
import type { AgentEvent, ApproveMode, Attachment } from '../agent/agent-events';
import { AgentError, type AgentSession } from '../agent/agent-session';
import { AgentSessionManager } from '../agent/agent-session-manager';
import { PromptError } from '../agent/prompt';
import { ToolRegistry } from '../agent/tool-registry';
import { GitlabToolProvider } from '../agent/tools/gitlab.tools';
import { JiraToolProvider } from '../agent/tools/jira.tools';
import { JiraCacheError, JiraCacheService } from '../jira-cache/jira-cache.service';
import { analysisSystemPrompt } from './analysis-prompt';
import { AnalysisRepository, type ThreadRow, type WorkspaceRow } from './analysis.repository';
import { FsDirsService, FsError } from './fs-dirs.service';

const MAX_PREFETCH = 5;

/** Maps domain errors to HTTP errors ({ message, code }). */
export function toHttpError(err: unknown): HttpException {
  if (err instanceof HttpException) return err;
  if (err instanceof AgentError) return new HttpException({ message: err.message, code: err.code }, err.status);
  if (err instanceof JiraCacheError) return new HttpException({ message: err.message, code: 'jira' }, err.status);
  if (err instanceof FsError || err instanceof PromptError) {
    return new HttpException({ message: err.message, code: 'bad_request' }, 400);
  }
  return new HttpException({ message: (err as Error)?.message ?? String(err), code: 'internal' }, 500);
}

/**
 * The Analysis tab: workspaces (a folder on this machine), threads (Claude
 * Code sessions in that folder) and the agent that runs them. Builds the
 * AgentSessionManager with the tool providers and the two Analysis-specific
 * hooks: the system prompt and the Jira prefetch before each turn.
 */
@Injectable()
export class AnalysisService implements OnModuleInit, OnModuleDestroy {
  readonly agents: AgentSessionManager;

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly repo: AnalysisRepository,
    private readonly fsDirs: FsDirsService,
    private readonly jiraCache: JiraCacheService,
    @Inject(JiraClient) jira: JiraClient | null,
    @Inject(GitlabClient) gitlab: GitlabClient,
  ) {
    const a = config.analysis;
    const tools = new ToolRegistry()
      .register(new JiraToolProvider(jiraCache, jira))
      .register(new GitlabToolProvider(gitlab, config.gitlabActivities.baseUrl, config.mr.gitlabAllowedHosts));
    this.agents = new AgentSessionManager({
      config: {
        eccHome: a.eccHome,
        model: a.model,
        maxTurns: a.maxTurns,
        maxBudgetUsd: a.maxBudgetUsd,
        maxLive: a.maxLive,
        idleMinutes: a.idleMinutes,
        fake: a.fake,
      },
      store: repo,
      tools,
      systemAppend: (meta) => this.systemAppend(meta.sessionId),
      prepareTurn: (session, text) => this.prefetchJira(session, text),
    });
  }

  onModuleInit(): void {
    fs.mkdirSync(path.join(this.config.analysis.eccHome, 'sessions'), { recursive: true });
    this.agents.on('event', (sid: string, ev: AgentEvent) => {
      if (ev.type === 'jira_cached' && typeof ev.key === 'string') this.repo.addJiraKey(sid, ev.key);
    });
    this.agents.start();
  }

  async onModuleDestroy(): Promise<void> {
    await this.agents.shutdown();
  }

  // ---------------------------------------------------------------- status

  async status() {
    let sdkVersion: string | null = null;
    let sdkError: string | null = null;
    try {
      sdkVersion = (await this.agents.sdk()).version;
    } catch (err) {
      sdkError = (err as Error).message;
    }
    return {
      sdkVersion,
      sdkError,
      fake: this.config.analysis.fake,
      login: this.config.analysis.fake ? { ok: true, method: 'fake', detail: 'ANALYSIS_FAKE=1' } : loginStatus(),
      liveThreads: this.agents.liveCount(),
      maxLive: this.config.analysis.maxLive,
      roots: this.fsDirs.roots,
      jiraEnabled: this.jiraCache.enabled,
      jiraPrefixes: this.config.analysis.jiraKeyPrefixes,
      jiraDir: this.jiraCache.root,
      defaultModel: this.config.analysis.model,
    };
  }

  // ---------------------------------------------------------------- workspaces

  listWorkspaces() {
    return this.repo.listWorkspaces().map((w) => this.workspaceDto(w));
  }

  createWorkspace(body: { name?: string; path?: string; contextMd?: string }) {
    const dir = this.fsDirs.checkDir(String(body.path ?? ''));
    const name = String(body.name ?? '').trim() || path.basename(dir);
    return this.workspaceDto(this.repo.createWorkspace({ name, path: dir, contextMd: body.contextMd }));
  }

  updateWorkspace(id: number, body: { name?: string; path?: string; contextMd?: string }) {
    this.requireWorkspace(id);
    const patch: Partial<WorkspaceRow> = {};
    if (body.name !== undefined) patch.name = String(body.name).trim() || 'Workspace';
    if (body.path !== undefined) patch.path = this.fsDirs.checkDir(String(body.path));
    if (body.contextMd !== undefined) patch.contextMd = String(body.contextMd);
    return this.workspaceDto(this.repo.updateWorkspace(id, patch)!);
  }

  async deleteWorkspace(id: number) {
    this.requireWorkspace(id);
    for (const t of this.repo.listThreads(id)) await this.deleteThread(t.sessionId);
    this.repo.deleteWorkspace(id);
    return { deleted: id };
  }

  private requireWorkspace(id: number): WorkspaceRow {
    const w = this.repo.getWorkspace(id);
    if (!w) throw new AgentError(`No workspace ${id}`, 'not_found', 404);
    return w;
  }

  private workspaceDto(w: WorkspaceRow) {
    return { ...w, exists: fs.existsSync(w.path), branch: gitBranch(w.path) };
  }

  // ---------------------------------------------------------------- threads

  listThreads(workspaceId: number) {
    this.requireWorkspace(workspaceId);
    return this.repo.listThreads(workspaceId).map((t) => this.threadDto(t));
  }

  async createThread(workspaceId: number, body: { cwd?: string; addDirs?: string[]; model?: string; approveMode?: ApproveMode }) {
    const w = this.requireWorkspace(workspaceId);
    const cwd = this.fsDirs.checkDir(body.cwd || w.path);
    const addDirs = [...new Set((body.addDirs ?? []).map((d) => this.fsDirs.checkDir(d)))];
    const row = this.repo.createThread({
      sessionId: crypto.randomUUID(),
      workspaceId,
      cwd,
      addDirs,
      model: String(body.model ?? '').trim(),
    });
    this.repo.touchWorkspace(workspaceId);
    if (body.approveMode && body.approveMode !== 'manual') await this.agents.setApproveMode(row.sessionId, body.approveMode);
    return this.threadDto(row);
  }

  async threadDetail(sid: string) {
    const row = this.requireThread(sid);
    const session = await this.agents.get(sid);
    return {
      thread: this.threadDto(row),
      messages: await this.agents.history(sid),
      events: session.busy ? session.events : [],
      lastEventId: session.lastEventId,
      jiraKeys: this.repo.jiraKeys(sid),
      grants: session.grantLabels,
      approveMode: session.approveMode,
    };
  }

  /** Files and images attached in the thread (Attachments tab). */
  async attachments(sid: string) {
    this.requireThread(sid);
    return this.agents.attachments(sid);
  }

  /** Revokes every "always allow in this session" of the thread. */
  async clearGrants(sid: string) {
    this.requireThread(sid);
    await this.agents.clearGrants(sid);
    return { grants: [] as string[] };
  }

  async updateThread(sid: string, body: { title?: string; model?: string; addDirs?: string[]; cwd?: string; approveMode?: ApproveMode }) {
    this.requireThread(sid);
    const session = await this.agents.get(sid);
    const meta = session.meta;
    let reconnect = false;
    if (body.title !== undefined) meta.title = String(body.title).trim().slice(0, 120) || null;
    if (body.cwd !== undefined && body.cwd !== meta.cwd) {
      if (meta.started) throw new AgentError('The folder is fixed after the first message; start a new thread to change it', 'cwd_locked', 409);
      meta.cwd = this.fsDirs.checkDir(body.cwd);
    }
    if (body.addDirs !== undefined) {
      meta.addDirs = [...new Set(body.addDirs.map((d) => this.fsDirs.checkDir(d)))];
      reconnect = true;
    }
    if (body.model !== undefined && body.model !== meta.model) {
      meta.model = String(body.model).trim();
      reconnect = true;
    }
    if (body.approveMode !== undefined) session.setApproveMode(body.approveMode); // no restart needed
    if (reconnect) await this.agents.reconfigure(sid);
    session.save();
    return this.threadDto(this.repo.getThread(sid)!);
  }

  async deleteThread(sid: string) {
    this.requireThread(sid);
    await this.agents.remove(sid);
    this.repo.deleteThread(sid);
    return { deleted: sid };
  }

  async send(sid: string, text: string, attachments: Attachment[] = [], force = false) {
    const row = this.requireThread(sid);
    await this.agents.send(sid, String(text ?? ''), Array.isArray(attachments) ? attachments : [], force);
    this.repo.touchWorkspace(row.workspaceId);
    return { ok: true };
  }

  filePath(sid: string, name: string): string | null {
    this.requireThread(sid);
    return this.agents.filePath(sid, name);
  }

  private requireThread(sid: string): ThreadRow {
    const row = this.repo.getThread(String(sid));
    if (!row) throw new AgentError(`No thread ${sid}`, 'not_found', 404);
    return row;
  }

  private threadDto(t: ThreadRow) {
    return {
      sessionId: t.sessionId,
      workspaceId: t.workspaceId,
      title: t.title || 'New chat',
      cwd: t.cwd,
      addDirs: JSON.parse(t.addDirsJson || '[]') as string[],
      model: t.model,
      started: t.started,
      turns: t.turns,
      costUsd: t.costUsd,
      lastBranch: t.lastBranch,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      running: this.agents.isRunning(t.sessionId),
      live: this.agents.isLive(t.sessionId),
      cwdMissing: !fs.existsSync(t.cwd),
    };
  }

  // ---------------------------------------------------------------- Jira cache

  jiraIssue(key: string) {
    const meta = this.jiraCache.readMeta(key);
    if (!meta) throw new AgentError(`${key} is not cached`, 'not_found', 404);
    return { ...meta, markdown: this.jiraCache.readMarkdown(key) };
  }

  /** Live summary of an issue for the chat popup (Jira API, not the cache). */
  jiraPreview(key: string) {
    return this.jiraCache.preview(key);
  }

  async refreshJira(key: string) {
    const issue = await this.jiraCache.ensure(key, { force: true });
    return { ...this.jiraCache.readMeta(issue.key), markdown: this.jiraCache.readMarkdown(issue.key) };
  }

  jiraAttachment(key: string, file: string): string | null {
    return this.jiraCache.attachmentPath(key, file);
  }

  // ---------------------------------------------------------------- agent hooks

  private systemAppend(sid: string): string {
    const thread = this.repo.getThread(sid);
    const ws = thread ? this.repo.getWorkspace(thread.workspaceId) : null;
    return analysisSystemPrompt({
      jiraDir: this.jiraCache.root,
      workspaceName: ws?.name ?? '',
      contextMd: ws?.contextMd ?? '',
    });
  }

  /** Jira keys / URLs in the user's message, limited to the configured project prefixes. */
  detectJiraKeys(text: string): string[] {
    const prefixes = this.config.analysis.jiraKeyPrefixes.map((p) => p.replace(/[^A-Z0-9_]/g, '')).filter(Boolean);
    const keys = new Set<string>();
    if (prefixes.length) {
      const re = new RegExp(`(?<![A-Za-z0-9_-])(${prefixes.join('|')})-(\\d+)(?![A-Za-z0-9_])`, 'gi');
      for (const m of text.matchAll(re)) keys.add(`${m[1].toUpperCase()}-${m[2]}`);
    }
    const host = this.config.mr.jiraBaseUrl.replace(/^https?:\/\//, '').replace(/[.]/g, '\\.');
    for (const m of text.matchAll(new RegExp(`https?://${host}/browse/([A-Za-z][A-Za-z0-9_]*-\\d+)`, 'g'))) {
      keys.add(m[1].toUpperCase());
    }
    return [...keys].slice(0, MAX_PREFETCH);
  }

  private async prefetchJira(session: AgentSession, text: string): Promise<string | undefined> {
    if (!this.jiraCache.enabled) return undefined;
    const lines: string[] = [];
    for (const key of this.detectJiraKeys(text)) {
      try {
        const issue = await this.jiraCache.ensure(key);
        session.emit({ type: 'jira_cached', key: issue.key, summary: issue.summary, status: issue.status, dir: issue.dir, attachments: issue.attachments.length });
        lines.push(`Jira ${issue.key} (${issue.summary}) is cached at ${path.join(issue.dir, 'issue.md')}; attachments in ${path.join(issue.dir, 'attachments')}.`);
      } catch (err) {
        session.emit({ type: 'notice', level: 'warning', text: `Could not fetch ${key}: ${(err as Error).message}` });
        logger.warn('Jira prefetch failed', { key, error: (err as Error).message });
      }
    }
    return lines.length ? lines.join('\n') : undefined;
  }
}

/** How the Claude CLI will authenticate, without exposing any secret. */
function loginStatus() {
  if (process.env.ANTHROPIC_API_KEY) return { ok: true, method: 'api_key', detail: 'ANTHROPIC_API_KEY is set' };
  const cred = path.join(os.homedir(), '.claude', '.credentials.json');
  try {
    const oauth = JSON.parse(fs.readFileSync(cred, 'utf8'))?.claudeAiOauth ?? {};
    return { ok: !!oauth.accessToken, method: 'claude_login', detail: 'Claude Code login', plan: oauth.subscriptionType ?? null };
  } catch {
    return { ok: false, method: null, detail: 'Not logged in: run `claude` once and /login, or set ANTHROPIC_API_KEY' };
  }
}
