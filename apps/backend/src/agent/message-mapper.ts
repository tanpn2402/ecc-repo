import type { AgentEventInput } from './agent-events';
import type { SDKMessage } from './sdk';

/** Tool result text kept in events / history. */
export const TOOL_TEXT_MAX = 20_000;

/** Stores a base64 image of a tool result; returns the URL the web loads it from. */
export type ImageSink = (base64: string, mediaType: string) => string;

export interface ToolResultContent {
  text: string;
  images: string[];
}

/** Tool result content (string or content blocks) -> text + image URLs. */
export function toolResultContent(content: unknown, storeImage: ImageSink): ToolResultContent {
  if (content == null) return { text: '', images: [] };
  if (typeof content === 'string') return { text: content.slice(0, TOOL_TEXT_MAX), images: [] };
  if (!Array.isArray(content)) return { text: JSON.stringify(content).slice(0, TOOL_TEXT_MAX), images: [] };
  const texts: string[] = [];
  const images: string[] = [];
  for (const block of content as any[]) {
    if (!block || typeof block !== 'object') continue;
    if (block.type === 'text') texts.push(String(block.text ?? ''));
    else if (block.type === 'image') {
      const data = block.source?.data ?? block.data;
      if (data) images.push(storeImage(data, block.source?.media_type ?? block.mimeType ?? 'image/png'));
    }
  }
  return { text: texts.join('\n').slice(0, TOOL_TEXT_MAX), images };
}

/**
 * Turns the SDK message stream of one session into AgentEvents. Stateful (the
 * id of the message being streamed, which messages arrived as deltas), so one
 * instance per session. Port of Session.on_message in swing-probe's ai.py.
 *
 * - Text and thinking arrive as deltas keyed "<messageId>:<blockIndex>"; a
 *   complete assistant text that was not streamed becomes `text_set`.
 * - Subagent internals (parent_tool_use_id set) are dropped, except their
 *   tool calls which keep `parent` so the web can ignore or nest them.
 */
export class MessageMapper {
  private currentMessageId: string | null = null;
  private streamed = new Set<string>();

  constructor(private readonly storeImage: ImageSink) {}

  /** Call at the start of every turn. */
  reset(): void {
    this.currentMessageId = null;
    this.streamed.clear();
  }

  map(msg: SDKMessage): AgentEventInput[] {
    const m = msg as any;
    const parent: string | null = m.parent_tool_use_id ?? null;

    switch (m.type) {
      case 'stream_event': {
        if (parent) return [];
        const ev = m.event ?? {};
        if (ev.type === 'message_start') {
          this.currentMessageId = ev.message?.id ?? null;
          return [];
        }
        if (ev.type !== 'content_block_delta') return [];
        const key = `${this.currentMessageId}:${ev.index}`;
        const delta = ev.delta ?? {};
        if (delta.type === 'text_delta' && delta.text) {
          if (this.currentMessageId) this.streamed.add(this.currentMessageId);
          return [{ type: 'text', key, delta: delta.text }];
        }
        if (delta.type === 'thinking_delta' && delta.thinking) {
          return [{ type: 'thinking', key, delta: delta.thinking }];
        }
        return [];
      }

      case 'system': {
        if (m.subtype === 'init') {
          return [
            {
              type: 'init',
              model: m.model,
              cwd: m.cwd,
              permissionMode: m.permissionMode,
              mcpServers: m.mcp_servers,
            },
          ];
        }
        if (m.subtype === 'compact_boundary') {
          return [{ type: 'notice', level: 'info', text: 'Context compacted' }];
        }
        return [];
      }

      case 'assistant': {
        const content: any[] = Array.isArray(m.message?.content) ? m.message.content : [];
        const messageId: string = m.message?.id ?? m.uuid;
        const out: AgentEventInput[] = [];
        content.forEach((block, i) => {
          if (block.type === 'tool_use') {
            out.push({ type: 'tool_use', toolId: block.id, name: block.name, input: block.input, parent });
          } else if (!parent && block.type === 'text' && block.text && !this.streamed.has(messageId)) {
            out.push({ type: 'text_set', key: `${messageId}:a${i}`, text: block.text });
          }
        });
        if (!parent && m.error) out.push({ type: 'notice', level: 'error', text: `API error: ${m.error}` });
        return out;
      }

      case 'user': {
        const content = m.message?.content;
        if (!Array.isArray(content)) return [];
        return content
          .filter((b: any) => b?.type === 'tool_result')
          .map((b: any) => ({
            type: 'tool_result' as const,
            toolUseId: b.tool_use_id,
            isError: !!b.is_error,
            parent,
            ...toolResultContent(b.content, this.storeImage),
          }));
      }

      case 'result':
        return [
          {
            type: 'result',
            subtype: m.subtype,
            isError: !!m.is_error,
            numTurns: m.num_turns,
            durationMs: m.duration_ms,
            costUsd: m.total_cost_usd ?? null,
            usage: m.usage,
            errors: m.errors,
            denials: Array.isArray(m.permission_denials) ? m.permission_denials.length : 0,
          },
        ];

      case 'rate_limit_event': {
        const status = m.rate_limit_info?.status;
        return status && status !== 'allowed'
          ? [{ type: 'notice', level: 'warning', text: `Rate limit: ${status}` }]
          : [];
      }

      default:
        return [];
    }
  }
}
