import type { ClaudeEvent } from '../claude/claude-parser';

/**
 * Converts one normalized Claude event (see claude/claude-parser.ts) into the
 * text chunk to append to the live console. Port of
 * apps/webapps/src/lib/mr-logic.js's formatConsoleChunk (the MR Management
 * feature's client-side formatter for raw Claude events) — done server-side
 * here since this page emits pre-formatted chunks over the WebSocket instead
 * of raw events, so the frontend doesn't need its own copy of Claude's event
 * shapes. Event kinds this app has no use for showing live (the final
 * "result", malformed lines) render as ''.
 */
export function formatConsoleChunk(evt: ClaudeEvent): string {
  if (!evt || !evt.kind) return '';
  switch (evt.kind) {
    case 'init':
      return '▸ Claude session started\n';
    case 'text_delta':
      return evt.text || '';
    case 'tool_use':
      return `\n▸ ${evt.name}(${JSON.stringify(evt.input ?? {})})\n`;
    case 'permission_denied':
      return `\n▸ permission denied: ${evt.toolName}\n`;
    default:
      return '';
  }
}

export default formatConsoleChunk;
