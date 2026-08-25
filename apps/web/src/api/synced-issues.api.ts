import type { Issue } from "../types";

import { apiClient } from "./client";

export interface FetchSyncedIssuesParams {
  group?: string;
}

/**
 * GET /synced-issues
 */
export async function fetchSyncedIssues({
  group,
}: FetchSyncedIssuesParams): Promise<Issue[]> {
  const { data } = await apiClient.get<Issue[]>("/synced-issues", {
    params: { group },
  });

  return data;
}

/**
 * DELETE /synced-issues/:key
 */
export async function removeSyncedIssue(
  key: string,
): Promise<{ ok: true; key: string }> {
  const { data } = await apiClient.delete<{ ok: true; key: string }>(
    `/synced-issues/${encodeURIComponent(key)}`,
  );

  return data;
}
