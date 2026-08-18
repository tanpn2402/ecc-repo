import logger from '../common/logger';
import { splitMessage, TELEGRAM_MAX_MESSAGE_LENGTH } from '../claude/claude-parser';
import type { TelegramApi } from './telegram-api';

const NOT_MODIFIED_RE = /message is not modified/i;

// Telegram's "typing..." indicator auto-expires after ~5s of inactivity, so
// it must be refreshed periodically for the duration of a long-running turn.
const TYPING_INTERVAL_MS = 4000;

/**
 * Manages one "live" Telegram message that is progressively edited while
 * Claude streams a response, then finalized (and split across multiple
 * messages if needed) once the turn completes.
 *
 * Edits are throttled to at most once per `editIntervalMs` and skipped
 * entirely when the visible text hasn't changed, to stay well under
 * Telegram's per-chat edit rate limits.
 */
export class StreamingReply {
  private readonly api: TelegramApi;
  private readonly chatId: number | string;
  private readonly editIntervalMs: number;
  private messageId: number | null = null;
  private buffer = '';
  private statusNote = '🤖 Claude is working...';
  private lastSent: string | null = null;
  private dirty = false;
  private timer: NodeJS.Timeout | null = null;
  private typingTimer: NodeJS.Timeout | null = null;

  constructor(api: TelegramApi, chatId: number | string, { editIntervalMs = 1000 }: { editIntervalMs?: number } = {}) {
    this.api = api;
    this.chatId = chatId;
    this.editIntervalMs = editIntervalMs;
  }

  async start(initialText: string = this.statusNote): Promise<void> {
    this.statusNote = initialText;
    this._sendTyping();
    const msg = await this.api.sendMessage(this.chatId, initialText);
    this.messageId = msg.message_id;
    this.lastSent = initialText;
    this.timer = setInterval(() => {
      this._flush().catch((err) => logger.warn('Streaming flush failed', { chatId: this.chatId, error: err.message }));
    }, this.editIntervalMs);
    this.typingTimer = setInterval(() => this._sendTyping(), TYPING_INTERVAL_MS);
  }

  private _sendTyping(): void {
    this.api
      .sendChatAction(this.chatId, 'typing')
      .catch((err: Error) => logger.debug('Failed to send typing indicator', { chatId: this.chatId, error: err.message }));
  }

  private _clearTimers(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.typingTimer) clearInterval(this.typingTimer);
  }

  /** Appends streamed assistant text. */
  addTextDelta(text: string): void {
    if (!text) return;
    this.buffer += text;
    this.dirty = true;
  }

  /** Shows a transient "using tool X" status while no assistant text has arrived yet. */
  noteToolUse(name: string): void {
    if (this.buffer) return; // real content takes priority over tool status
    this.statusNote = `🔧 Using tool: ${name}...`;
    this.dirty = true;
  }

  private _displayText(): string {
    return this.buffer || this.statusNote;
  }

  private async _flush(): Promise<void> {
    if (!this.dirty || !this.messageId) return;
    const full = this._displayText();
    if (full === this.lastSent) {
      this.dirty = false;
      return;
    }
    const preview = truncateForPreview(full);
    this.dirty = false;
    try {
      await this.api.editMessageText(this.chatId, this.messageId, preview);
      this.lastSent = full;
    } catch (err: any) {
      if (NOT_MODIFIED_RE.test(err.message)) return;
      logger.warn('Failed to edit Telegram message', { chatId: this.chatId, error: err.message });
    }
  }

  /** Finalizes the message with the authoritative final text from Claude's result event. */
  async finish(finalText: string, { isError = false }: { isError?: boolean } = {}): Promise<void> {
    this._clearTimers();
    const text = (finalText && finalText.trim()) || this.buffer || (isError ? 'Claude returned an error.' : '(no response)');
    const prefixed = isError ? `⚠️ ${text}` : text;
    const chunks = splitMessage(prefixed);

    await this._safeEdit(chunks[0] || '(empty response)');
    for (let i = 1; i < chunks.length; i++) {
      await this.api.sendMessage(this.chatId, chunks[i]);
    }
  }

  /** Used when the turn fails before any result event was produced. */
  async fail(message: string): Promise<void> {
    this._clearTimers();
    await this._safeEdit(`⚠️ ${message}`);
  }

  private async _safeEdit(text: string): Promise<void> {
    if (!this.messageId) return;
    try {
      await this.api.editMessageText(this.chatId, this.messageId, text);
    } catch (err: any) {
      if (!NOT_MODIFIED_RE.test(err.message)) {
        logger.warn('Failed to finalize Telegram message', { chatId: this.chatId, error: err.message });
      }
    }
  }
}

function truncateForPreview(text: string, maxLen: number = TELEGRAM_MAX_MESSAGE_LENGTH): string {
  if (text.length <= maxLen) return text;
  const suffix = '\n\n… (streaming)';
  return text.slice(0, maxLen - suffix.length) + suffix;
}
