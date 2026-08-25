import { useEffect, useRef } from "react";
import { useSetAtom, useStore } from "jotai";
import { activeReviewMrIdsAtom, liveConsoleAtom, mrReviewsAtom, issueMrsAtom } from "@/atoms";
import { fetchIssueMrs } from "@/lib/jira-api";
import type { JiraReviewWsEvent } from "@/types";

const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 15000;

/**
 * The hook's own socket instance — module-scoped since useJiraReviewSocket is
 * only ever mounted once (JiraIssuesPage). Lets requestLiveConsoleSnapshot be
 * called from anywhere (e.g. ReviewFlyout) without threading the socket
 * through props/atoms just for this one outgoing message.
 */
let activeSocket: WebSocket | null = null;

/**
 * Asks the server, over the existing /ws connection, for the current
 * in-flight console transcript of an MR's review — see MrGateway's
 * jira.review.subscribe handling. Used when the Console tab opens for an MR
 * that's mid-review but this browser session never saw its
 * `jira.review.started` broadcast (e.g. the review was already running when
 * the page loaded), so a REST read of jira_review_runs would risk reading a
 * snapshot older than the live stream this socket is about to keep
 * appending to. No-ops if the socket isn't open; the caller just tries again
 * next render.
 */
export function requestLiveConsoleSnapshot(mrId: string): void {
  if (activeSocket && activeSocket.readyState === WebSocket.OPEN) {
    activeSocket.send(JSON.stringify({ type: "jira.review.subscribe", mrId }));
  }
}

/**
 * Watches the real, asynchronous Claude Code review job (stage 5) over the
 * existing /ws connection (MrGateway forwards jira.review.* the same way it
 * already forwards mr.* — see apps/backend/src/ws/mr.gateway.ts). Mount this
 * once (JiraIssuesPage) — reconnects with capped exponential backoff, same
 * pattern as the MR Management page's useWebSocket.ts.
 *
 * Ignores every non-`jira.review.*` event so this page's socket instance
 * doesn't need to know about the unrelated MR Management event types.
 */
export function useJiraReviewSocket() {
  const setActiveIds = useSetAtom(activeReviewMrIdsAtom);
  const setLiveConsole = useSetAtom(liveConsoleAtom);
  const setMrReviews = useSetAtom(mrReviewsAtom);
  const store = useStore();
  const backoffRef = useRef(INITIAL_BACKOFF_MS);
  const stoppedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    stoppedRef.current = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const clearActive = (mrId: string) => {
      setActiveIds((s) => {
        if (!s.has(mrId)) return s;
        const next = new Set(s);
        next.delete(mrId);
        return next;
      });
    };

    /** Refreshes the row(s) in issueMrsAtom containing this MR, so actionLabel/lastRun update without a manual expand/collapse. */
    const refreshOwningIssue = (mrId: string) => {
      const cache = store.get(issueMrsAtom);
      const issueKey = Object.keys(cache).find((key) => cache[key].some((mr) => mr.mrId === mrId));
      if (!issueKey) return;
      fetchIssueMrs(issueKey)
        .then((mrs) => store.set(issueMrsAtom, (prev) => ({ ...prev, [issueKey]: mrs })))
        .catch(() => {});
    };

    function connect() {
      if (stoppedRef.current) return;
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      socket = new WebSocket(`${proto}://${window.location.host}/ws`);

      socket.onopen = () => {
        backoffRef.current = INITIAL_BACKOFF_MS;
        activeSocket = socket;
      };

      socket.onmessage = (event) => {
        let parsed: JiraReviewWsEvent;
        try {
          parsed = JSON.parse(event.data);
        } catch {
          return;
        }
        if (!parsed?.type?.startsWith("jira.review.")) return;
        const mrId = parsed.payload?.mrId;
        if (!mrId) return;

        switch (parsed.type) {
          case "jira.review.started":
            setActiveIds((s) => new Set(s).add(mrId));
            setLiveConsole((prev) => ({ ...prev, [mrId]: "" }));
            break;
          case "jira.review.console":
            setLiveConsole((prev) => ({ ...prev, [mrId]: (prev[mrId] || "") + (parsed.payload.chunk || "") }));
            break;
          case "jira.review.completed":
            clearActive(mrId);
            if (parsed.payload.review) {
              const review = parsed.payload.review;
              setMrReviews((prev) => {
                const existing = prev[mrId];
                return { ...prev, [mrId]: { latest: review, history: existing ? [review, ...existing.history] : [review] } };
              });
            }
            refreshOwningIssue(mrId);
            break;
          case "jira.review.failed":
            clearActive(mrId);
            refreshOwningIssue(mrId);
            break;
          case "jira.review.snapshot":
            // Reply to this client's own requestLiveConsoleSnapshot — seeds the
            // live view from the server's in-memory transcript for an MR whose
            // `started` broadcast this session missed (see MrGateway).
            setActiveIds((s) => new Set(s).add(mrId));
            setLiveConsole((prev) => ({ ...prev, [mrId]: parsed.payload.consoleLog || "" }));
            break;
        }
      };

      socket.onclose = () => {
        if (activeSocket === socket) activeSocket = null;
        if (stoppedRef.current) return;
        reconnectTimer = setTimeout(connect, backoffRef.current);
        backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
      };

      socket.onerror = () => {
        socket?.close();
      };
    }

    connect();

    return () => {
      stoppedRef.current = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (activeSocket === socket) activeSocket = null;
      socket?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export default useJiraReviewSocket;
