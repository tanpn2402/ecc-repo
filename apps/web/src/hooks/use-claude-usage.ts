import { fetchClaudeUsage } from "@/api/claude.api";
import { useQuery } from "@tanstack/react-query";

export function useClaudeUsage() {
  return useQuery({
    queryKey: ["claude", "usage"],
    queryFn: fetchClaudeUsage,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}
