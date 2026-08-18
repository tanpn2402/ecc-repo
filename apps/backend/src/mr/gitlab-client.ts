// Backend-only GitLab REST client. Fetches MR title/author directly from
// Node — the token never reaches Claude, and Claude's review prompt never
// asks it to touch the GitLab API itself, so a review Skill that also calls
// GitLab internally can never cause this data to be fetched twice.

import logger from "@/common/logger";

export interface FetchMrMetadataParams {
  gitlabUrl: string;
  gitlabProject: string;
  gitlabMrIid: string | number;
}

export interface GitlabMrInfo {
  title: string;
  author: string;
  description: string;
  sourceBranch: string;
  targetBranch: string;
  createdAt: string | null;
  state: string; // opened | merged | closed
}

export interface FetchUserEventsParams {
  baseUrl: string;
  userId: number;
  after?: string; // YYYY-MM-DD
  before?: string; // YYYY-MM-DD
}

/** Raw shape returned by GET /api/v4/users/:id/events — only the fields the activities mapper reads. */
export interface GitlabRawEvent {
  id: number;
  project_id: number;
  action_name: string;
  target_type: string | null;
  target_title: string | null;
  author_id: number;
  author?: { id?: number; username?: string; name?: string };
  created_at: string;
  push_data?: {
    commit_title?: string | null;
    action?: string;
    ref_type?: string;
    ref?: string;
  };
  note?: { body?: string };
}

const EVENTS_PER_PAGE = 100;
const EVENTS_MAX_PAGES = 10;

export class GitlabClient {
  token: string;

  constructor(token = '') {
    this.token = token;
  }

  /**
   * Fetches one MR's title/author/description/branches/state (opened |
   * merged | closed). description/sourceBranch are used to identify the
   * linked Jira issue (see jira-id-extract.js) without asking Claude to do
   * it; the REVIEWING/PENDING/BLOCKED mapping off of `state` lives in
   * jira-issues.service.ts/jira-mapping.ts, this just surfaces the raw
   * GitLab state. Throws on any non-2xx response or network failure.
   */
  async fetchMr({ gitlabUrl, gitlabProject, gitlabMrIid }: FetchMrMetadataParams): Promise<GitlabMrInfo> {
    const host = new URL(gitlabUrl).host;
    const projectId = encodeURIComponent(gitlabProject);
    const url = `https://${host}/api/v4/projects/${projectId}/merge_requests/${gitlabMrIid}`;

    logger.info("Fetching GitLab MR data", { gitlabUrl, url });

    const res = await fetch(url, {
      headers: this.token ? { 'PRIVATE-TOKEN': this.token } : {},
    });
    if (!res.ok) {
      throw new Error(`GitLab API returned ${res.status} for ${gitlabProject}!${gitlabMrIid}`);
    }
    const body: any = await res.json();
    logger.info("Fetched GitLab MR data", { body });

    return {
      title: typeof body.title === 'string' ? body.title : '',
      author: body.author && typeof body.author.username === 'string' ? body.author.username : '',
      description: typeof body.description === 'string' ? body.description : '',
      sourceBranch: typeof body.source_branch === 'string' ? body.source_branch : '',
      targetBranch: typeof body.target_branch === 'string' ? body.target_branch : '',
      createdAt: typeof body.created_at === 'string' ? body.created_at : null,
      state: typeof body.state === 'string' ? body.state : 'opened',
    };
  }

  /**
   * Fetches one user's GitLab contribution events (GET
   * /api/v4/users/:id/events), paginated up to EVENTS_MAX_PAGES pages (i.e.
   * EVENTS_PER_PAGE * EVENTS_MAX_PAGES events) — a safety cap for the
   * GitLab Activities page's live per-request fetch, since a very active
   * user + wide date range could otherwise page forever. Throws on any
   * non-2xx response, same as fetchMr.
   */
  async fetchUserEvents({ baseUrl, userId, after, before }: FetchUserEventsParams): Promise<GitlabRawEvent[]> {
    const host = new URL(baseUrl).host;
    const events: GitlabRawEvent[] = [];

    for (let page = 1; page <= EVENTS_MAX_PAGES; page++) {
      const url = new URL(`https://${host}/api/v4/users/${userId}/events`);
      url.searchParams.set('per_page', String(EVENTS_PER_PAGE));
      url.searchParams.set('page', String(page));
      if (after) url.searchParams.set('after', after);
      if (before) url.searchParams.set('before', before);

      const res = await fetch(url, {
        headers: this.token ? { 'PRIVATE-TOKEN': this.token } : {},
      });
      if (!res.ok) {
        throw new Error(`GitLab API returned ${res.status} for user ${userId} events`);
      }
      const body: any = await res.json();
      const pageEvents: GitlabRawEvent[] = Array.isArray(body) ? body : [];
      events.push(...pageEvents);

      if (pageEvents.length < EVENTS_PER_PAGE) break;
      if (page === EVENTS_MAX_PAGES) {
        logger.warn('GitLab events pagination cap reached', { userId, page, after, before });
      }
    }

    return events;
  }
}

export default GitlabClient;
