// Parses and validates Jira issue URLs.
//
// The URL is untrusted input coming from the web UI. It is never passed to a
// shell and never used to build a filesystem path directly — only its
// validated host/project/key fields are used, and only the original,
// re-validated URL string is ever embedded (as inert data) in a Claude prompt.

export class JiraUrlError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'JiraUrlError';
    this.code = code;
  }
}

const ISSUE_KEY_RE = /^[A-Z][A-Z0-9_]*-\d+$/;

export interface ParsedJiraUrl {
  host: string;
  projectKey: string;
  issueNumber: number;
  issueKey: string;
  canonicalUrl: string;
}

/**
 * Parses a Jira issue URL of the form:
 *   https://<host>/browse/<PROJECT>-<number>
 *
 * `allowedHosts` is a Set of lowercase hostnames; only these are accepted.
 *
 * Returns { host, projectKey, issueNumber, issueKey, canonicalUrl }
 * or throws JiraUrlError.
 */
export function parseJiraUrl(rawUrl: string, allowedHosts: Set<string>): ParsedJiraUrl {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new JiraUrlError('INVALID_URL', 'URL is required');
  }

  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new JiraUrlError('INVALID_URL', 'Not a valid URL');
  }

  if (url.protocol !== 'https:') {
    throw new JiraUrlError('INVALID_URL', 'Only https:// URLs are accepted');
  }

  const host = url.hostname.toLowerCase();

  if (!allowedHosts || !allowedHosts.has(host)) {
    throw new JiraUrlError(
      'HOST_NOT_ALLOWED',
      `Jira host "${host}" is not in the allow-list`,
    );
  }

  const match = url.pathname.match(/^\/browse\/([A-Za-z][A-Za-z0-9_]*-\d+)\/?$/);

  if (!match) {
    throw new JiraUrlError(
      'INVALID_URL',
      'URL does not look like a Jira issue URL',
    );
  }

  const issueKey = match[1].toUpperCase();

  if (!ISSUE_KEY_RE.test(issueKey)) {
    throw new JiraUrlError(
      'INVALID_ISSUE_KEY',
      'Jira issue key is invalid',
    );
  }

  const separatorIndex = issueKey.lastIndexOf('-');
  const projectKey = issueKey.slice(0, separatorIndex);
  const issueNumberStr = issueKey.slice(separatorIndex + 1);
  const issueNumber = Number(issueNumberStr);

  if (!Number.isSafeInteger(issueNumber) || issueNumber <= 0) {
    throw new JiraUrlError(
      'INVALID_ISSUE_NUMBER',
      'Jira issue number must be a positive integer',
    );
  }

  const canonicalUrl = `https://${host}/browse/${issueKey}`;

  return {
    host,
    projectKey,
    issueNumber,
    issueKey,
    canonicalUrl,
  };
}

export default parseJiraUrl;
