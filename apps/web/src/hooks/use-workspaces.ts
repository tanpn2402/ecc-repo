import { useQuery } from "@tanstack/react-query";

import { fetchWorkspaces } from "@/api/workspaces.api";

export function useWorkspaces() {
  return useQuery({
    queryKey: ["workspaces"],
    queryFn: fetchWorkspaces,
  });
}
