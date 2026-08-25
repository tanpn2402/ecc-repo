import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchMrReviews, triggerReview } from "../api/merge-requests.api";

export function useMrReviews(mrId: string) {
  return useQuery({
    queryKey: ["merge-request-reviews", mrId],
    queryFn: () => fetchMrReviews(mrId),
    enabled: !!mrId,
  });
}

export function useTriggerReview() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ mrId, workspace }: { mrId: string; workspace: string }) =>
      triggerReview(mrId, workspace),

    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["merge-request-reviews", variables.mrId],
      });
    },
  });
}
