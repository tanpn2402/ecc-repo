import type { ReviewRun } from "../types";

import { apiClient } from "./client";

export interface MrReviews {
  latest: ReviewRun | null;
  history: ReviewRun[];
}

export interface TriggerReviewRequest {
  mrId: string;
  workspace: string;
  jiraKey: string;
  devFeedback: string | undefined;
}

/**
 * GET /api/merge-requests/:mrId/reviews
 */
export async function fetchMrReviews(mrId: string): Promise<MrReviews> {
  const { data } = await apiClient.get<MrReviews>(
    `/merge-requests/${encodeURIComponent(mrId)}/reviews`,
  );

  return data;
}

/**
 * POST /api/merge-requests/:mrId/review
 */
export async function triggerReview({
  mrId,
  jiraKey,
  workspace,
  devFeedback,
}: TriggerReviewRequest): Promise<ReviewRun> {
  const { data } = await apiClient.post<ReviewRun>(
    `/merge-requests/${encodeURIComponent(mrId)}/review`,
    {
      workspace,
      jiraKey,
      devFeedback,
    },
  );

  return data;
}
