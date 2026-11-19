// Shapes of the Analysis API (apps/backend/src/analysis) and of the thread messages.
// UiMessage / Part match apps/backend/src/agent/history.ts: a thread read back from the
// transcript and one built from live events (reduce.ts) render alike.

export interface AnalysisStatus {
  sdkVersion: string | null;
  sdkError: string | null;
  fake: boolean;
  login: {
    ok: boolean;
    method: string | null;
    detail: string;
    plan?: string | null;
  };
  liveThreads: number;
  maxLive: number;
  roots: string[];
  jiraEnabled: boolean;
  /** Jira project keys that become clickable in the chat (and are auto-cached). */
  jiraPrefixes: string[];
  jiraDir: string;
  defaultModel: string;
}

export interface Workspace {
  id: number;
  name: string;
  path: string;
  contextMd: string;
  exists: boolean;
  branch: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Thread {
  sessionId: string;
  workspaceId: number;
  title: string;
  cwd: string;
  addDirs: string[];
  model: string;
  started: boolean;
  turns: number;
  costUsd: number;
  lastBranch: string | null;
  createdAt: string;
  updatedAt: string;
  running: boolean;
  live: boolean;
  cwdMissing: boolean;
}

/** One event of a thread (`ai:event`), see apps/backend/src/agent/agent-events.ts. */
export interface AiEvent {
  sid?: string;
  id: number;
  type: string;
  t?: string;
  [k: string]: unknown;
}

/** A file or image the user attached in a thread (GET /analysis/threads/:sid/attachments). */
export interface ThreadAttachment {
  index: number;
  /** Position of its user message among the thread's user messages (0-based). */
  message: number;
  messageText: string;
  name: string;
  kind: "text" | "image";
  /** Characters of a text file, bytes of an image. */
  size: number;
  text?: string;
  truncated?: boolean;
  url?: string;
}

export interface ThreadDetail {
  thread: Thread;
  messages: UiMessage[];
  events: AiEvent[];
  lastEventId: number;
  jiraKeys: string[];
  /** Rules granted with "always allow in this session". */
  grants: string[];
  approveMode: ApproveMode;
}

/**
 * How tool calls are approved (backend: agent-events.ts): manual asks for each,
 * edits approves file edits inside the thread's folders, auto approves all
 * (the Bash guard and Claude's questions still apply).
 */
export type ApproveMode = "manual" | "edits" | "auto";

export interface Question {
  question: string;
  header: string;
  multiSelect: boolean;
  options: { label: string; description?: string }[];
}

export type ToolResult = { text: string; images: string[] };

export type Part =
  | { type: "text"; key: string; text: string }
  | { type: "thinking"; key: string; text: string }
  | {
      type: "tool";
      id: string;
      name: string;
      input: Record<string, unknown>;
      status: "running" | "done" | "error" | "unknown";
      result?: ToolResult;
    }
  | {
      type: "permission";
      requestId: string;
      tool: string;
      input: Record<string, unknown>;
      title: string | null;
      description: string | null;
      blockedPath: string | null;
      /** Rules "always allow in this session" would grant; null when not offered. */
      alwaysAllow: string[] | null;
      status: "pending" | "allowed" | "allowed_session" | "denied" | "expired";
      message?: string;
    }
  | {
      type: "question";
      requestId: string;
      questions: Question[];
      status: "pending" | "answered" | "denied" | "expired";
      answers?: Record<string, string>;
    }
  | {
      type: "jira";
      key: string;
      summary: string;
      status: string;
      attachments: number;
    }
  | { type: "notice"; level: "info" | "warning" | "error"; text: string };

export interface TurnResult {
  subtype: string;
  costUsd: number | null;
  numTurns: number;
  durationMs: number;
  isError: boolean;
}

export interface UiMessage {
  id: string;
  role: "user" | "assistant" | "notice";
  text?: string;
  attachments?: { name: string; kind: "text" | "image" }[];
  parts?: Part[];
  level?: "info" | "warning" | "error";
  result?: TurnResult;
}

export interface Attachment {
  name: string;
  type: string;
  data: string;
}

export interface DirEntry {
  name: string;
  path: string;
  git: boolean;
  branch: string | null;
}

export interface DirListing {
  path: string | null;
  parent: string | null;
  roots: string[];
  git: boolean;
  branch: string | null;
  dirs: DirEntry[];
  truncated: boolean;
}

export interface CachedJira {
  key: string;
  summary: string;
  status: string;
  type: string;
  url: string;
  fetchedAt: string;
  attachments: {
    id: string;
    filename: string;
    file: string | null;
    size: number;
    mimeType: string;
    skipped?: string;
  }[];
  linkedKeys: string[];
  markdown: string | null;
}

/** Live summary of an issue, for the popup on a key in the chat. */
export interface JiraPreview {
  key: string;
  summary: string;
  status: string;
  statusCategory: "new" | "indeterminate" | "done" | string | null;
  type: string;
  priority: string | null;
  assignee: string | null;
  reporter: string | null;
  created: string | null;
  updated: string | null;
  labels: string[];
  fixVersions: string[];
  parent: { key: string; summary: string } | null;
  description: string;
  url: string;
  cached: boolean;
}

/** Socket ack of the /analysis namespace. */
export type Ack<T = object> =
  ({ ok: true } & T) | { ok: false; error: string; code: string };
