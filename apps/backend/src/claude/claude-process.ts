import { spawn, ChildProcess } from 'node:child_process';
import * as readline from 'node:readline';
import { EventEmitter } from 'node:events';
import { parseLine, normalizeEvent } from './claude-parser';
import logger from '../common/logger';

export interface ClaudeProcessOptions {
  command: string;
  cwd: string;
  prompt: string;
  resumeSessionId?: string | null;
  permissionMode?: string;
  model?: string;
  timeoutMs?: number;
}

/**
 * Spawns `claude -p ...` for a single prompt/turn and streams normalized
 * events back via an EventEmitter. The prompt is always passed as a single
 * argv element (spawn with shell:false) so Telegram-controlled text is never
 * interpreted by a shell.
 *
 * Emits:
 *  - 'event'  (normalizedEvent)
 *  - 'stderr' (string)
 *  - 'exit'   ({ code, signal })
 *  - 'timeout'
 *  - 'error'  (Error)   -- spawn-level failure (e.g. binary not found)
 */
export class ClaudeProcess extends EventEmitter {
  command: string;
  cwd: string;
  prompt: string;
  resumeSessionId: string | null;
  permissionMode?: string;
  model?: string;
  timeoutMs?: number;
  child: ChildProcess | null = null;
  private _killed = false;
  private _timeoutHandle: NodeJS.Timeout | undefined;

  constructor({ command, cwd, prompt, resumeSessionId, permissionMode, model, timeoutMs }: ClaudeProcessOptions) {
    super();
    this.command = command;
    this.cwd = cwd;
    this.prompt = prompt;
    this.resumeSessionId = resumeSessionId || null;
    this.permissionMode = permissionMode;
    this.model = model;
    this.timeoutMs = timeoutMs;
  }

  buildArgs(): string[] {
    const args = ['-p', this.prompt, '--output-format', 'stream-json', '--verbose', '--include-partial-messages'];
    if (this.resumeSessionId) {
      args.push('--resume', this.resumeSessionId);
    }
    if (this.permissionMode) {
      args.push('--permission-mode', this.permissionMode);
    }
    if (this.model) {
      args.push('--model', this.model);
    }
    return args;
  }

  start(): this {
    const args = this.buildArgs();
    logger.debug('Spawning claude process', { cwd: this.cwd, resumeSessionId: this.resumeSessionId });

    let child: ChildProcess;
    try {
      child = spawn(this.command, args, {
        cwd: this.cwd,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      this.emit('error', err);
      return this;
    }

    this.child = child;

    child.on('error', (err) => {
      // e.g. ENOENT if the claude binary isn't installed/on PATH
      this.emit('error', err);
    });

    const rl = readline.createInterface({ input: child.stdout! });
    rl.on('line', (line) => {
      const raw = parseLine(line);
      if (raw === null) return;
      for (const evt of normalizeEvent(raw)) {
        this.emit('event', evt);
      }
    });

    let stderrBuf = '';
    child.stderr!.on('data', (chunk) => {
      stderrBuf += chunk.toString();
      this.emit('stderr', chunk.toString());
    });

    if (this.timeoutMs && this.timeoutMs > 0) {
      this._timeoutHandle = setTimeout(() => {
        this._killed = true;
        this.emit('timeout');
        this.kill('SIGTERM');
      }, this.timeoutMs);
    }

    child.on('close', (code, signal) => {
      clearTimeout(this._timeoutHandle);
      this.emit('exit', { code, signal, killed: this._killed, stderr: stderrBuf });
    });

    return this;
  }

  kill(signal: NodeJS.Signals = 'SIGTERM'): void {
    if (this.child && !this.child.killed) {
      this._killed = true;
      this.child.kill(signal);
    }
  }
}
