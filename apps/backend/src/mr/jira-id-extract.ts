// Extracts a Jira issue key (e.g. "CORE-1234") from GitLab MR text, without
// asking Claude to do it — used only at MR-creation time, before any Claude
// invocation happens, so we can look up the linked Jira issue via the REST
// API regardless of whether a review ever runs. Matches case-insensitively
// (branch names are often lowercase, e.g. "feature/core-1234-fix") and
// normalizes to uppercase, since Jira issue keys are conventionally
// uppercase and the Jira REST API accepts either case.
const JIRA_ID_PATTERN = /\b([A-Za-z][A-Za-z0-9]{1,9}-\d+)\b/;

/**
 * Returns the first Jira issue key found across the given texts, checked in
 * order (e.g. title, then description, then branch name) — or null if none
 * match. Never guesses beyond this pattern match.
 */
export function extractJiraId(...texts: Array<string | null | undefined>): string | null {
  for (const text of texts) {
    if (!text) continue;
    const match = String(text).match(JIRA_ID_PATTERN);
    if (match) return match[1].toUpperCase();
  }
  return null;
}

export default extractJiraId;
