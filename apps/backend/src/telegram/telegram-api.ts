import logger from "../common/logger";
import { toTelegramHtml } from "./format";

const API_ROOT = "https://api.telegram.org";
const CANT_PARSE_ENTITIES_RE = /can't parse entities/i;

export class TelegramApiError extends Error {
  method: string;
  errorCode?: number;
  description: string;

  constructor(method: string, description: string, errorCode?: number) {
    super(
      `Telegram API error in ${method}: ${description} (code ${errorCode})`,
    );
    this.method = method;
    this.errorCode = errorCode;
    this.description = description;
  }
}

export interface TelegramApiOptions {
  fetchImpl?: typeof fetch;
  maxRetries?: number;
}

/**
 * Minimal wrapper over the Telegram Bot HTTP API using the platform fetch
 * implementation. Handles 429 rate limiting with a bounded retry/backoff so
 * callers don't need to reason about Telegram's flood control themselves.
 *
 * Deliberately a plain, non-DI-decorated class (constructed via a factory
 * provider in telegram.module.ts) so it stays exactly as easy to unit test
 * with a fake fetchImpl as it was before the NestJS migration.
 */
export class TelegramApi {
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;
  private readonly maxRetries: number;

  constructor(
    token: string,
    { fetchImpl = fetch, maxRetries = 3 }: TelegramApiOptions = {},
  ) {
    this.token = token;
    this.fetchImpl = fetchImpl;
    this.maxRetries = maxRetries;
  }

  async call(
    method: string,
    params: Record<string, unknown> = {},
    { timeoutMs = 35000 }: { timeoutMs?: number } = {},
  ): Promise<any> {
    const url = `${API_ROOT}/bot${this.token}/${method}`;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await this.fetchImpl(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params),
          signal: controller.signal,
        });
        clearTimeout(timer);

        const body: any = await res.json().catch(() => null);

        if (res.status === 429 || body?.error_code === 429) {
          const retryAfter = body?.parameters?.retry_after ?? 1;
          logger.warn("Telegram rate limited request", {
            method,
            retryAfter,
            attempt,
          });
          await sleep((retryAfter + 0.2) * 1000);
          continue;
        }

        if (!body || body.ok !== true) {
          throw new TelegramApiError(
            method,
            body?.description || "unknown error",
            body?.error_code,
          );
        }

        return body.result;
      } catch (err: any) {
        clearTimeout(timer);
        if (err.name === "AbortError") {
          if (attempt < this.maxRetries) {
            logger.warn("Telegram request timed out, retrying", {
              method,
              attempt,
            });
            continue;
          }
          throw new Error(`Telegram API request to ${method} timed out`);
        }
        if (err instanceof TelegramApiError) throw err;
        // Network-level errors: retry with a short backoff.
        if (attempt < this.maxRetries) {
          logger.warn("Telegram network error, retrying", {
            method,
            attempt,
            error: err.message,
          });
          await sleep(500 * (attempt + 1));
          continue;
        }
        throw err;
      }
    }
    throw new Error(
      `Telegram API call to ${method} failed after ${this.maxRetries} retries`,
    );
  }

  getUpdates({
    offset,
    timeout = 30,
    allowedUpdates,
  }: { offset?: number; timeout?: number; allowedUpdates?: string[] } = {}) {
    return this.call(
      "getUpdates",
      { offset, timeout, allowed_updates: allowedUpdates },
      { timeoutMs: (timeout + 10) * 1000 },
    );
  }

  sendMessage(
    chatId: number | string,
    text: string,
    options: Record<string, unknown> = {},
  ) {
    return this._sendFormatted(
      "sendMessage",
      { chat_id: chatId },
      text,
      options,
    );
  }

  editMessageText(
    chatId: number | string,
    messageId: number,
    text: string,
    options: Record<string, unknown> = {},
  ) {
    return this._sendFormatted(
      "editMessageText",
      { chat_id: chatId, message_id: messageId },
      text,
      options,
    );
  }

  /**
   * Sends/edits a message, formatting `text` as Telegram HTML by default so
   * Claude's markdown-ish output (headers, **bold**, `code`, fenced code
   * blocks, links) renders properly instead of showing raw markdown syntax.
   * Pass `{ parse_mode: null }` to opt a specific call out of formatting.
   * If Telegram still rejects the resulting HTML (an edge case our
   * converter's regexes didn't anticipate), we retry once as plain text
   * rather than losing the message.
   */
  private async _sendFormatted(
    method: string,
    baseParams: Record<string, unknown>,
    text: string,
    options: Record<string, unknown>,
  ) {
    const mode =
      options.parse_mode === undefined
        ? "HTML"
        : (options.parse_mode as string | null);
    const params: Record<string, unknown> = { ...baseParams, ...options };
    if (mode) {
      params.parse_mode = mode;
    } else {
      delete params.parse_mode;
    }
    const payloadText = mode === "HTML" ? toTelegramHtml(text) : text;

    try {
      return await this.call(method, { ...params, text: payloadText });
    } catch (err) {
      if (
        mode === "HTML" &&
        err instanceof TelegramApiError &&
        CANT_PARSE_ENTITIES_RE.test(err.description)
      ) {
        logger.warn(
          "Telegram rejected HTML formatting, resending as plain text",
          { method, error: err.description },
        );
        const fallbackParams = { ...params };
        delete fallbackParams.parse_mode;
        return this.call(method, { ...fallbackParams, text });
      }
      throw err;
    }
  }

  sendChatAction(chatId: number | string, action: string) {
    return this.call("sendChatAction", { chat_id: chatId, action });
  }

  getFile(fileId: string) {
    return this.call("getFile", { file_id: fileId });
  }

  async downloadFile(filePath: string): Promise<Buffer> {
    const url = `${API_ROOT}/file/bot${this.token}/${filePath}`;
    const res = await this.fetchImpl(url);
    if (!res.ok) {
      throw new Error(
        `Failed to download Telegram file (status ${res.status})`,
      );
    }
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
