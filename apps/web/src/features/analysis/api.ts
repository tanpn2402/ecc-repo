import { apiClient } from "@/api/client";
import { SocketApi } from "@/api/socket.api";
import type {
  Ack,
  AiEvent,
  AnalysisStatus,
  ApproveMode,
  Attachment,
  CachedJira,
  DirListing,
  JiraPreview,
  Thread,
  ThreadAttachment,
  ThreadDetail,
  Workspace,
} from "./types";

/** Error with the backend's { message, code } (HTTP) or the socket ack's { error, code }. */
export class AnalysisError extends Error {
  constructor(
    message: string,
    readonly code = "error",
  ) {
    super(message);
  }
}

async function call<T>(p: Promise<{ data: T }>): Promise<T> {
  try {
    return (await p).data;
  } catch (e) {
    const data = (
      e as { response?: { data?: { message?: string; code?: string } } }
    ).response?.data;
    throw new AnalysisError(data?.message ?? (e as Error).message, data?.code);
  }
}

export const analysisApi = {
  status: () => call(apiClient.get<AnalysisStatus>("/analysis/status")),
  dirs: (path?: string) =>
    call(
      apiClient.get<DirListing>("/fs/dirs", { params: path ? { path } : {} }),
    ),

  workspaces: () => call(apiClient.get<Workspace[]>("/analysis/workspaces")),
  createWorkspace: (body: {
    name?: string;
    path: string;
    contextMd?: string;
  }) => call(apiClient.post<Workspace>("/analysis/workspaces", body)),
  updateWorkspace: (
    id: number,
    body: Partial<Pick<Workspace, "name" | "path" | "contextMd">>,
  ) => call(apiClient.patch<Workspace>(`/analysis/workspaces/${id}`, body)),
  deleteWorkspace: (id: number) =>
    call(apiClient.delete(`/analysis/workspaces/${id}`)),

  threads: (workspaceId: number) =>
    call(
      apiClient.get<Thread[]>(`/analysis/workspaces/${workspaceId}/threads`),
    ),
  createThread: (
    workspaceId: number,
    body: { model?: string; approveMode?: ApproveMode } = {},
  ) =>
    call(
      apiClient.post<Thread>(
        `/analysis/workspaces/${workspaceId}/threads`,
        body,
      ),
    ),
  thread: (sid: string) =>
    call(apiClient.get<ThreadDetail>(`/analysis/threads/${sid}`)),
  attachments: (sid: string) =>
    call(
      apiClient.get<ThreadAttachment[]>(`/analysis/threads/${sid}/attachments`),
    ),
  updateThread: (
    sid: string,
    body: {
      title?: string;
      model?: string;
      addDirs?: string[];
      approveMode?: ApproveMode;
    },
  ) => call(apiClient.patch<Thread>(`/analysis/threads/${sid}`, body)),
  deleteThread: (sid: string) =>
    call(apiClient.delete(`/analysis/threads/${sid}`)),
  clearGrants: (sid: string) =>
    call(
      apiClient.delete<{ grants: string[] }>(`/analysis/threads/${sid}/grants`),
    ),

  jira: (key: string) =>
    call(apiClient.get<CachedJira>(`/analysis/jira/${key}`)),
  jiraPreview: (key: string) =>
    call(
      apiClient.get<JiraPreview>(
        `/analysis/jira/${encodeURIComponent(key)}/preview`,
        { timeout: 30_000 },
      ),
    ),
  refreshJira: (key: string) =>
    call(
      apiClient.post<CachedJira>(
        `/analysis/jira/${key}/refresh`,
        {},
        { timeout: 120_000 },
      ),
    ),
  jiraAttachmentUrl: (key: string, file: string) =>
    `/api/analysis/jira/${encodeURIComponent(key)}/attachments/${encodeURIComponent(file.split("/").pop() ?? file)}`,
};

/** Socket.IO namespace /analysis (see apps/backend/src/analysis/analysis.gateway.ts). */
export const analysisSocket = new SocketApi("/analysis");

async function emit<T>(event: string, body: unknown): Promise<T> {
  analysisSocket.connect();
  const ack = await analysisSocket.emitWithAck<Ack<T>>(event, body);
  if (!ack.ok) throw new AnalysisError(ack.error, ack.code);
  return ack as T;
}

export interface AnswerExtra {
  message?: string;
  answers?: Record<string, string>;
  /** "session": allow and do not ask again for the same rule in this thread. */
  scope?: "once" | "session";
}

export const analysisChat = {
  join: (sid: string, after: number) =>
    emit<{ events: AiEvent[]; lastEventId: number; running: boolean }>(
      "thread:join",
      { sid, after },
    ),
  leave: (sid: string) => emit("thread:leave", { sid }).catch(() => undefined),
  send: (sid: string, text: string, attachments: Attachment[], force = false) =>
    emit("chat:send", { sid, text, attachments, force }),
  interrupt: (sid: string) => emit("chat:interrupt", { sid }),
  answer: (
    sid: string,
    requestId: string,
    allow: boolean,
    extra: AnswerExtra = {},
  ) => emit("permission:answer", { sid, requestId, allow, ...extra }),
};
