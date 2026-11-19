import { createContext, useContext } from "react";
import type { AnswerExtra } from "./api";

/** What message parts (permission card, question form, Jira chip, ...) need from the open thread. */
export interface ThreadActions {
  sid: string;
  cwd: string;
  answer(
    requestId: string,
    allow: boolean,
    extra?: AnswerExtra,
  ): Promise<unknown>;
  openJira(key: string): void;
}

export const ThreadActionsContext = createContext<ThreadActions | null>(null);

export function useThreadActions(): ThreadActions {
  const ctx = useContext(ThreadActionsContext);
  if (!ctx) throw new Error("useThreadActions outside ThreadActionsContext");
  return ctx;
}

/** Path relative to the thread's folder, for compact tool rows. */
export function relPath(p: unknown, cwd: string): string {
  const s = String(p ?? "");
  if (cwd && s === cwd) return ".";
  return cwd && s.startsWith(cwd + "/") ? s.slice(cwd.length + 1) : s;
}
