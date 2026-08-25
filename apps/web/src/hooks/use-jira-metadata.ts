import { useQuery } from "@tanstack/react-query";

import { fetchJiraMetadata } from "../api/jira.api";

export function useJiraMetadata() {
  return useQuery({
    queryKey: ["jira", "metadata"],
    queryFn: fetchJiraMetadata,
  });
}
