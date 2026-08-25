import type { Workspace } from "../types";

import { apiClient } from "./client";

/**
 * GET /api/workspaces
 */
export async function fetchWorkspaces(): Promise<Workspace[]> {
  const { data } = await apiClient.get<Workspace[]>("/workspaces");

  return data;
}
