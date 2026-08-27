export type MrStatus =
  "PENDING" | "REVIEWING" | "READY_TO_MERGE" | "BLOCKED" | "ERROR";

export interface MrSummary {
  id: string;
  gitlabUrl: string;
  gitlabProject: string;
  gitlabMrIid: number;
  jiraId: string | null;
  jiraUrl: string | null;
  jiraTitle: string | null;
  responsible: string | null;
  sprint: string | null;
  author: string | null;
  title: string | null;
  status: MrStatus;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MrReview {
  id: string;
  reviewNumber: number;
  status: string;
  summary: string;
  summaryHtml: string;
  businessUnderstanding: string;
  businessUnderstandingHtml: string;
  technicalAnalysis: string;
  technicalAnalysisHtml: string;
  testAnalysis: string;
  testAnalysisHtml: string;
  findings: string[];
  recommendations: string[];
  /** Claude's full, unedited final message for this run. Always rendered as plain text (never HTML). */
  rawResult: string;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface MrDetail extends MrSummary {
  currentReview: MrReview | null;
}

export type WsEventType =
  | "mr.created"
  | "mr.updated"
  | "mr.review.started"
  | "mr.review.completed"
  | "mr.review.failed"
  | "mr.metadata.started"
  | "mr.metadata.completed"
  | "mr.metadata.failed"
  | "mr.console"; // live Claude output pass-through, see apps/backend/src/mr/review-job-manager.js

export interface WsEvent {
  type: WsEventType;
  payload: any;
}

// === Jira Issues page (docs/BACKEND_SPEC.md) ===
// Backed by GET /api/jira/issues, POST /api/jira/issues/:key/sync,
// GET /api/synced-issues, GET/POST /api/merge-requests/:mrId/... — see
// docs/UI_API_MAPPING.md for the full request/response contract.

export type JiraMrStatus = "REVIEWING" | "PENDING" | "BLOCKED";
export type Priority = "High" | "Medium" | "Low";

export interface MergeRequest {
  id: string;
  /**
   * Pass this (not `id`, the display label like "!1901") to
   * /api/merge-requests/:mrId/... MR data is never persisted server-side —
   * this is the MR's own GitLab URL, base64url-encoded — so it's always
   * present, whether the issue has been synced or not.
   */
  mrId: string;
  url: string;
  author: string;
  avatarInitial: string;
  avatarColorVar: string; // tailwind bg-* class for the avatar
  status: JiraMrStatus;
  state: string;
  createdAt: string;
  lastRun: string;
  actionLabel: "Review" | "Re-review";
}

export interface Issue {
  key: string;
  summary: string;
  labels?: string;
  priority: Priority;
  sprint: string;
  group: string;
  assignee: string;
  avatarInitial: string;
  avatarColorVar: string;
  status: string;
  updated: string;
  // No `mrs` field — GET /api/jira/issues and /api/synced-issues never embed
  // MR data. Fetch it on-demand per issue via GET /api/jira/issues/:key/mrs
  // (see hooks/useJiraIssuesData.ts's useIssueMrs), on row expand.
}

export interface AtlassianIssue extends Issue {
  synced: boolean;
}

export interface ReviewFinding {
  severity: string;
  text: string;
}

/** GET /api/merge-requests/:mrId/reviews -> { latest, history } (BACKEND_SPEC.md §6/§9/§10). */
export interface ReviewRun {
  id: string;
  status: string;
  verdict: string | null;
  summary: string | null;
  findings: ReviewFinding[];
  execBy: string;
  consoleLog: string | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

/** GET /api/workspaces — one entry per configured WORKSPACE_<NAME>, for the "choose a workspace" modal. */
export interface Workspace {
  name: string;
  label: string;
  path: string;
}

// === GitLab Activities page ===
// Backed by GET /api/gitlab-activities/meta, GET /api/gitlab-activities —
// live per-request reads of each GITLAB_ACTIVITY_USERS entry's GitLab
// Events API feed. Nothing here is persisted server-side.

export interface GitlabActivityUser {
  id: number;
  name: string;
}

export interface GitlabActivityTypeOption {
  key: string;
  label: string;
}

export interface GitlabActivitiesMeta {
  users: GitlabActivityUser[];
  activityTypes: GitlabActivityTypeOption[];
}

/** One normalized GitLab event, already classified into a GITLAB_ACTIVITY_TYPES key server-side. */
export interface GitlabActivity {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm:ss
  datetime: string;
  userId: number;
  userName: string;
  type: string;
  typeLabel: string;
  title: string;
}

/**
 * Live jira.review.* events forwarded over /ws (see hooks/useJiraReviewSocket.ts).
 * `jira.review.snapshot` is server -> client only, sent in reply to this
 * client's own `{type: "jira.review.subscribe", mrId}` message (never
 * broadcast) — see requestLiveConsoleSnapshot.
 */
export type JiraReviewWsEventType =
  | "jira.review.started"
  | "jira.review.console"
  | "jira.review.completed"
  | "jira.review.failed"
  | "jira.review.snapshot";

export interface JiraReviewWsEvent {
  type: JiraReviewWsEventType;
  payload: {
    mrId: string;
    reviewId?: string;
    chunk?: string;
    review?: ReviewRun;
    error?: string;
    consoleLog?: string;
  };
}

export interface JiraMeta {
  groups: { id: string; name: string }[];
}

export interface ClaudeUsageLimit {
  utilization: number;
  resetsAt: string;
}

export interface ClaudeUsage {
  fiveHour: ClaudeUsageLimit | null;
  sevenDay: ClaudeUsageLimit | null;
}

export interface OpsProject {
  optId: string;
  valueId: string;
  name: string;
}

export interface OpsImportActivity extends GitlabActivity {
  jiraId: string;
  effort: number;
  opsProjectValueId: string | null;
  opsProjectOptId: string | null;
}
