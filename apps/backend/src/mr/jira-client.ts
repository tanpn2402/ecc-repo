// Backend-only Jira REST client (Jira Cloud API v3). Fetches one issue's
// title, "Responsible" custom field, and current Sprint directly from Node
// at MR-creation time — never via Claude/an MCP server. Field ids for
// custom fields vary per Jira site, so this resolves them by their display

import logger from '../common/logger';

// name (via `expand=names`) rather than hardcoding a customfield_XXXXX id.

export interface JiraClientOptions {
  baseUrl?: string;
  email?: string;
  apiToken?: string;
}

export interface JiraIssue {
  id: string;
  url: string;
  title: string;
  responsible: string | null;
  sprint: string | null;
}

export interface JiraSearchIssue {
  key: string;
  url: string;
  summary: string;
  priority: string | null;
  sprint: string | null;
  assignee: string | null;
  status: string;
  updated: string;
  createdAt: string;
}

export interface JiraRemoteLink {
  url: string;
  title: string | null;
}

export class JiraClient {
  baseUrl: string;
  email: string;
  apiToken: string;

  constructor({ baseUrl, email, apiToken }: JiraClientOptions = {}) {
    this.baseUrl = String(baseUrl || '').replace(/\/+$/, '');
    this.email = email || '';
    this.apiToken = apiToken || '';
  }

  _authHeader(): Record<string, string> {
    if (!this.email || !this.apiToken) return {};
    const basic = Buffer.from(`${this.email}:${this.apiToken}`).toString(
      'base64',
    );
    return { Authorization: `Basic ${basic}` };
  }

  /**
   * Runs a JQL search (BACKEND_SPEC.md §3: `project=CORE order by updated
   * desc`) and maps each result to the fields the "Jira Issues" page needs:
   * key, summary, priority, sprint (resolved by display name the same way
   * fetchIssue() does), assignee, status, updated. Jira Cloud caps `search`
   * at 100 results per page; this fetches up to `maxResults` in one page,
   * which is enough for a single Jira project's live board view.
   */
  async searchIssues(
    jql: string,
    { maxResults = 100 }: { maxResults?: number } = {},
  ): Promise<JiraSearchIssue[]> {
    const url = `${this.baseUrl}/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&maxResults=${maxResults}&expand=names&fields=summary,priority,assignee,status,updated,*navigable`;
    const headers = this._authHeader();

    logger.info('[searchIssues] Headers', headers);
    logger.info('[searchIssues] Url', { url });

    const res = await fetch(url, {
      headers: { ...headers, Accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`Jira API returned ${res.status} for search "${jql}"`);
    }
    const body: any = await res.json();
    logger.info('[searchIssues] Response body', { body });
    const names = body.names || {};
    const sprintFieldId = findFieldIdByName(names, 'Sprint');
    const responsibleFieldId = findFieldIdByName(names, 'Responsible');

    return (body.issues || []).map((issue: any) => {
      const fields = issue.fields || {};
      return {
        key: issue.key,
        url: `${this.baseUrl}/browse/${issue.key}`,
        summary: typeof fields.summary === 'string' ? fields.summary : '',
        priority: fields.priority?.name ?? null,
        sprint: sprintFieldId
          ? extractSprintValue(fields[sprintFieldId])
          : null,
        assignee: responsibleFieldId
          ? extractResponsibleValue(fields[responsibleFieldId])
          : (fields.assignee?.displayName ?? null),
        status: fields.status?.name ?? '',
        updated: typeof fields.updated === 'string' ? fields.updated : '',
        createdAt: typeof fields.created === 'string' ? fields.created : '',
      };
    });
  }

  /**
   * Fetches remote links attached to one issue (BACKEND_SPEC.md §3/§4) —
   * used to find candidate GitLab MR URLs. Returns every link's URL/title
   * unfiltered; callers apply the GitLab-MR regex (see remote-link-extract.ts).
   */
  async fetchRemoteLinks(issueKey: string): Promise<JiraRemoteLink[]> {
    const url = `${this.baseUrl}/rest/api/3/issue/${encodeURIComponent(issueKey)}/remotelink`;
    const res = await fetch(url, {
      headers: { ...this._authHeader(), Accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error(
        `Jira API returned ${res.status} for ${issueKey} remote links`,
      );
    }
    const body: any = await res.json();
    return (Array.isArray(body) ? body : [])
      .map((link: any) => ({
        url: link?.object?.url,
        title: link?.object?.title ?? null,
      }))
      .filter(
        (link: JiraRemoteLink) =>
          typeof link.url === 'string' && link.url.length > 0,
      );
  }
}

function findFieldIdByName(
  names: Record<string, any>,
  targetName: string,
): string | null {
  for (const [id, name] of Object.entries(names)) {
    if (name === targetName) return id;
  }
  return null;
}

/** Handles the common Jira custom-field value shapes: plain string, user picker, single-select. */
function extractTextValue(value: any): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value !== 'object') return null;
  if (typeof value.displayName === 'string') return value.displayName; // user picker
  if (typeof value.value === 'string') return value.value; // single-select
  if (typeof value.name === 'string') return value.name;
  return null;
}

function extractResponsibleValue(value: any): string | null {
  if (value == null) return null;
  const arr = Array.isArray(value) ? value : [value];
  return arr.map(extractTextValue).filter(Boolean).join(', ') || null;
}

/** The Sprint field is an array of sprint objects/strings; the last entry is the most recent/current sprint. */
function extractSprintValue(value: any): string | null {
  if (value == null) return null;
  const arr = Array.isArray(value) ? value : [value];
  const last = arr[arr.length - 1];
  if (last == null) return null;
  if (typeof last === 'object' && typeof last.name === 'string')
    return last.name;
  if (typeof last === 'string') {
    // Classic (non-Cloud-v3) Jira sometimes serializes this as a raw string
    // like "com.atlassian.greenhopper...[id=1,...,name=Sprint 5,...]".
    const match = last.match(/name=([^,\]]+)/);
    return match ? match[1] : last;
  }
  return null;
}

export default JiraClient;
