import type { GitlabMrInfo } from '../mr/gitlab-client';

export type IssueStatus = 'To Do' | 'In Progress' | 'In Review' | 'Done';
export type Priority = 'High' | 'Medium' | 'Low';
export type MrStatus = 'REVIEWING' | 'PENDING' | 'BLOCKED';

/**
 * Maps a Jira status name to the frontend's 4-bucket IssueStatus. Jira's
 * own 3 status *categories* (new/indeterminate/done) don't have a distinct
 * "In Review" bucket, so status names containing "review" are special-cased
 * first; everything else falls back to the category. Unknown/missing
 * category defaults to "To Do" rather than throwing, since a live Jira
 * project can have custom workflow statuses this mapping wasn't written
 * against.
 */
export function mapJiraStatus(statusName: string, categoryKey?: string | null): IssueStatus {
  const lower = (statusName || '').toLowerCase();
  if (lower.includes('review')) return 'In Review';
  switch (categoryKey) {
    case 'done':
      return 'Done';
    case 'indeterminate':
      return 'In Progress';
    case 'new':
    default:
      return 'To Do';
  }
}

/** Maps Jira's 5-level priority scale down to the frontend's 3 buckets. */
export function mapJiraPriority(priorityName: string | null): Priority {
  const lower = (priorityName || '').toLowerCase();
  if (lower === 'highest' || lower === 'high') return 'High';
  if (lower === 'low' || lower === 'lowest') return 'Low';
  return 'Medium';
}

/**
 * REVIEWING/PENDING/BLOCKED mapping. REVIEWING is never derived from GitLab
 * itself — it means a Claude Code review job is actually running/queued for
 * this MR right now (see JiraIssuesService.buildMrDto, which passes
 * isReviewing from the latest jira_review_runs row). Otherwise the status
 * just reflects GitLab's own MR state directly:
 *   - opened or merged -> PENDING (merged has nothing left to review;
 *     MrStatus has no "done" bucket, so this is the closest "no action
 *     needed" state)
 *   - closed (rejected/abandoned without merging) -> BLOCKED
 */
export function mapGitlabStateToMrStatus(gitlabState: GitlabMrInfo['state'], isReviewing: boolean): MrStatus {
  if (isReviewing) return 'REVIEWING';
  return gitlabState === 'closed' ? 'BLOCKED' : 'PENDING';
}

const AVATAR_PALETTE = [
  'bg-accent-fg',
  'bg-emerald-300',
  'bg-amber-300',
  'bg-red-300',
  'bg-blue-300',
  'bg-purple-300',
  'bg-teal-300',
  'bg-pink-300',
] as const;

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** First letter of a display name, uppercased — "?" when there is none. */
export function avatarInitial(name: string | null | undefined): string {
  const trimmed = (name || '').trim();
  return trimmed ? trimmed[0].toUpperCase() : '?';
}

/** Deterministic tailwind bg-* class per name, so the same person always gets the same color. */
export function avatarColorVar(name: string | null | undefined): string {
  const key = (name || '').trim() || 'unknown';
  return AVATAR_PALETTE[hashString(key) % AVATAR_PALETTE.length];
}

/** Coarse "Xh ago"/"Xd ago" relative-time formatting for the Updated/Last Run columns. */
export function formatRelativeTime(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const diffMs = now - then;
  if (diffMs < 0) return 'just now';
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatMrId(gitlabMrIid: number): string {
  return `!${gitlabMrIid}`;
}

/**
 * MR data is never persisted (see jira-issues.repository.ts docblock), so
 * there's no row id to use as the `:mrId` path param for
 * /api/merge-requests/:mrId/... . Instead, the param is the MR's own
 * canonical GitLab URL, base64url-encoded into one URL-safe path segment
 * (no `/` or `+` to worry about escaping, unlike encodeURIComponent). This
 * is fully self-describing and needs no DB lookup to resolve — decode it,
 * validate the host, and you have everything needed to re-resolve the MR.
 */
export function encodeMrId(gitlabUrl: string): string {
  return Buffer.from(gitlabUrl, 'utf8').toString('base64url');
}

/** Inverse of encodeMrId. Returns null (never throws) for a malformed/garbage param. */
export function decodeMrId(mrId: string): string | null {
  try {
    const url = Buffer.from(mrId, 'base64url').toString('utf8');
    return url.startsWith('https://') ? url : null;
  } catch {
    return null;
  }
}
