import * as path from 'node:path';
import type { Attachment, AttachmentChip } from './agent-events';

export const ATTACH_MAX_BYTES = 5 * 1024 * 1024;
const TEXT_EXT = /\.(md|txt|csv|json|log|xml|ya?ml)$/i;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

export class PromptError extends Error {}

export type PromptContent = string | Array<Record<string, unknown>>;

/**
 * User text + attachments -> prompt content. Text files are inlined inside
 * <attachment> tags (history.ts strips them back out), images become image
 * blocks. `context` (backend-added, e.g. Jira cache paths) is wrapped in
 * <ecc-context> so the UI can hide it.
 */
export function buildPrompt(
  text: string,
  attachments: Attachment[],
  context?: string,
): { content: PromptContent; chips: AttachmentChip[] } {
  const body = String(text ?? '').trim();
  const inline: string[] = [];
  const images: Array<Record<string, unknown>> = [];
  const chips: AttachmentChip[] = [];

  for (const a of attachments ?? []) {
    const name = path.basename(String(a?.name || 'file')).slice(0, 120);
    const raw = Buffer.from(String(a?.data ?? ''), 'base64');
    if (raw.length > ATTACH_MAX_BYTES) throw new PromptError(`${name} is larger than 5 MB`);
    if (TEXT_EXT.test(name)) {
      inline.push(`<attachment name="${name.replace(/"/g, '')}">\n${raw.toString('utf8')}\n</attachment>`);
      chips.push({ name, kind: 'text' });
    } else if (IMAGE_TYPES.includes(a.type)) {
      images.push({ type: 'image', source: { type: 'base64', media_type: a.type, data: raw.toString('base64') } });
      chips.push({ name, kind: 'image' });
    } else {
      throw new PromptError(`${name}: only text files (.md, .txt, .csv, .json, .log, .xml, .yml) and images`);
    }
  }
  if (!body && !inline.length && !images.length) throw new PromptError('empty message');

  const parts = [body, ...inline];
  if (context) parts.push(`<ecc-context>\n${context}\n</ecc-context>`);
  const full = parts.filter(Boolean).join('\n\n');
  if (images.length) {
    return { content: [{ type: 'text', text: full || '(see the attached image)' }, ...images], chips };
  }
  return { content: full, chips };
}
