import { atom } from "jotai";
import type { MrSummary } from "../types";

export const mrsAtom = atom<MrSummary[]>([]);
export const selectedMrAtom = atom<string | null>(null);
export const loadingAtom = atom<boolean>(false);
export const reviewingMrIdsAtom = atom<Set<string>>(new Set<string>());
export const connectionStatusAtom = atom<
  "connecting" | "connected" | "disconnected"
>("connecting");

/** Live "tail -f" of Claude's raw streamed output per MR id — never persisted, see mr-logic.js. */
export const consoleOutputAtom = atom<Record<string, string>>({});

export const searchQueryAtom = atom<string>("");
export const statusFilterAtom = atom<string>("All");
export const sortByAtom = atom<"created" | "updated" | "status">("updated");
export const sortOrderAtom = atom<"asc" | "desc">("desc");

///

import type {
  AtlassianIssue,
  Issue,
  MergeRequest,
  ReviewRun,
  Workspace,
} from "../types";

export type SortDir = "asc" | "desc" | null;
export type JiraIssueGroup = "atlassian" | "synced" | string;
export type FlyoutTab = "console" | "detail" | "history";

export interface FlyoutState {
  issueKey: string;
  issueSummary: string;
  mr: MergeRequest;
}

export const jiraIssueGroup = atom<JiraIssueGroup>("synced");

export const syncedStatusFilterAtom = atom<string>("All");
export const atlassianStatusFilterAtom = atom<string>("All");
export const syncedSortAtom = atom<SortDir>(null);
export const atlassianSortAtom = atom<SortDir>(null);

export const syncedExpandedAtom = atom<Record<string, boolean>>({});
export const atlassianExpandedAtom = atom<Record<string, boolean>>({});

/** StatusToolbar's settings popover — project-prefix visibility, shared by both tables. */
export const showReqAtom = atom<boolean>(true);
export const showCoreAtom = atom<boolean>(true);

// Data fetched from the backend (docs/BACKEND_SPEC.md) — see hooks/useJiraIssuesData.ts.
export const atlassianIssuesAtom = atom<AtlassianIssue[]>([]);
export const syncedIssuesAtom = atom<Issue[]>([]);
export const issuesLoadingAtom = atom<boolean>(false);
export const issuesErrorAtom = atom<string | null>(null);

/** Whether each tab's list has been fetched at least once — see hooks/useJiraIssuesData.ts. */
export const atlassianLoadedAtom = atom<boolean>(false);
export const syncedLoadedAtom = atom<boolean>(false);

/** Jira keys with an in-flight POST /api/jira/issues/:key/sync, for a per-row "Syncing…" state. */
export const syncingKeysAtom = atom<Set<string>>(new Set<string>());

/** Jira keys with an in-flight DELETE /api/synced-issues/:key, for the "Done" button's per-row "Removing…" state. */
export const removingKeysAtom = atom<Set<string>>(new Set<string>());

/**
 * mr.mrIds with a review job currently running server-side (stage 5's real
 * async Claude Code job) — driven by jira.review.started/completed/failed
 * over /ws (see hooks/useJiraReviewSocket.ts), optimistically set the
 * moment POST /api/merge-requests/:mrId/review resolves too, so there's no
 * gap before the WS "started" event arrives.
 */
export const activeReviewMrIdsAtom = atom<Set<string>>(new Set<string>());

/** Live "tail -f" of a review's Claude Code output, per mr.mrId — reset on jira.review.started, appended by jira.review.console. Never persisted client-side. */
export const liveConsoleAtom = atom<Record<string, string>>({});

/** The MR a Review/Re-review/Update click is choosing a workspace for — opens ReviewWorkspaceModal. Reuses FlyoutState's shape since Proceed opens/updates the same flyout. */
export const reviewRequestAtom = atom<FlyoutState | null>(null);

/** GET /api/workspaces, fetched once and cached for the "choose a workspace" modal. */
export const workspacesAtom = atom<Workspace[]>([]);
export const workspacesLoadedAtom = atom<boolean>(false);
export const workspacesLoadingAtom = atom<boolean>(false);
export const workspacesErrorAtom = atom<string | null>(null);

export const flyoutAtom = atom<FlyoutState | null>(null);
export const flyoutTabAtom = atom<FlyoutTab>("console");
export const consoleRevealAtom = atom<number>(0);
export const historyExpandedAtom = atom<Record<string, boolean>>({});

/** GET /api/merge-requests/:mrId/reviews, cached per mr.mrId so re-opening the flyout doesn't re-fetch. */
export const mrReviewsAtom = atom<
  Record<string, { latest: ReviewRun | null; history: ReviewRun[] }>
>({});
export const mrReviewsLoadingAtom = atom<boolean>(false);
export const mrReviewsErrorAtom = atom<string | null>(null);

/**
 * GET /api/jira/issues/:key/mrs, cached per issue key — fetched on-demand
 * when a row is expanded in *either* table (see AtlassianIssuesTable,
 * SyncedIssuesTable + hooks/useJiraIssuesData.ts's useIssueMrs). MR data is
 * never persisted or embedded in atlassianIssuesAtom/syncedIssuesAtom, so
 * this is the only place MR rows ever live client-side.
 */
export const issueMrsAtom = atom<Record<string, MergeRequest[]>>({});
export const issueMrsLoadingKeysAtom = atom<Set<string>>(new Set<string>());
export const issueMrsErrorsAtom = atom<Record<string, string>>({});

/** Open/closed state for the "Add Issue" modal — toggled from Header, rendered from JiraIssuesPage. */
export const addIssueModalOpenAtom = atom<boolean>(false);

// === Page routing ===
// No router in this app (see App.tsx) — Sidebar sets this atom on nav click.
export type CurrentPage = "jira-issues" | "gitlab-activities";
export const currentPageAtom = atom<CurrentPage>("jira-issues");

// === GitLab Activities page ===
import type { GitlabActivitiesMeta, GitlabActivity } from "../types";

export const gitlabActivitiesAtom = atom<GitlabActivity[]>([]);
export const gitlabActivitiesLoadingAtom = atom<boolean>(false);
export const gitlabActivitiesErrorAtom = atom<string | null>(null);

/** GET /api/gitlab-activities/meta, fetched once and cached — populates the toolbar's user/type dropdowns. */
export const gitlabActivitiesMetaAtom = atom<GitlabActivitiesMeta>({
  users: [],
  activityTypes: [],
});
export const gitlabActivitiesMetaLoadedAtom = atom<boolean>(false);

/** Empty set means "all" for both — see useGitlabActivitiesData. */
export const gitlabActivitySelectedUserIdsAtom = atom<Set<number>>(
  new Set<number>(),
);
export const gitlabActivitySelectedTypesAtom = atom<Set<string>>(
  new Set<string>(),
);

/** YYYY-MM-DD strings, defaulted to the current week (Mon-Sun) on first load — see useGitlabActivitiesData. */
export const gitlabActivityDateFromAtom = atom<string>("");
export const gitlabActivityDateToAtom = atom<string>("");
