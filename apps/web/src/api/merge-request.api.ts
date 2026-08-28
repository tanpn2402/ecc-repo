import { MergeRequest } from "@/types";
import { apiClient } from "./client";

export async function fetchMergeRequests(): Promise<MergeRequest[]> {
  const response = await apiClient.get<MergeRequest[]>("/mrs");

  return response.data;
}
