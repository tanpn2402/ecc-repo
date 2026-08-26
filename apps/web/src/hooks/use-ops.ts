import { fetchOpsProjects } from "@/api/ops.api";
import { useQuery } from "@tanstack/react-query";

export function useOpsProjects() {
  return useQuery({
    queryKey: ["ops", "projects"],
    queryFn: fetchOpsProjects,
  });
}
