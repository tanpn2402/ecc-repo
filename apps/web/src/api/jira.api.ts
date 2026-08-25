import type { AtlassianIssue, Issue, JiraMeta, MergeRequest } from "../types";

import { apiClient } from "./client";

export interface UpdateIssueRequest {
  id: string;
  group: string;
}

export interface SyncIssueRequest {
  key: string;
  group: string;
}

export interface AddIssueRequest {
  input: string;
  group: string;
}

/**
 * GET /jira/issues
 *
 * Live view of the Jira project.
 */
export async function fetchAtlassianIssues(): Promise<AtlassianIssue[]> {
  const { data } = await apiClient.get<AtlassianIssue[]>("/jira/issues");

  return data;
}

/**
 * GET /jira/issues/:key/mrs
 *
 * Live, read-only preview of the GitLab MRs linked
 * to an issue's Jira remote links.
 */
export async function fetchIssueMrs(key: string): Promise<MergeRequest[]> {
  const { data } = await apiClient.get<MergeRequest[]>(
    `/jira/issues/${encodeURIComponent(key)}/mrs`,
  );

  return data;
}

/**
 * POST /jira/issues/:key/sync
 *
 * One-way copy into the in-house DB.
 */
export async function syncIssue({
  key,
  group,
}: SyncIssueRequest): Promise<Issue> {
  const { data } = await apiClient.post<Issue>(
    `/jira/issues/${encodeURIComponent(key)}/sync`,
    {
      group,
    },
  );

  return data;
}

/**
 * POST /jira/issues/add
 *
 * Add/sync an issue from either a Jira issue key
 * or a full Jira issue URL.
 */
export async function addIssue({input, group}: AddIssueRequest): Promise<Issue> {
  const { data } = await apiClient.post<Issue>("/jira/issues/add", {
    input,
    group
  });

  return data;
}

/**
 * GET /jira/meta
 *
 * Groups and other metadata for the Jira Issues page.
 */
export async function fetchJiraMetadata(): Promise<JiraMeta> {
  const { data } = await apiClient.get<JiraMeta>(`/jira/meta`);

  return data;
}

/**
 * PUT /jira/issues/:id
 *
 * Update Jira Issue
 */
export async function updateIssue({
  id,
  group,
}: UpdateIssueRequest): Promise<Issue> {
  const { data } = await apiClient.put<Issue>(
    `/jira/issues/${encodeURIComponent(id)}`,
    {
      group,
    },
  );
  return data;
}
