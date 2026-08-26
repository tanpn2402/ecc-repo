import { OpsProject } from "@/types";
import { apiClient } from "./client";

export async function fetchOpsProjects(): Promise<OpsProject[]> {
  const { data } = await apiClient.get<OpsProject[]>("/ops/projects");

  return data;
}
