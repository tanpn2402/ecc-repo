import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { gitBranch } from '../common/git-branch';
import logger from '../common/logger';
import { APPROVE_MODES, type AgentEvent, type AgentEventInput, type ApproveMode, type Attachment, type TurnStatus } from './agent-events';
import { blockedBashReason } from './bash-guard';
import { MessageMapper } from './message-mapper';
import { buildPrompt, type PromptContent } from './prompt';
import type { AgentSdk, CanUseTool, HookCallback, PermissionResult, PermissionUpdate, Query, SDKUserMessage, SdkOptions } from './sdk';
import { ToolRegistry } from './tool-registry';

/** Persisted state of one thread (= one Claude Code session). Stored by the AgentSessionStore. */
export interface AgentSessionMeta {
  sessionId: string;
  cwd: string;
  addDirs: string[];
  model: string;
  title: string | null;
  /** The first message was sent: later connections resume the transcript. */
  started: boolean;
  turns: number;
  costUsd: number;
  eventSeq: number;
  lastBranch: string | null;
  /** ms epoch of this server's last write to the transcript (see cli_busy). */
  lastOwnActivity: number;
  /** Transcript length before the running turn; history() stops there while it runs. */
  turnEntryCount: number | null;
}

export interface AgentSettings {
  eccHome: string;
  model: string;
  maxTurns: number;
  maxBudgetUsd: number | null;
}

/** What a session needs from its manager. */
export interface AgentSessionDeps {
  sdk: AgentSdk;
  settings: AgentSettings;
  tools: ToolRegistry;
  save(meta: AgentSessionMeta): void;
  onEvent(sessionId: string, event: AgentEvent): void;
  /** Called before a session opens a Claude process: may close another idle one, or throw. */
  makeRoom(session: AgentSession): Promise<void>;
  /** Appended to Claude Code's system prompt for this session. */
  systemAppend(meta: AgentSessionMeta): string;
  /** Runs at the start of every turn; returned text is added to the prompt as hidden context. */
  prepareTurn?(session: AgentSession, text: string): Promise<string | undefined>;
}

export class AgentError extends Error {
  constructor(
    message: string,
    readonly code: string = 'bad_request',
    readonly status = 400,
  ) {
    super(message);
  }
}

const PERMISSION_TIMEOUT_MS = 10 * 60 * 1000;
const INTERRUPT_GRACE_MS = 15 * 1000;
/** Built-in tools that only read: they run without asking. */
const READ_TOOLS = ['Read', 'Grep', 'Glob', 'LS', 'TodoWrite'];
/** Tools the "edits" approve mode lets through when their target is inside the thread's folders. */
const EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit']);

interface Pending {
  event: AgentEvent;
  tool: string;
  input: Record<string, unknown>;
  /** What "always allow in this session" grants; empty when it is not offered. */
  sessionGrant: PermissionUpdate[];
  resolve(result: PermissionResult): void;
}

/** Async queue feeding user messages into the long-lived query(). */
class InputQueue implements AsyncIterable<SDKUserMessage> {
  private items: SDKUserMessage[] = [];
  private waiter: ((v: IteratorResult<SDKUserMessage>) => void) | null = null;
  private ended = false;

  push(msg: SDKUserMessage) {
    if (this.waiter) {
      const w = this.waiter;
      this.waiter = null;
      w({ value: msg, done: false });
    } else this.items.push(msg);
  }

  end() {
    this.ended = true;
    this.waiter?.({ value: undefined as never, done: true });
    this.waiter = null;
  }

  [Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
    return {
      next: () => {
        if (this.items.length) return Promise.resolve({ value: this.items.shift()!, done: false });
        if (this.ended) return Promise.resolve({ value: undefined as never, done: true });
        return new Promise((resolve) => (this.waiter = resolve));
      },
    };
  }
}

interface Live {
  query: Query;
  input: InputQueue;
  /** The process resumes an earlier transcript (its first result may already carry the earlier turns' cost). */
  resumed: boolean;
  /** Running total_cost_usd this process last reported; null before its first result. */
  lastTotalUsd: number | null;
}

/**
 * One chat thread. Owns at most one live Claude process (a long-lived
 * query() fed by an input queue), the event log of the current turn, and the
 * permission requests waiting for the user. Port of Session in swing-probe's
 * ai.py, on Node's single event loop.
 */
export class AgentSession {
  readonly id: string;
  readonly dir: string;
  events: AgentEvent[] = [];
  busy = false;
  lastUsed = Date.now();
  private live: Live | null = null;
  private readonly mapper: MessageMapper;
  private readonly pending = new Map<string, Pending>();
  private turnDone: ((status: TurnStatus | Error) => void) | null = null;
  /** The process the running turn was sent to: only its stream may finish the turn. */
  private turnLive: Live | null = null;
  private interrupted = false;
  private stderrTail: string[] = [];
  /** Permissions the user granted for this thread ("always allow in this session"); survive process restarts. */
  private grants: PermissionUpdate[] = [];
  private mode: ApproveMode = 'manual';

  constructor(
    public meta: AgentSessionMeta,
    private readonly deps: AgentSessionDeps,
  ) {
    this.id = meta.sessionId;
    this.dir = path.join(deps.settings.eccHome, 'sessions', this.id);
    this.mapper = new MessageMapper((data, type) => this.storeImage(data, type));
    this.loadEvents();
    this.loadGrants();
  }

  get isLive(): boolean {
    return this.live !== null;
  }

  get hasPending(): boolean {
    return this.pending.size > 0;
  }

  get lastEventId(): number {
    return this.meta.eventSeq;
  }

  /** Events with id > after (replay after a reconnect). */
  eventsAfter(after: number): AgentEvent[] {
    return this.events.filter((e) => e.id > after);
  }

  // ---------------------------------------------------------------- events

  emit(input: AgentEventInput): AgentEvent {
    this.meta.eventSeq += 1;
    const event = { ...input, id: this.meta.eventSeq, t: new Date().toISOString() } as AgentEvent;
    this.events.push(event);
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      fs.appendFileSync(this.eventsFile, JSON.stringify(event) + '\n');
    } catch (err) {
      logger.warn('Cannot write agent event log', { sessionId: this.id, error: (err as Error).message });
    }
    this.deps.onEvent(this.id, event);
    return event;
  }

  private get eventsFile(): string {
    return path.join(this.dir, 'events.ndjson');
  }

  private loadEvents(): void {
    if (!fs.existsSync(this.eventsFile)) return;
    for (const line of fs.readFileSync(this.eventsFile, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        this.events.push(JSON.parse(line));
      } catch {
        /* torn last line */
      }
    }
    const last = this.events[this.events.length - 1];
    if (last) this.meta.eventSeq = Math.max(this.meta.eventSeq, last.id);
    if (last && last.type !== 'done') {
      // The server stopped during this turn: close it for the UI.
      this.emit({ type: 'notice', level: 'warning', text: 'The server restarted during this turn; it was stopped.' });
      this.emit({ type: 'done', status: 'stopped' });
      this.save();
    }
  }

  private get grantsFile(): string {
    return path.join(this.dir, 'permissions.json');
  }

  private loadGrants(): void {
    try {
      const v = JSON.parse(fs.readFileSync(this.grantsFile, 'utf8'));
      if (Array.isArray(v)) this.grants = v; // first format: the grants alone
      else {
        if (Array.isArray(v?.grants)) this.grants = v.grants;
        if (APPROVE_MODES.includes(v?.mode)) this.mode = v.mode;
      }
    } catch {
      /* none yet */
    }
  }

  /** Session grants as "Tool(rule)" labels, for the UI. */
  get grantLabels(): string[] {
    return this.grants.flatMap(grantLabels);
  }

  /** Forgets every "always allow" of this thread; the live process (which still holds them) is closed. */
  clearGrants(): void {
    if (this.busy) throw new AgentError('Wait for the running turn to finish', 'busy', 409);
    this.grants = [];
    this.savePermissions();
    this.disconnect();
  }

  private addGrants(updates: PermissionUpdate[]): void {
    this.grants.push(...updates);
    this.savePermissions();
  }

  private savePermissions(): void {
    fs.mkdirSync(this.dir, { recursive: true });
    fs.writeFileSync(this.grantsFile, JSON.stringify({ mode: this.mode, grants: this.grants }, null, 2));
  }

  get approveMode(): ApproveMode {
    return this.mode;
  }

  /**
   * Changes the approve mode at once, also for the running turn (canUseTool
   * reads it per call). Requests already waiting that the new mode covers are
   * approved, so switching to auto unblocks a turn left waiting.
   */
  setApproveMode(mode: ApproveMode): void {
    if (!APPROVE_MODES.includes(mode)) throw new AgentError(`Unknown approve mode: ${mode}`, 'bad_request', 400);
    if (mode === this.mode) return;
    this.mode = mode;
    this.savePermissions();
    this.emit({ type: 'approve_mode', mode });
    for (const [requestId, p] of [...this.pending]) {
      if (this.autoApproves(p.tool, p.input, null)) this.answer(requestId, true, `Approved by ${mode} mode`);
    }
  }

  /** True when the current mode approves this call without asking. */
  private autoApproves(tool: string, input: Record<string, unknown>, blockedPath: string | null): boolean {
    if (tool === 'AskUserQuestion') return false; // a question, not a permission
    if (this.mode === 'auto') return true;
    if (this.mode === 'edits' && EDIT_TOOLS.has(tool) && !blockedPath) {
      const target = String(input.file_path ?? input.notebook_path ?? '');
      return !!target && this.insideFolders(target);
    }
    return false;
  }

  private insideFolders(file: string): boolean {
    const full = path.resolve(this.meta.cwd, file);
    return [this.meta.cwd, ...this.meta.addDirs].some((d) => {
      const dir = path.resolve(d);
      return full === dir || full.startsWith(dir + path.sep);
    });
  }

  /** Stores a tool-result image in the session folder; returns its URL. */
  storeImage(base64: string, mediaType: string): string {
    const ext = ({ 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' } as Record<string, string>)[mediaType] ?? 'png';
    const raw = Buffer.from(base64, 'base64');
    const name = `img-${crypto.createHash('sha1').update(raw).digest('hex').slice(0, 16)}.${ext}`;
    const file = path.join(this.dir, name);
    if (!fs.existsSync(file)) {
      fs.mkdirSync(this.dir, { recursive: true });
      fs.writeFileSync(file, raw);
    }
    return `/api/analysis/threads/${this.id}/files/${name}`;
  }

  save(): void {
    this.deps.save(this.meta);
  }

  // ---------------------------------------------------------------- turn

  /** Starts a turn in the background; progress arrives as events. */
  startTurn(text: string, attachments: Attachment[]): void {
    if (this.busy) throw new AgentError('A turn is already running in this thread', 'busy', 409);
    const { chips } = buildPrompt(text, attachments); // validates before anything changes
    this.busy = true;
    this.interrupted = false;
    this.events = [];
    fs.rmSync(this.eventsFile, { force: true });
    this.emit({ type: 'user', text: String(text ?? '').trim(), attachments: chips });
    void this.runTurn(text, attachments);
  }

  private async runTurn(text: string, attachments: Attachment[]): Promise<void> {
    let status: TurnStatus = 'done';
    this.mapper.reset();
    try {
      this.checkBranch();
      let context: string | undefined;
      try {
        context = await this.deps.prepareTurn?.(this, text);
      } catch (err) {
        this.emit({ type: 'notice', level: 'warning', text: `Preparing context failed: ${(err as Error).message}` });
      }
      const { content } = buildPrompt(text, attachments, context);
      await this.ensureLive();
      this.lastUsed = Date.now();
      this.meta.lastOwnActivity = Date.now();
      const done = new Promise<TurnStatus | Error>((resolve) => (this.turnDone = resolve));
      this.turnLive = this.live;
      this.live!.input.push(this.userMessage(content));
      if (!this.meta.started) {
        this.meta.started = true;
        this.save();
      }
      const outcome = await done;
      if (outcome instanceof Error) throw outcome;
      status = outcome;
    } catch (err) {
      status = 'error';
      let detail = (err as Error).message || String(err);
      if (this.stderrTail.length) detail += '\n' + this.stderrTail.slice(-8).join('\n');
      this.emit({ type: 'error', message: detail.slice(0, 4000) });
      this.disconnect();
    } finally {
      this.turnDone = null;
      this.turnLive = null;
      this.busy = false;
      this.lastUsed = Date.now();
      this.meta.lastOwnActivity = Date.now();
      this.meta.turns += 1;
      this.meta.turnEntryCount = null;
      this.save();
      this.emit({ type: 'done', status });
    }
  }

  private userMessage(content: PromptContent): SDKUserMessage {
    return {
      type: 'user',
      message: { role: 'user', content: content as any },
      parent_tool_use_id: null,
    } as SDKUserMessage;
  }

  private checkBranch(): void {
    const branch = gitBranch(this.meta.cwd);
    const last = this.meta.lastBranch;
    this.emit({ type: 'branch', cwd: this.meta.cwd, branch });
    if (last && branch && last !== branch) {
      this.emit({
        type: 'notice',
        level: 'warning',
        text: `Branch of ${path.basename(this.meta.cwd)} changed: ${last} -> ${branch}. Claude now reads the code of ${branch}.`,
      });
    }
    this.meta.lastBranch = branch;
  }

  async interrupt(): Promise<void> {
    if (!this.busy) return;
    this.interrupted = true;
    this.denyPending('Stopped by the user.');
    if (!this.live) return;
    const live = this.live;
    try {
      await live.query.interrupt();
    } catch (err) {
      logger.warn('Interrupt failed', { sessionId: this.id, error: (err as Error).message });
    }
    // The CLI normally answers with a result message; if it does not, end the process.
    setTimeout(() => {
      if (this.busy && this.live === live) this.disconnect();
    }, INTERRUPT_GRACE_MS).unref();
  }

  // ---------------------------------------------------------------- live process

  private async ensureLive(): Promise<void> {
    if (this.live) return;
    await this.deps.makeRoom(this);
    const input = new InputQueue();
    this.stderrTail = [];
    const query = this.deps.sdk.query({ prompt: input, options: this.options() });
    this.live = { query, input, resumed: this.meta.started, lastTotalUsd: null };
    void this.pump(this.live);
  }

  /** Reads the SDK stream for the lifetime of the process. */
  private async pump(live: Live): Promise<void> {
    let failure: Error | null = null;
    try {
      for await (const msg of live.query) {
        for (const ev of this.mapper.map(msg)) {
          if (ev.type === 'result') {
            const turnCost = this.turnCost(live, Number(ev.costUsd ?? 0));
            this.meta.costUsd = roundUsd(this.meta.costUsd + turnCost);
            ev.costUsd = roundUsd(turnCost);
            ev.sessionCostUsd = this.meta.costUsd;
          }
          this.emit(ev);
          if (ev.type === 'result' && this.turnLive === live) {
            const status: TurnStatus = this.interrupted ? 'stopped' : ev.isError ? 'error' : 'done';
            this.turnDone?.(status);
          }
        }
        // Closed by disconnect(): whatever it still yields belongs to no turn.
        if (this.live !== live) break;
      }
    } catch (err) {
      failure = err as Error;
    } finally {
      if (this.live === live) this.live = null;
      // A process closed earlier (model change, idle reaper) ends after a new turn may have
      // started on a new process: only the turn that was sent to this process is finished here.
      if (this.turnLive === live && this.turnDone) {
        this.turnDone(this.interrupted ? 'stopped' : (failure ?? new Error('Claude process ended unexpectedly')));
        this.denyPending('The Claude process ended.');
      }
    }
  }

  /**
   * Cost of the turn that just ended. total_cost_usd is a running total for the
   * whole query() (every turn of this process), not the cost of one turn, and a
   * resumed process may start from the total its transcript saved. Summing it
   * per result counted every earlier turn again on each new one.
   */
  private turnCost(live: Live, totalUsd: number): number {
    if (live.lastTotalUsd === null) {
      // Restored total: the first result already includes what the thread spent before.
      live.lastTotalUsd = live.resumed && totalUsd >= this.meta.costUsd ? this.meta.costUsd : 0;
    }
    const cost = Math.max(0, totalUsd - live.lastTotalUsd);
    live.lastTotalUsd = Math.max(live.lastTotalUsd, totalUsd); // crash results may carry a zeroed total
    return cost;
  }

  /** Closes the Claude process; the next message resumes the transcript. */
  disconnect(): void {
    const live = this.live;
    this.live = null;
    if (!live) return;
    live.input.end();
    try {
      live.query.close();
    } catch {
      /* already closed */
    }
  }

  private options(): SdkOptions {
    const m = this.meta;
    const s = this.deps.settings;
    const ctx = { sessionId: this.id, emit: (e: AgentEventInput) => this.emit(e) };
    const options: SdkOptions = {
      cwd: m.cwd,
      additionalDirectories: [path.join(s.eccHome, 'jira'), ...m.addDirs, ...grantedDirs(this.grants)],
      settingSources: ['user', 'project', 'local'],
      systemPrompt: { type: 'preset', preset: 'claude_code', append: this.deps.systemAppend(m) },
      mcpServers: { ecc: this.deps.tools.createServer(this.deps.sdk, ctx) },
      allowedTools: [...READ_TOOLS, ...this.deps.tools.readOnlyToolNames(), ...grantedRules(this.grants)],
      canUseTool: this.canUseTool,
      hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [this.bashGuard] }] },
      includePartialMessages: true,
      maxTurns: s.maxTurns,
      model: m.model || s.model || undefined,
      stderr: (line: string) => (this.stderrTail = [...this.stderrTail, line].slice(-30)),
    };
    if (this.grants.some((g) => g.type === 'setMode' && g.mode === 'acceptEdits')) options.permissionMode = 'acceptEdits';
    if (s.maxBudgetUsd) options.maxBudgetUsd = s.maxBudgetUsd;
    if (m.started) options.resume = m.sessionId;
    else options.sessionId = m.sessionId;
    return options;
  }

  private readonly bashGuard: HookCallback = async (input) => {
    const reason = blockedBashReason((input as any)?.tool_input?.command);
    if (!reason) return {};
    this.emit({ type: 'notice', level: 'warning', text: reason });
    return {
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
    };
  };

  // ---------------------------------------------------------------- permissions

  /** Every tool call Claude would ask about in a terminal becomes a card (or a form, for AskUserQuestion) on the UI. */
  private readonly canUseTool: CanUseTool = (tool, input, opts) => {
    if (this.autoApproves(tool, input, opts.blockedPath ?? null)) {
      return Promise.resolve<PermissionResult>({ behavior: 'allow', updatedInput: input });
    }
    return new Promise<PermissionResult>((resolve) => {
      const requestId = crypto.randomBytes(6).toString('hex');
      const sessionGrant = tool === 'AskUserQuestion' ? [] : sessionGrantFor(tool, opts.suggestions);
      const event =
        tool === 'AskUserQuestion'
          ? this.emit({ type: 'question', requestId, questions: (input as any)?.questions ?? [] })
          : this.emit({
              type: 'permission_request',
              requestId,
              tool,
              input: clip(input),
              title: opts.title ?? null,
              description: opts.description ?? null,
              decisionReason: opts.decisionReason ?? null,
              blockedPath: opts.blockedPath ?? null,
              alwaysAllow: sessionGrant.length ? sessionGrant.flatMap(grantLabels) : null,
            });
      const finish = (result: PermissionResult) => {
        clearTimeout(timer);
        this.pending.delete(requestId);
        resolve(result);
      };
      const timer = setTimeout(() => {
        this.emit({ type: 'permission_resolved', requestId, decision: 'expired', message: 'No answer within 10 minutes' });
        finish({ behavior: 'deny', message: 'The user did not answer within 10 minutes.' });
      }, PERMISSION_TIMEOUT_MS);
      opts.signal?.addEventListener('abort', () => finish({ behavior: 'deny', message: 'Cancelled.' }));
      this.pending.set(requestId, { event, tool, input, sessionGrant, resolve: finish });
    });
  };

  /** Answer from the UI to a permission request or question. */
  answer(
    requestId: string,
    allow: boolean,
    message = '',
    answers?: Record<string, string | string[]>,
    scope: 'once' | 'session' = 'once',
  ): string {
    const p = this.pending.get(requestId);
    if (!p) throw new AgentError(`No pending request ${requestId} (answered already or expired)`, 'not_found', 404);
    let decision: string;
    let result: PermissionResult;
    if (p.tool === 'AskUserQuestion') {
      if (allow && answers && Object.keys(answers).length) {
        const flat = Object.fromEntries(
          Object.entries(answers).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : String(v)]),
        );
        result = { behavior: 'allow', updatedInput: { ...p.input, answers: flat } };
        decision = 'answered';
      } else {
        result = { behavior: 'deny', message: message || 'The user declined to answer.' };
        decision = 'denied';
      }
    } else if (allow && scope === 'session' && p.sessionGrant.length) {
      // The CLI applies updatedPermissions for its own lifetime; addGrants carries them to later processes.
      result = { behavior: 'allow', updatedInput: p.input, updatedPermissions: p.sessionGrant };
      this.addGrants(p.sessionGrant);
      decision = 'allowed_session';
    } else if (allow) {
      result = { behavior: 'allow', updatedInput: p.input };
      decision = 'allowed';
    } else {
      result = { behavior: 'deny', message: message || 'The user denied this tool call.' };
      decision = 'denied';
    }
    this.emit({
      type: 'permission_resolved',
      requestId,
      decision,
      message,
      answers: p.tool === 'AskUserQuestion' ? answers : undefined,
      grants: decision === 'allowed_session' ? this.grantLabels : undefined,
    });
    p.resolve(result);
    return decision;
  }

  private denyPending(message: string): void {
    for (const [requestId, p] of [...this.pending]) {
      this.emit({ type: 'permission_resolved', requestId, decision: 'denied', message });
      p.resolve({ behavior: 'deny', message });
    }
  }
}

function roundUsd(v: number): number {
  return Math.round(v * 10000) / 10000;
}

/** Tool input for the UI: long strings cut so a large Write does not flood the event log. */
function clip(v: unknown, n = 4000): unknown {
  if (typeof v === 'string') return v.length <= n ? v : `${v.slice(0, n)}... (${v.length - n} more chars)`;
  if (Array.isArray(v)) return v.slice(0, 200).map((x) => clip(x, n));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clip(x, n)]));
  return v;
}

/**
 * The CLI's own "don't ask again" suggestions, rewritten to last only for this
 * session (never written to settings files). Tools other than Bash without a
 * suggestion fall back to allowing the tool by name.
 */
export function sessionGrantFor(tool: string, suggestions: PermissionUpdate[] | undefined): PermissionUpdate[] {
  const out: PermissionUpdate[] = [];
  for (const u of suggestions ?? []) {
    if (u.type === 'addRules' && u.behavior === 'allow') out.push({ ...u, destination: 'session' });
    else if (u.type === 'addDirectories') out.push({ ...u, destination: 'session' });
    else if (u.type === 'setMode' && u.mode === 'acceptEdits') out.push({ ...u, destination: 'session' });
  }
  if (!out.length && tool !== 'Bash') {
    out.push({ type: 'addRules', behavior: 'allow', destination: 'session', rules: [{ toolName: tool }] });
  }
  return out;
}

function ruleString(r: { toolName: string; ruleContent?: string }): string {
  return r.ruleContent ? `${r.toolName}(${r.ruleContent})` : r.toolName;
}

function grantLabels(u: PermissionUpdate): string[] {
  if (u.type === 'addRules') return u.rules.map(ruleString);
  if (u.type === 'addDirectories') return u.directories.map((d) => `files in ${d}`);
  if (u.type === 'setMode') return [`mode ${u.mode}`];
  return [];
}

function grantedRules(grants: PermissionUpdate[]): string[] {
  return grants.flatMap((u) => (u.type === 'addRules' && u.behavior === 'allow' ? u.rules.map(ruleString) : []));
}

function grantedDirs(grants: PermissionUpdate[]): string[] {
  return grants.flatMap((u) => (u.type === 'addDirectories' ? u.directories : []));
}
