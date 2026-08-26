import { ClaudeUsage } from "@/types";
import { apiClient } from "./client";

/**
 * GET /api/claude/usage
 *
 * Current Claude Code 5-hour and 7-day usage.
 */
export async function fetchClaudeUsage(): Promise<ClaudeUsage> {
  const { data } = await apiClient.get<ClaudeUsage>("/claude/usage");

  return data;
}
