import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  addIssue,
  fetchAtlassianIssues,
  fetchIssueMrs,
  syncIssue,
  updateIssue,
} from "../api/jira.api";
import { fetchSyncedIssues, removeSyncedIssue } from "@/api/synced-issues.api";
import { AtlassianIssue } from "@/types";
import { jiraIssueGroup } from "@/atoms";
import { useAtom } from "jotai";

export function useJiraIssues() {
  return useQuery({
    queryKey: ["jira", "issues"],
    queryFn: fetchAtlassianIssues,
  });
}

export function useIssueMrs(key: string) {
  return useQuery({
    queryKey: ["jira", "issues", key, "mrs"],
    queryFn: () => fetchIssueMrs(key),
    enabled: !!key,
  });
}

export function useSyncIssue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: syncIssue,

    onSuccess: (syncedIssue) => {
      queryClient.setQueryData<AtlassianIssue[]>(
        ["jira", "issues"],
        (issues) => {
          if (!issues) {
            return issues;
          }

          const updatedIssues = issues.map((issue) =>
            issue.key === syncedIssue.key
              ? {
                  ...issue,
                  synced: true,
                  group: syncedIssue.group,
                }
              : issue,
          );

          return updatedIssues;
        },
      );

      queryClient.invalidateQueries({
        queryKey: ["synced-issues"],
      });
    },
  });
}

export function useAddIssue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: addIssue,

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["jira", "issues"],
      });

      queryClient.invalidateQueries({
        queryKey: ["synced-issues"],
      });
    },
  });
}

export function useSyncedIssues() {
  const [issueGroup] = useAtom(jiraIssueGroup);

  return useQuery({
    queryKey: ["synced-issues", issueGroup],
    queryFn: () =>
      fetchSyncedIssues({
        group: issueGroup === "synced" ? undefined : issueGroup,
      }),
  });
}

export function useRemoveSyncedIssue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: removeSyncedIssue,

    onSuccess: (removedIssue) => {
      queryClient.invalidateQueries({
        queryKey: ["synced-issues"],
      });

      queryClient.setQueryData<AtlassianIssue[]>(
        ["jira", "issues"],
        (issues) => {
          if (!issues) {
            return issues;
          }

          return issues.map((issue) =>
            issue.key === removedIssue.key
              ? {
                  ...issue,
                  synced: false,
                  group: "",
                }
              : issue,
          );
        },
      );
    },
  });
}

export function useUpdateIssue() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateIssue,

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["jira", "issues"],
      });

      queryClient.invalidateQueries({
        queryKey: ["synced-issues"],
      });
    },
  });
}
