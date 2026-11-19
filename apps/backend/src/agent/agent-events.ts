/**
 * Events of one agent session, as sent to the web on the `ai:event` socket
 * event (see analysis.gateway.ts) and replayed from events.ndjson.
 *
 * Every event has a per-session, strictly increasing `id`; a client that
 * reconnects asks for the events after the last id it saw. The web reducer
 * (apps/web/src/features/analysis/reduce.ts) is the other half of this
 * contract: add a type here, add a case there.
 */
export type AgentEventType =
  | 'user'
  | 'init'
  | 'branch'
  | 'text'
  | 'text_set'
  | 'thinking'
  | 'tool_use'
  | 'tool_result'
  | 'permission_request'
  | 'question'
  | 'permission_resolved'
  /** The thread's approve mode changed: { mode: ApproveMode }. */
  | 'approve_mode'
  | 'jira_cached'
  | 'notice'
  | 'error'
  | 'result'
  | 'done';

export interface AgentEvent {
  id: number;
  type: AgentEventType;
  /** ISO timestamp. */
  t: string;
  [key: string]: unknown;
}

/** An event before the session numbers it. */
export type AgentEventInput = { type: AgentEventType } & Record<string, unknown>;

/**
 * How tool calls that need permission are handled (like Claude Desktop):
 * manual asks for each one, edits approves file edits inside the thread's
 * folders, auto approves everything. The Bash guard (git push, reset --hard,
 * rm -rf, ...) and AskUserQuestion apply in every mode.
 */
export type ApproveMode = 'manual' | 'edits' | 'auto';
export const APPROVE_MODES: readonly ApproveMode[] = ['manual', 'edits', 'auto'];

export type TurnStatus = 'done' | 'error' | 'stopped';

/** One user attachment as sent by the web (base64). */
export interface Attachment {
  name: string;
  type: string;
  data: string;
}

/** Attachment chip shown on a user message. */
export interface AttachmentChip {
  name: string;
  kind: 'text' | 'image';
}
