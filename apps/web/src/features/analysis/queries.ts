import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { analysisApi, analysisSocket } from "./api";
import type { ApproveMode, Thread } from "./types";

export const analysisKeys = {
  status: ["analysis", "status"] as const,
  workspaces: ["analysis", "workspaces"] as const,
  threads: (workspaceId: number | null) =>
    ["analysis", "threads", workspaceId] as const,
  jira: (key: string) => ["analysis", "jira", key] as const,
  jiraPreview: (key: string) => ["analysis", "jira-preview", key] as const,
  attachments: (sid: string, version: number) =>
    ["analysis", "attachments", sid, version] as const,
};

export function useAnalysisStatus() {
  return useQuery({
    queryKey: analysisKeys.status,
    queryFn: analysisApi.status,
    staleTime: 30_000,
  });
}

export function useAnalysisWorkspaces() {
  return useQuery({
    queryKey: analysisKeys.workspaces,
    queryFn: analysisApi.workspaces,
  });
}

/** Threads of a workspace; the running flag follows `thread:status` from the socket. */
export function useAnalysisThreads(workspaceId: number | null) {
  const queryClient = useQueryClient();
  useEffect(() => {
    analysisSocket.connect();
    return analysisSocket.on<{ sid: string; running: boolean }>(
      "thread:status",
      ({ sid, running }) => {
        queryClient.setQueryData<Thread[]>(
          analysisKeys.threads(workspaceId),
          (list) =>
            list?.map((t) => (t.sessionId === sid ? { ...t, running } : t)),
        );
        if (!running)
          void queryClient.invalidateQueries({
            queryKey: analysisKeys.threads(workspaceId),
          });
      },
    );
  }, [queryClient, workspaceId]);
  return useQuery({
    queryKey: analysisKeys.threads(workspaceId),
    queryFn: () => analysisApi.threads(workspaceId!),
    enabled: workspaceId !== null,
  });
}

export function useCachedJira(key: string | null) {
  return useQuery({
    queryKey: analysisKeys.jira(key ?? ""),
    queryFn: () => analysisApi.jira(key!),
    enabled: !!key,
    retry: false,
  });
}

/**
 * Attachments of a thread, read from its transcript. `version` (the number of
 * attachment chips in the loaded messages) changes when a message with
 * attachments is sent, which fetches the list again.
 */
export function useThreadAttachments(
  sid: string | null,
  version: number,
  enabled: boolean,
) {
  return useQuery({
    queryKey: analysisKeys.attachments(sid ?? "", version),
    queryFn: () => analysisApi.attachments(sid!),
    enabled: !!sid && enabled,
    placeholderData: (prev) => prev,
    retry: false,
  });
}

/** Fetched only while the popup is open; kept a minute like the backend. */
export function useJiraPreview(key: string, enabled: boolean) {
  return useQuery({
    queryKey: analysisKeys.jiraPreview(key),
    queryFn: () => analysisApi.jiraPreview(key),
    enabled,
    staleTime: 60_000,
    retry: false,
  });
}

export function useAnalysisMutations() {
  const qc = useQueryClient();
  const refreshThreads = () =>
    qc.invalidateQueries({ queryKey: ["analysis", "threads"] });
  const refreshWorkspaces = () =>
    qc.invalidateQueries({ queryKey: analysisKeys.workspaces });
  return {
    createWorkspace: useMutation({
      mutationFn: analysisApi.createWorkspace,
      onSuccess: refreshWorkspaces,
    }),
    updateWorkspace: useMutation({
      mutationFn: (v: {
        id: number;
        body: Parameters<typeof analysisApi.updateWorkspace>[1];
      }) => analysisApi.updateWorkspace(v.id, v.body),
      onSuccess: refreshWorkspaces,
    }),
    deleteWorkspace: useMutation({
      mutationFn: analysisApi.deleteWorkspace,
      onSuccess: refreshWorkspaces,
    }),
    createThread: useMutation({
      mutationFn: (v: {
        workspaceId: number;
        model?: string;
        approveMode?: ApproveMode;
      }) =>
        analysisApi.createThread(v.workspaceId, {
          model: v.model,
          approveMode: v.approveMode,
        }),
      onSuccess: refreshThreads,
    }),
    updateThread: useMutation({
      mutationFn: (v: {
        sid: string;
        body: Parameters<typeof analysisApi.updateThread>[1];
      }) => analysisApi.updateThread(v.sid, v.body),
      onSuccess: refreshThreads,
    }),
    deleteThread: useMutation({
      mutationFn: analysisApi.deleteThread,
      onSuccess: refreshThreads,
    }),
    refreshJira: useMutation({
      mutationFn: analysisApi.refreshJira,
      onSuccess: (data) => qc.setQueryData(analysisKeys.jira(data.key), data),
    }),
  };
}
