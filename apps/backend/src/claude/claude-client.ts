import { ClaudeProcess } from './claude-process';
import logger from '../common/logger';
import type { AppConfig } from '../config/configuration';

export interface ClaudeRunOptions {
  cwd: string;
  prompt: string;
  resumeSessionId?: string | null;
}

export interface ClaudeRunHandlers {
  onEvent?: (evt: any) => void;
}

/**
 * Runs Claude Code CLI invocations on behalf of Telegram chats and MR jobs
 * (keyed by `mr:<id>`, never colliding with a numeric Telegram chat id — see
 * MrService). Shared as a single instance across both TelegramModule and
 * MrModule (see claude.module.ts), exactly like the single ClaudeClient
 * instance index.js used to construct once and pass to both consumers.
 *
 * - Maintains a strict per-key queue: a second prompt for the same key waits
 *   for the first to finish rather than racing it (prevents two concurrent
 *   CLI invocations from corrupting the same Claude session).
 * - Tracks the currently running child process per key so `/stop` can kill
 *   exactly that chat's process and no other's.
 *
 * `sessionManager` is accepted for constructor-shape parity with the
 * pre-migration ClaudeClient (which also never used it internally) — kept
 * as an unused parameter rather than changed, per the migration's
 * preserve-behavior-exactly mandate.
 */
export class ClaudeClient {
  private readonly config: AppConfig;
  private readonly sessionManager: unknown;
  readonly activeProcesses = new Map<string | number, ClaudeProcess>();
  private readonly queues = new Map<string | number, Promise<any>>();

  constructor(config: AppConfig, sessionManager?: unknown) {
    this.config = config;
    this.sessionManager = sessionManager;
  }

  isRunning(chatId: string | number): boolean {
    return this.activeProcesses.has(chatId);
  }

  stop(chatId: string | number): boolean {
    const proc = this.activeProcesses.get(chatId);
    if (!proc) return false;
    proc.kill('SIGTERM');
    return true;
  }

  /**
   * Queues a prompt for the given chat/job key. `handlers.onEvent(normalizedEvent)`
   * is invoked for every streamed event. Resolves with the final result
   * event, or rejects on spawn error / timeout / non-zero exit without a
   * result event.
   */
  run(chatId: string | number, { cwd, prompt, resumeSessionId }: ClaudeRunOptions, handlers: ClaudeRunHandlers = {}) {
    const previous = this.queues.get(chatId) || Promise.resolve();
    const task = previous
      .catch(() => {}) // don't let a prior failure poison the queue
      .then(() => this._runNow(chatId, { cwd, prompt, resumeSessionId }, handlers));
    this.queues.set(chatId, task);
    return task;
  }

  private _runNow(
    chatId: string | number,
    { cwd, prompt, resumeSessionId }: ClaudeRunOptions,
    handlers: ClaudeRunHandlers
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const proc = new ClaudeProcess({
        command: this.config.claude.command,
        cwd,
        prompt,
        resumeSessionId,
        permissionMode: this.config.claude.permissionMode,
        model: this.config.claude.model,
        timeoutMs: this.config.claude.timeoutMs,
      });

      this.activeProcesses.set(chatId, proc);
      let resultEvent: any = null;
      let sawTimeout = false;

      proc.on('event', (evt) => {
        if (evt.kind === 'result') resultEvent = evt;
        try {
          handlers.onEvent?.(evt);
        } catch (err: any) {
          logger.error('onEvent handler threw', { chatId, error: err.message });
        }
      });

      proc.on('stderr', (chunk: string) => {
        logger.debug('claude stderr', { chatId, chunk: chunk.slice(0, 500) });
      });

      proc.on('timeout', () => {
        sawTimeout = true;
        logger.warn('Claude process timed out', { chatId });
      });

      proc.on('error', (err: Error) => {
        this.activeProcesses.delete(chatId);
        reject(err);
      });

      proc.on('exit', ({ code, signal, killed }: { code: number | null; signal: string | null; killed: boolean }) => {
        this.activeProcesses.delete(chatId);
        if (resultEvent) {
          resolve({ ...resultEvent, killed, sawTimeout });
          return;
        }
        if (killed) {
          resolve({
            kind: 'result',
            isError: true,
            text: sawTimeout ? 'Claude process timed out.' : 'Claude process was stopped.',
            killed: true,
            sawTimeout,
          });
          return;
        }
        reject(new Error(`Claude process exited (code=${code}, signal=${signal}) without a result`));
      });

      proc.start();
    });
  }
}
