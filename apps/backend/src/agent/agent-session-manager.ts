import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import * as path from 'node:path';
import logger from '../common/logger';
import type { AgentEvent, ApproveMode, Attachment } from './agent-events';
import {
  AgentError,
  AgentSession,
  type AgentSessionDeps,
  type AgentSessionMeta,
  type AgentSettings,
} from './agent-session';
import { transcriptAttachments, transcriptToUiMessages, type ThreadAttachment, type UiMessage } from './history';
import { loadSdk, type AgentSdk } from './sdk';
import { ToolRegistry } from './tool-registry';

/** Where thread metadata lives (the analysis repository implements it). */
export interface AgentSessionStore {
  load(sessionId: string): AgentSessionMeta | null;
  save(meta: AgentSessionMeta): void;
}

export interface AgentManagerConfig extends AgentSettings {
  maxLive: number;
  idleMinutes: number;
  fake: boolean;
}

export interface AgentManagerOptions {
  config: AgentManagerConfig;
  store: AgentSessionStore;
  tools: ToolRegistry;
  systemAppend: AgentSessionDeps['systemAppend'];
  prepareTurn?: AgentSessionDeps['prepareTurn'];
}

/** A transcript touched this recently by someone else (a Claude CLI?) is not resumed without asking. */
const CLI_BUSY_MS = 120_000;

/**
 * Owns every loaded AgentSession. Keeps at most `maxLive` Claude processes,
 * closes idle ones, and emits `event` (sessionId, AgentEvent) for the
 * gateway. Framework-free: wired up in analysis.module.ts.
 */
export class AgentSessionManager extends EventEmitter {
  private readonly sessions = new Map<string, AgentSession>();
  private reaper: NodeJS.Timeout | null = null;

  constructor(private readonly opts: AgentManagerOptions) {
    super();
  }

  sdk(): Promise<AgentSdk> {
    return loadSdk(this.opts.config.fake);
  }

  start(): void {
    this.reaper ??= setInterval(() => this.reapIdle(), 30_000);
    this.reaper.unref();
  }

  async shutdown(): Promise<void> {
    if (this.reaper) clearInterval(this.reaper);
    this.reaper = null;
    for (const s of this.sessions.values()) {
      await s.interrupt().catch(() => undefined);
      s.disconnect();
    }
  }

  liveCount(): number {
    return [...this.sessions.values()].filter((s) => s.isLive).length;
  }

  isRunning(sessionId: string): boolean {
    return this.sessions.get(sessionId)?.busy ?? false;
  }

  isLive(sessionId: string): boolean {
    return this.sessions.get(sessionId)?.isLive ?? false;
  }

  /** Loaded session, or loads it from the store. */
  async get(sessionId: string): Promise<AgentSession> {
    const existing = this.sessions.get(sessionId);
    if (existing) return existing;
    const meta = this.opts.store.load(sessionId);
    if (!meta) throw new AgentError(`No thread ${sessionId}`, 'not_found', 404);
    const sdk = await this.sdk();
    const session = new AgentSession(meta, {
      sdk,
      settings: this.opts.config,
      tools: this.opts.tools,
      save: (m) => this.opts.store.save(m),
      onEvent: (sid, ev) => this.emit('event', sid, ev as AgentEvent),
      makeRoom: (s) => this.makeRoom(s),
      systemAppend: this.opts.systemAppend,
      prepareTurn: this.opts.prepareTurn,
    });
    this.sessions.set(sessionId, session);
    return session;
  }

  /** Starts a turn. `force` skips the "transcript in use elsewhere" check. */
  async send(sessionId: string, text: string, attachments: Attachment[] = [], force = false): Promise<AgentSession> {
    const s = await this.get(sessionId);
    if (s.busy) throw new AgentError('A turn is already running in this thread', 'busy', 409);
    if (!fs.existsSync(s.meta.cwd)) {
      throw new AgentError(`The folder ${s.meta.cwd} no longer exists`, 'cwd_missing', 409);
    }
    if (!force) {
      const ago = await this.cliBusySeconds(s);
      if (ago !== null) {
        throw new AgentError(
          `This thread was changed ${ago}s ago outside ECC (a Claude CLI?). Resuming it from two places at once corrupts the transcript: close the other one, or send anyway.`,
          'cli_busy',
          409,
        );
      }
    }
    if (s.meta.started) {
      const sdk = await this.sdk();
      s.meta.turnEntryCount = (await sdk.getSessionMessages(s.id, { dir: s.meta.cwd }).catch(() => [])).length;
    }
    if (!s.meta.title) {
      s.meta.title = text.trim().split('\n')[0].slice(0, 80) || 'New chat';
    }
    s.startTurn(text, attachments);
    this.start();
    return s;
  }

  async interrupt(sessionId: string): Promise<void> {
    await (await this.get(sessionId)).interrupt();
  }

  async answer(
    sessionId: string,
    requestId: string,
    allow: boolean,
    message?: string,
    answers?: Record<string, string | string[]>,
    scope?: 'once' | 'session',
  ) {
    return (await this.get(sessionId)).answer(requestId, allow, message, answers, scope);
  }

  /** Transcript of a thread as UI messages (without the running turn, which comes as events). */
  async history(sessionId: string): Promise<UiMessage[]> {
    const s = await this.get(sessionId);
    if (!s.meta.started) return [];
    const sdk = await this.sdk();
    let entries = await sdk.getSessionMessages(s.id, { dir: s.meta.cwd });
    if (s.busy && s.meta.turnEntryCount !== null) entries = entries.slice(0, s.meta.turnEntryCount);
    return transcriptToUiMessages(entries, (data, type) => s.storeImage(data, type), { running: s.busy });
  }

  /** Files and images the user attached in this thread, with their content. */
  async attachments(sessionId: string): Promise<ThreadAttachment[]> {
    const s = await this.get(sessionId);
    if (!s.meta.started) return [];
    const sdk = await this.sdk();
    const entries = await sdk.getSessionMessages(s.id, { dir: s.meta.cwd });
    return transcriptAttachments(entries, (data, type) => s.storeImage(data, type));
  }

  /** Model / extra folders changed: the next message reconnects with them. */
  async reconfigure(sessionId: string): Promise<void> {
    const s = this.sessions.get(sessionId);
    if (!s?.isLive) return;
    if (s.busy) throw new AgentError('Wait for the running turn to finish', 'busy', 409);
    s.disconnect();
    s.emit({ type: 'notice', level: 'info', text: 'Settings changed: the thread resumes with them on the next message.' });
  }

  async setApproveMode(sessionId: string, mode: ApproveMode): Promise<void> {
    (await this.get(sessionId)).setApproveMode(mode);
  }

  async grants(sessionId: string): Promise<string[]> {
    return (await this.get(sessionId)).grantLabels;
  }

  async clearGrants(sessionId: string): Promise<void> {
    (await this.get(sessionId)).clearGrants();
  }

  /** Forgets a thread: closes its process and removes its event files and transcript. */
  async remove(sessionId: string): Promise<void> {
    const s = await this.get(sessionId).catch(() => null);
    if (s?.busy) throw new AgentError('Stop the running turn first', 'busy', 409);
    s?.disconnect();
    this.sessions.delete(sessionId);
    if (s?.meta.started) {
      const sdk = await this.sdk();
      await sdk.deleteSession(sessionId, { dir: s.meta.cwd }).catch((err) =>
        logger.warn('Cannot delete transcript', { sessionId, error: (err as Error).message }),
      );
    }
    fs.rmSync(path.join(this.opts.config.eccHome, 'sessions', sessionId), { recursive: true, force: true });
  }

  /** Path of a stored tool-result image, or null. */
  filePath(sessionId: string, name: string): string | null {
    if (!/^img-[0-9a-f]{16}\.(png|jpg|gif|webp)$/.test(name)) return null;
    const file = path.join(this.opts.config.eccHome, 'sessions', sessionId, name);
    return fs.existsSync(file) ? file : null;
  }

  private async cliBusySeconds(s: AgentSession): Promise<number | null> {
    if (s.isLive || !s.meta.started) return null;
    const sdk = await this.sdk();
    const info = await sdk.getSessionInfo(s.id, { dir: s.meta.cwd }).catch(() => undefined);
    const lastModified = info?.lastModified ?? 0;
    if (lastModified && Date.now() - lastModified < CLI_BUSY_MS && lastModified > s.meta.lastOwnActivity + 5000) {
      return Math.round((Date.now() - lastModified) / 1000);
    }
    return null;
  }

  private async makeRoom(session: AgentSession): Promise<void> {
    const live = [...this.sessions.values()].filter((s) => s.isLive && s !== session);
    while (live.length >= this.opts.config.maxLive) {
      const idle = live.filter((s) => !s.busy && !s.hasPending).sort((a, b) => a.lastUsed - b.lastUsed);
      if (!idle.length) {
        throw new AgentError(
          `${this.opts.config.maxLive} threads are busy; wait for one to finish or stop it`,
          'no_room',
          409,
        );
      }
      idle[0].disconnect();
      live.splice(live.indexOf(idle[0]), 1);
    }
  }

  private reapIdle(): void {
    const limit = this.opts.config.idleMinutes * 60_000;
    for (const s of this.sessions.values()) {
      if (s.isLive && !s.busy && !s.hasPending && Date.now() - s.lastUsed > limit) s.disconnect();
    }
  }
}
