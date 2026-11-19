import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AnalysisError,
  analysisApi,
  analysisChat,
  analysisSocket,
  type AnswerExtra,
} from "./api";
import { applyEvent } from "./reduce";
import { rememberApproveMode } from "./approve-mode";
import type {
  AiEvent,
  ApproveMode,
  Attachment,
  Thread,
  UiMessage,
} from "./types";

export interface ThreadState {
  thread: Thread | null;
  messages: UiMessage[];
  running: boolean;
  loading: boolean;
  error: string | null;
  branch: string | null;
  jiraKeys: string[];
  grants: string[];
  approveMode: ApproveMode;
}

const EMPTY: ThreadState = {
  thread: null,
  messages: [],
  running: false,
  loading: false,
  error: null,
  branch: null,
  jiraKeys: [],
  grants: [],
  approveMode: "manual",
};

/**
 * One open thread: history from the transcript (REST), then live `ai:event`s
 * from the /analysis socket. Events carry increasing ids; the hook keeps the
 * last one, so a reconnect replays exactly what was missed and duplicates are
 * dropped.
 */
export function useThread(sid: string | null) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<ThreadState>(EMPTY);
  const lastId = useRef(0);

  const apply = useCallback(
    (events: AiEvent[]) => {
      const fresh = events.filter((e) => e.id > lastId.current);
      if (!fresh.length) return;
      lastId.current = fresh[fresh.length - 1].id;
      setState((s) => {
        let next = { ...s, messages: s.messages };
        for (const ev of fresh) {
          next.messages = applyEvent(next.messages, ev);
          if (ev.type === "user") next.running = true;
          if (ev.type === "done") next.running = false;
          if (ev.type === "branch")
            next.branch = (ev.branch as string | null) ?? null;
          if (
            ev.type === "jira_cached" &&
            !next.jiraKeys.includes(ev.key as string)
          ) {
            next = { ...next, jiraKeys: [...next.jiraKeys, ev.key as string] };
          }
          if (ev.type === "approve_mode")
            next.approveMode = ev.mode as ApproveMode;
          if (ev.type === "permission_resolved" && Array.isArray(ev.grants))
            next.grants = ev.grants as string[];
        }
        return next;
      });
      if (fresh.some((e) => e.type === "done")) {
        void queryClient.invalidateQueries({
          queryKey: ["analysis", "threads"],
        });
        void queryClient.invalidateQueries({
          queryKey: ["analysis", "status"],
        });
      }
    },
    [queryClient],
  );

  useEffect(() => {
    if (!sid) {
      setState(EMPTY);
      return;
    }
    let alive = true;
    lastId.current = 0;
    setState({ ...EMPTY, loading: true });

    const join = () =>
      analysisChat
        .join(sid, lastId.current)
        .then((r) => alive && apply(r.events))
        .catch(
          (e) =>
            alive && setState((s) => ({ ...s, error: (e as Error).message })),
        );

    analysisApi
      .thread(sid)
      .then((d) => {
        if (!alive) return;
        let messages = d.messages;
        for (const ev of d.events) messages = applyEvent(messages, ev);
        lastId.current = d.lastEventId;
        setState({
          thread: d.thread,
          messages,
          running: d.thread.running,
          loading: false,
          error: null,
          branch: d.thread.lastBranch,
          jiraKeys: d.jiraKeys,
          grants: d.grants ?? [],
          approveMode: d.approveMode ?? "manual",
        });
        return join();
      })
      .catch(
        (e) => alive && setState({ ...EMPTY, error: (e as Error).message }),
      );

    const offEvent = analysisSocket.on<AiEvent>("ai:event", (ev) => {
      if (ev.sid === sid) apply([ev]);
    });
    const onReconnect = () => void join();
    analysisSocket.raw.on("connect", onReconnect);
    analysisSocket.connect();

    return () => {
      alive = false;
      offEvent();
      analysisSocket.raw.off("connect", onReconnect);
      void analysisChat.leave(sid);
    };
  }, [sid, apply]);

  const send = useCallback(
    async (text: string, attachments: Attachment[], force = false) => {
      if (!sid) return;
      setState((s) => ({ ...s, running: true, error: null }));
      try {
        await analysisChat.send(sid, text, attachments, force);
      } catch (e) {
        setState((s) => ({ ...s, running: false }));
        throw e instanceof AnalysisError
          ? e
          : new AnalysisError((e as Error).message);
      }
    },
    [sid],
  );

  const interrupt = useCallback(
    () =>
      sid ? analysisChat.interrupt(sid).catch(() => undefined) : undefined,
    [sid],
  );

  const answer = useCallback(
    (requestId: string, allow: boolean, extra: AnswerExtra = {}) =>
      sid
        ? analysisChat.answer(sid, requestId, allow, extra)
        : Promise.resolve(),
    [sid],
  );

  const clearGrants = useCallback(async () => {
    if (!sid) return;
    const r = await analysisApi.clearGrants(sid);
    setState((s) => ({ ...s, grants: r.grants }));
  }, [sid]);

  /** Applies at once on the backend, also to the running turn. */
  const setApproveMode = useCallback(
    async (mode: ApproveMode) => {
      if (!sid) return;
      setState((s) => ({ ...s, approveMode: mode }));
      rememberApproveMode(mode);
      await analysisApi.updateThread(sid, { approveMode: mode });
    },
    [sid],
  );

  return {
    ...state,
    send,
    interrupt,
    answer,
    clearGrants,
    setApproveMode,
    setError: (error: string | null) => setState((s) => ({ ...s, error })),
  };
}

export type ThreadController = ReturnType<typeof useThread>;
