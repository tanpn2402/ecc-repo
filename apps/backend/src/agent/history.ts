import type { AttachmentChip } from './agent-events';
import { type ImageSink, toolResultContent } from './message-mapper';
import type { SessionMessage } from './sdk';

/**
 * UI message shapes shared with the web (apps/web/src/features/analysis/types.ts).
 * The web reducer builds the same shapes from live events, so a thread read
 * back from the transcript and one that is streaming render alike.
 */
export type UiPart =
  | { type: 'text'; key: string; text: string }
  | { type: 'thinking'; key: string; text: string }
  | {
      type: 'tool';
      id: string;
      name: string;
      input: unknown;
      status: 'running' | 'done' | 'error' | 'unknown';
      result?: { text: string; images: string[] };
    };

export interface UiMessage {
  id: string;
  role: 'user' | 'assistant' | 'notice';
  text?: string;
  attachments?: AttachmentChip[];
  parts?: UiPart[];
  level?: 'info' | 'warning' | 'error';
}

/** Inlined text attachments are wrapped like this in the prompt (see prompt.ts). */
export const ATTACHMENT_RE = /\n*<attachment name="([^"]+)">\n[\s\S]*?\n<\/attachment>/g;
/** Context the backend appends to a user prompt (Jira cache paths); hidden in the UI. */
export const ECC_CONTEXT_RE = /\n*<ecc-context>[\s\S]*?<\/ecc-context>/g;

function userText(content: unknown): { text: string; attachments: AttachmentChip[] } {
  if (typeof content === 'string') return { text: content, attachments: [] };
  const texts: string[] = [];
  const attachments: AttachmentChip[] = [];
  for (const c of (Array.isArray(content) ? content : []) as any[]) {
    if (c?.type === 'text') texts.push(String(c.text ?? ''));
    else if (c?.type === 'image') attachments.push({ name: 'image', kind: 'image' });
  }
  return { text: texts.join('\n'), attachments };
}

/** Transcript entries (getSessionMessages) -> UI messages. Port of history() in swing-probe's ai.py. */
export function transcriptToUiMessages(
  entries: SessionMessage[],
  storeImage: ImageSink,
  opts: { running: boolean },
): UiMessage[] {
  const out: UiMessage[] = [];
  const tools = new Map<string, Extract<UiPart, { type: 'tool' }>>();

  for (const e of entries) {
    if (e.parent_tool_use_id) continue;
    const content = (e.message as any)?.content;

    if (e.type === 'user') {
      if (Array.isArray(content) && content.some((c: any) => c?.type === 'tool_result')) {
        for (const c of content as any[]) {
          const part = tools.get(c?.tool_use_id);
          if (!part) continue;
          part.status = c.is_error ? 'error' : 'done';
          part.result = toolResultContent(c.content, storeImage);
        }
        continue;
      }
      const { text: raw, attachments } = userText(content);
      const chips: AttachmentChip[] = [...raw.matchAll(ATTACHMENT_RE)].map((m) => ({ name: m[1], kind: 'text' }));
      const text = raw.replace(ATTACHMENT_RE, '').replace(ECC_CONTEXT_RE, '').trim();
      if (!text && !chips.length && !attachments.length) continue;
      out.push({ id: e.uuid, role: 'user', text, attachments: [...chips, ...attachments] });
      continue;
    }

    if (e.type === 'assistant') {
      let m = out[out.length - 1];
      if (!m || m.role !== 'assistant') {
        m = { id: e.uuid, role: 'assistant', parts: [] };
        out.push(m);
      }
      const blocks: any[] = Array.isArray(content) ? content : [{ type: 'text', text: content }];
      blocks.forEach((c, i) => {
        if (c?.type === 'text' && c.text) {
          m.parts!.push({ type: 'text', key: `${e.uuid}:${i}`, text: c.text });
        } else if (c?.type === 'tool_use') {
          const part = { type: 'tool' as const, id: c.id, name: c.name, input: c.input, status: 'running' as const };
          m.parts!.push(part);
          tools.set(c.id, part);
        }
      });
    }
  }

  if (!opts.running) {
    for (const p of tools.values()) if (p.status === 'running') p.status = 'unknown';
  }
  return out.filter((m) => m.role !== 'assistant' || m.parts!.length > 0);
}

/** An attachment the user sent in a thread, read back from the transcript. */
export interface ThreadAttachment {
  /** Position among the thread's attachments (stable: the transcript only grows). */
  index: number;
  /** Position of the user message it came with among the thread's user messages (0-based). */
  message: number;
  /** Start of that message's text, to recognise it. */
  messageText: string;
  name: string;
  kind: 'text' | 'image';
  /** Characters of a text file, bytes of an image. */
  size: number;
  /** Text files: the content (cut at ATTACHMENT_TEXT_MAX). */
  text?: string;
  truncated?: boolean;
  /** Images: URL the web loads it from. */
  url?: string;
}

export const ATTACHMENT_TEXT_MAX = 200_000;
const ATTACHMENT_CONTENT_RE = /<attachment name="([^"]+)">\n([\s\S]*?)\n<\/attachment>/g;

/**
 * Every attachment of the thread's user messages. Messages are counted like
 * transcriptToUiMessages counts them, so `message` points at the same bubble.
 * Images lose their file name in the prompt, so they are named image-<n>.
 */
export function transcriptAttachments(entries: SessionMessage[], storeImage: ImageSink): ThreadAttachment[] {
  const out: ThreadAttachment[] = [];
  let message = -1;
  let images = 0;
  for (const e of entries) {
    if (e.parent_tool_use_id || e.type !== 'user') continue;
    const content = (e.message as any)?.content;
    if (Array.isArray(content) && content.some((c: any) => c?.type === 'tool_result')) continue;
    const { text: raw, attachments: imageChips } = userText(content);
    const texts = [...raw.matchAll(ATTACHMENT_CONTENT_RE)];
    const text = raw.replace(ATTACHMENT_RE, '').replace(ECC_CONTEXT_RE, '').trim();
    if (!text && !texts.length && !imageChips.length) continue;
    message += 1;
    const messageText = text.slice(0, 120);
    for (const m of texts) {
      const body = m[2];
      out.push({
        index: out.length,
        message,
        messageText,
        name: m[1],
        kind: 'text',
        size: body.length,
        text: body.slice(0, ATTACHMENT_TEXT_MAX),
        ...(body.length > ATTACHMENT_TEXT_MAX ? { truncated: true } : {}),
      });
    }
    for (const c of (Array.isArray(content) ? content : []) as any[]) {
      if (c?.type !== 'image' || !c.source?.data) continue;
      const mediaType = String(c.source.media_type ?? 'image/png');
      images += 1;
      out.push({
        index: out.length,
        message,
        messageText,
        name: `image-${images}.${mediaType.split('/')[1] ?? 'png'}`,
        kind: 'image',
        size: Math.floor((String(c.source.data).length * 3) / 4),
        url: storeImage(c.source.data, mediaType),
      });
    }
  }
  return out;
}
