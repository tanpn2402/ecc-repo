import type { Issue, MrReview } from "../types";

import { apiClient } from "./client";

export interface FetchSyncedIssuesParams {
  group?: string;
}

export interface CreateReviewRequest {
  gitlabUrls: string[];
  review: string;
}

export type CreateReviewResponse = MrReview[];

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

export async function createMrReview(
  data: CreateReviewRequest,
): Promise<CreateReviewResponse> {
  const response = await fetch("/api/mrs/review", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const message = await response.text();

    throw new Error(message || "Failed to create MR review");
  }

  return response.json();
}
