import type { GitlabActivitiesMeta, GitlabActivity } from "../types";

import { apiClient } from "./client";

/**
 * GET /api/gitlab-activities/meta
 *
 * Configured users + activity types for the activity filters.
 */
export async function fetchGitlabActivitiesMeta(): Promise<GitlabActivitiesMeta> {
  const { data } = await apiClient.get<GitlabActivitiesMeta>(
    "/gitlab-activities/meta",
  );

  return data;
}

export interface FetchGitlabActivitiesParams {
  userIds: number[];
  types: string[];
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
}

/**
 * GET /api/gitlab-activities
 *
 * Live GitLab activity fetch, sorted descending by datetime server-side.
 */
export async function fetchGitlabActivities({
  userIds,
  types,
  from,
  to,
}: FetchGitlabActivitiesParams): Promise<GitlabActivity[]> {
  const { data } = await apiClient.get<GitlabActivity[]>(
    "/gitlab-activities",
    {
      params: {
        userIds: userIds.length ? userIds.join(",") : undefined,
        types: types.length ? types.join(",") : undefined,
        from,
        to,
      },
    },
  );

  return data;
}
