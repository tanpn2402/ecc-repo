import { useQuery } from "@tanstack/react-query";

import {
  fetchGitlabActivities,
  fetchGitlabActivitiesMeta,
  type FetchGitlabActivitiesParams,
} from "../api/gitlab.api";

export function useGitlabActivitiesMeta() {
  return useQuery({
    queryKey: ["gitlab", "activities", "meta"],
    queryFn: fetchGitlabActivitiesMeta,
  });
}

export function useGitlabActivities(params: FetchGitlabActivitiesParams) {
  return useQuery({
    queryKey: ["gitlab", "activities", params],
    queryFn: () => fetchGitlabActivities(params),
  });
}
