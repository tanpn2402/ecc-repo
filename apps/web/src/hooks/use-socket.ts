import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { socket } from "@/api/socket.api";
import { Issue, JiraMrStatus, MergeRequest, ReviewRun } from "@/types";
import { MrReviews } from "@/api/merge-requests.api";

function onMRStarted(payload: { mrId: string; jiraKey: string }) {
  return (
    mrs: NoInfer<MergeRequest[]> | undefined,
  ): NoInfer<MergeRequest[]> | undefined => {
    console.log("[WS] jira.review.started", mrs);
    if (!mrs) {
      return mrs;
    }

    const updatedMrs = mrs.map((mr) =>
      mr.mrId === payload.mrId
        ? {
            ...mr,
            reviewStatus: "running",
          }
        : mr,
    );

    return updatedMrs;
  };
}

function onMRCompleted(payload: {
  mrId: string;
  jiraKey: string;
  review: ReviewRun;
}) {
  return (
    mrs: NoInfer<MergeRequest[]> | undefined,
  ): NoInfer<MergeRequest[]> | undefined => {
    console.log("[WS] jira.review.completed", mrs);
    if (!mrs) {
      return mrs;
    }

    const updatedMrs = mrs.map((mr) =>
      mr.mrId === payload.mrId
        ? {
            ...mr,
            reviewStatus: payload.review.status,
            reviewVerdict: payload.review.verdict,
            reviewCompletedAt: payload.review.completedAt,
          }
        : mr,
    );

    return updatedMrs;
  };
}

export function useSocket() {
  const queryClient = useQueryClient();

  useEffect(() => {
    socket.connect();

    const unsubscribeStarted = socket.on<{ mrId: string; jiraKey: string }>(
      "jira.review.started",
      (payload) => {
        console.log("[WS] jira.review.started", payload);

        queryClient.setQueryData<MergeRequest[]>(
          ["jira", "issues", payload.jiraKey, "mrs"],
          onMRStarted(payload),
        );

        queryClient.setQueryData<MergeRequest[]>(
          ["merge-requests"],
          onMRStarted(payload),
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
        onMRCompleted(payload),
      );

      queryClient.setQueryData<MergeRequest[]>(
        ["merge-requests"],
        onMRCompleted(payload),
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

    const unsubscribeJiraStatusUpdated = socket.on<
      { key: string; status: string }[]
    >("jira.data.updated", (payload) => {
      console.log("[WS] jira.data.updated", payload);
      const issueDataMap = payload.reduce(
        (result, p) => {
          result[p.key] = p;
          return result;
        },
        {} as Record<string, (typeof payload)[number]>,
      );

      queryClient.setQueryData<Issue[]>(["synced-issues"], (issues) => {
        console.log("[WS] jira.data.updated", issues);
        if (!issues) {
          return issues;
        }

        const updatedIssue = issues.map((mr) =>
          issueDataMap[mr.key]
            ? {
                ...mr,
                status: issueDataMap[mr.key].status,
              }
            : mr,
        );

        return updatedIssue;
      });
    });

    return () => {
      unsubscribeStarted();
      unsubscribeCompleted();
      unsubscribeConsole();
      unsubscribeJiraStatusUpdated();
      socket.disconnect();
    };
  }, [queryClient]);
}
