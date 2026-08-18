import { parseGitlabMrUrl, MrUrlError, ParsedGitlabMrUrl } from './gitlab-url';
import type { JiraRemoteLink } from './jira-client';

/**
 * Filters a Jira issue's remote links down to the ones that are GitLab
 * merge request URLs (BACKEND_SPEC.md §3: "match gitlab.tx-tech.com/.../
 * merge_requests/<mr-id>, capture <mr-id>"). Reuses the same validated
 * parser `parseGitlabMrUrl` already uses for user-submitted MR URLs
 * (mr.controller.ts) instead of a second hand-rolled regex — it already
 * handles arbitrary-depth namespaces and the allow-listed host check the
 * spec's example regex calls out as something to "adjust" per deployment.
 */
export function extractGitlabMrLinks(
  remoteLinks: JiraRemoteLink[],
  allowedHosts: Set<string>
): ParsedGitlabMrUrl[] {
  const results: ParsedGitlabMrUrl[] = [];
  for (const link of remoteLinks) {
    try {
      results.push(parseGitlabMrUrl(link.url, allowedHosts));
    } catch (err) {
      if (err instanceof MrUrlError) continue; // not a GitLab MR link, or wrong host
      throw err;
    }
  }
  return results;
}

export default extractGitlabMrLinks;
