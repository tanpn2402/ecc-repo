import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { socket } from "@/api/socket.api";
import { JiraMrStatus, MergeRequest, ReviewRun } from "@/types";
import { decodeMrId } from "@/utils/jira.utils";
import { formatRelativeTime } from "@/utils/datetime.utils";
import { MrReviews } from "@/api/merge-requests.api";

export function useSocket() {
  const queryClient = useQueryClient();

  useEffect(() => {
    socket.connect();

    const unsubscribeStarted = socket.on<{ mrId: string; jiraKey: string }>(
      "jira.review.started",
      (payload) => {
        console.log("[WS] jira.review.started", payload);

        const mrId = decodeMrId(payload.mrId);
        console.log("[WS] jira.review.started", mrId);

        queryClient.setQueryData<MergeRequest[]>(
          ["jira", "issues", payload.jiraKey, "mrs"],
          (mrs) => {
            console.log("[WS] jira.review.started", mrs);
            if (!mrs) {
              return mrs;
            }

            const updatedMrs = mrs.map((mr) =>
              mr.url === mrId
                ? {
                    ...mr,
                    status: "REVIEWING" as JiraMrStatus,
                    lastRun: "Running...",
                  }
                : mr,
            );

            return updatedMrs;
          },
        );
      },
    );

    const unsubscribeCompleted = socket.on<{
      mrId: string;
      jiraKey: string;
      review: ReviewRun;
    }>("jira.review.completed", (payload) => {
      console.log("[WS] jira.review.completed", payload);

      queryClient.setQueryData<MergeRequest[]>(
        ["jira", "issues", payload.jiraKey, "mrs"],
        (mrs) => {
          console.log("[WS] jira.review.completed", mrs);
          if (!mrs) {
            return mrs;
          }

          const when = formatRelativeTime(
            payload.review.completedAt || payload.review.createdAt,
          );

          const updatedMrs = mrs.map((mr) =>
            mr.mrId === payload.mrId
              ? {
                  ...mr,
                  status: "PENDING" as JiraMrStatus,
                  lastRun:
                    payload.review.status === "failed"
                      ? `Failed ${when}`
                      : `${payload.review.verdict || "Reviewed"} ${when}`,
                }
              : mr,
          );

          return updatedMrs;
        },
      );

      queryClient.setQueryData<MrReviews>(
        ["merge-request-reviews", payload.mrId],
        (mrReview) => {
          console.log("[WS] jira.review.completed", mrReview);
          if (!mrReview) {
            return mrReview;
          }

          return {
            latest: payload.review,
            history: mrReview.history.map((history) =>
              payload.review.id === history.id ? payload.review : history,
            ),
          };
        },
      );
    });

    const unsubscribeConsole = socket.on<{
      mrId: string;
      chunk: string;
      reviewId: string;
    }>("jira.review.console", (payload) => {
      console.log("[WS] jira.review.console", payload);

      queryClient.setQueryData<MrReviews>(
        ["merge-request-reviews", payload.mrId],
        (mrReview) => {
          console.log("[WS] jira.review.console", mrReview);
          if (!mrReview) {
            return mrReview;
          }

          return {
            latest:
              payload.reviewId === mrReview.latest?.id
                ? {
                    ...mrReview.latest,
                    consoleLog:
                      (mrReview.latest.consoleLog ?? "") + payload.chunk,
                  }
                : mrReview.latest,
            history: mrReview.history.map((history) =>
              payload.reviewId === history.id
                ? {
                    ...history,
                    consoleLog: (history.consoleLog ?? "") + payload.chunk,
                  }
                : history,
            ),
          };
        },
      );
    });

    return () => {
      unsubscribeStarted();
      unsubscribeCompleted();
      unsubscribeConsole();
      socket.disconnect();
    };
  }, [queryClient]);
}
