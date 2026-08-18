// Parses and validates GitLab merge request URLs.
//
// The URL is untrusted input coming from the web UI. It is never passed to a
// shell and never used to build a filesystem path directly — only its
// validated host/project/iid fields are used, and only the original,
// re-validated URL string is ever embedded (as inert data) in a Claude
// prompt.

export class MrUrlError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'MrUrlError';
    this.code = code;
  }
}

const IID_RE = /^\d+$/;

export interface ParsedGitlabMrUrl {
  host: string;
  projectPath: string;
  iid: number;
  canonicalUrl: string;
}

/**
 * Parses a GitLab merge request URL of the form:
 *   https://<host>/<namespace>/<project>/-/merge_requests/<iid>
 * where <namespace>/<project> may contain nested groups.
 *
 * `allowedHosts` is a Set of lowercase hostnames; only these are accepted.
 *
 * Returns { host, projectPath, iid, canonicalUrl } or throws MrUrlError.
 */
export function parseGitlabMrUrl(rawUrl: string, allowedHosts: Set<string>): ParsedGitlabMrUrl {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new MrUrlError('INVALID_URL', 'URL is required');
  }

  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new MrUrlError('INVALID_URL', 'Not a valid URL');
  }

  if (url.protocol !== 'https:') {
    throw new MrUrlError('INVALID_URL', 'Only https:// URLs are accepted');
  }

  const host = url.hostname.toLowerCase();
  if (!allowedHosts || !allowedHosts.has(host)) {
    throw new MrUrlError('HOST_NOT_ALLOWED', `GitLab host "${host}" is not in the allow-list`);
  }

  const match = url.pathname.match(/^\/(.+)\/-\/merge_requests\/(\d+)\/?$/);
  if (!match) {
    throw new MrUrlError('INVALID_URL', 'URL does not look like a GitLab merge request URL');
  }

  const projectPath = match[1].replace(/\.git$/, '');
  const iidStr = match[2];
  if (!IID_RE.test(iidStr)) {
    throw new MrUrlError('INVALID_IID', 'Merge request IID must be numeric');
  }
  const iid = Number(iidStr);
  if (!Number.isSafeInteger(iid) || iid <= 0) {
    throw new MrUrlError('INVALID_IID', 'Merge request IID must be a positive integer');
  }

  if (!/^[A-Za-z0-9._/-]+$/.test(projectPath) || projectPath.includes('..')) {
    throw new MrUrlError('INVALID_URL', 'Project path contains invalid characters');
  }

  const canonicalUrl = `https://${host}/${projectPath}/-/merge_requests/${iid}`;

  return { host, projectPath, iid, canonicalUrl };
}

export default parseGitlabMrUrl;
