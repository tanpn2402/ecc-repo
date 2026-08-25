const JIRA_ID_PATTERN = /\b(?:CORE|REQ|ECHNL)-\d+\b/;

export function extractJiraId(title = ""): string | null {
  return title.match(JIRA_ID_PATTERN)?.[0] ?? null;
}
