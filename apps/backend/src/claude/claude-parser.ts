// Parses the line-delimited JSON events produced by
// `claude -p --output-format stream-json --include-partial-messages --verbose`
// into a small normalized event set the rest of the app can consume without
// caring about the exact shape of the underlying Claude Code CLI protocol.

export const TELEGRAM_MAX_MESSAGE_LENGTH = 4096;

export type ClaudeEvent =
  | { kind: 'init'; sessionId: string; cwd: string }
  | { kind: 'text_delta'; text: string }
  | { kind: 'tool_use'; name: string; input: unknown }
  | {
      kind: 'result';
      isError: boolean;
      text: string;
      sessionId: string;
      costUsd?: number;
      durationMs?: number;
      subtype?: string;
      errors: unknown[];
    }
  | { kind: 'malformed'; raw: string }
  | { kind: 'permission_denied'; toolName: string; message: string };

/** Parses one line of CLI stdout. Returns null for blank lines, or a raw parsed object. */
export function parseLine(line: string): any {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch (err: any) {
    return { type: 'malformed', raw: trimmed, parseError: err.message };
  }
}

/**
 * Converts one raw stream-json object into zero or more normalized events:
 *  - { kind: 'init', sessionId, cwd }
 *  - { kind: 'text_delta', text }
 *  - { kind: 'tool_use', name, input }
 *  - { kind: 'result', isError, text, sessionId, costUsd, durationMs, subtype, errors }
 *  - { kind: 'malformed', raw }
 *  - { kind: 'permission_denied', toolName, message }
 */
export function normalizeEvent(raw: any): ClaudeEvent[] {
  if (!raw || typeof raw !== 'object') return [];

  if (raw.type === 'malformed') {
    return [{ kind: 'malformed', raw: raw.raw }];
  }

  if (raw.type === 'system' && raw.subtype === 'init') {
    return [{ kind: 'init', sessionId: raw.session_id, cwd: raw.cwd }];
  }

  if (raw.type === 'system' && raw.subtype === 'permission_denied') {
    return [
      {
        kind: 'permission_denied',
        toolName: raw.tool_name,
        message: raw.message,
      },
    ];
  }

  if (raw.type === 'stream_event' && raw.event) {
    const evt = raw.event;
    if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
      return [{ kind: 'text_delta', text: evt.delta.text || '' }];
    }
    return [];
  }

  if (raw.type === 'assistant' && raw.message?.content) {
    const events: ClaudeEvent[] = [];
    for (const block of raw.message.content) {
      if (block.type === 'tool_use') {
        events.push({ kind: 'tool_use', name: block.name, input: block.input });
      }
    }
    return events;
  }

  if (raw.type === 'result') {
    return [
      {
        kind: 'result',
        isError: Boolean(raw.is_error),
        text: raw.result || '',
        sessionId: raw.session_id,
        costUsd: raw.total_cost_usd,
        durationMs: raw.duration_ms,
        subtype: raw.subtype,
        errors: raw.errors || [],
      },
    ];
  }

  // system/status, system/thinking_tokens, rate_limit_event, user/tool_result, etc.
  // carry no information the Telegram layer needs to react to.
  return [];
}

/**
 * Splits text into chunks that fit within Telegram's message size limit,
 * preferring to break on paragraph/line boundaries before falling back to a
 * hard cut.
 */
export function splitMessage(text: string, maxLen: number = TELEGRAM_MAX_MESSAGE_LENGTH): string[] {
  if (!text) return [''];
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxLen) {
    let cut = remaining.lastIndexOf('\n\n', maxLen);
    if (cut < maxLen * 0.5) cut = remaining.lastIndexOf('\n', maxLen);
    if (cut < maxLen * 0.5) cut = remaining.lastIndexOf(' ', maxLen);
    if (cut < maxLen * 0.5) cut = maxLen;

    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).replace(/^\s+/, '');
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}
