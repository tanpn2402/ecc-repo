import { parseJiraUrl, JiraUrlError } from '../mr/jira-url';

// Manual "Add Issue" input, untrusted (typed by hand in a web form). Never
// passed to a shell or used to build a filesystem path — only the resulting
// issue key (letters/digits/underscore plus a numeric suffix) is ever used,
// as a JQL literal and as a REST path segment, both of which re-validate it.
const ISSUE_KEY_RE = /^[A-Za-z][A-Za-z0-9_]*-\d+$/;

export class JiraIssueInputError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'JiraIssueInputError';
    this.code = code;
  }
}

/**
 * Accepts either a bare Jira issue key ("CORE-123", "REQ-456") or a full
 * issue URL ("https://tx-tech.atlassian.net/browse/CORE-123") and returns
 * the normalized, uppercased issue key. Throws JiraIssueInputError on
 * anything else (empty input, malformed URL, disallowed host, bad key
 * shape) — never guesses or silently drops part of the input.
 */
export function parseJiraIssueInput(raw: string, allowedHosts: Set<string>): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) {
    throw new JiraIssueInputError('EMPTY_INPUT', 'Enter a Jira issue key or URL');
  }

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      return parseJiraUrl(trimmed, allowedHosts).issueKey;
    } catch (err) {
      if (err instanceof JiraUrlError) {
        throw new JiraIssueInputError(err.code, err.message);
      }
      throw err;
    }
  }

  const upper = trimmed.toUpperCase();
  if (!ISSUE_KEY_RE.test(upper)) {
    throw new JiraIssueInputError('INVALID_ISSUE_KEY', 'Enter a Jira issue key like CORE-123, or a full issue URL');
  }
  return upper;
}

export default parseJiraIssueInput;
