import type { MrSummary, WsEvent } from "../types";

type EventPayload = Record<string, unknown>;

function asPayload(value: unknown): EventPayload | null {
  return typeof value === "object" && value !== null
    ? (value as EventPayload)
    : null;
}

function getMrId(payload: EventPayload): string | null {
  const value = payload.id ?? payload.mrId;
  return typeof value === "string" ? value : null;
}

function getMr(payload: EventPayload): MrSummary | null {
  const candidate = asPayload(payload.mr) ?? payload;
  return typeof candidate.id === "string" &&
    typeof candidate.gitlabUrl === "string" &&
    typeof candidate.status === "string"
    ? (candidate as unknown as MrSummary)
    : null;
}

export function applyWsEvent(
  current: MrSummary[],
  event: WsEvent,
): MrSummary[] {
  const payload = asPayload(event.payload);
  if (!payload) return current;

  const mr = getMr(payload);
  if (!mr) return current;

  const index = current.findIndex((item) => item.id === mr.id);
  if (index === -1) return [mr, ...current];

  const next = [...current];
  next[index] = { ...current[index], ...mr };
  return next;
}

export function reduceReviewingIds(
  current: Set<string>,
  event: WsEvent,
): Set<string> {
  const payload = asPayload(event.payload);
  if (!payload) return current;

  const mrId = getMrId(payload);
  if (!mrId) return current;

  const next = new Set(current);
  if (event.type === "mr.review.started") next.add(mrId);
  if (
    event.type === "mr.review.completed" ||
    event.type === "mr.review.failed"
  ) {
    next.delete(mrId);
  }
  return next;
}

export function reduceConsoleOutput(
  current: Record<string, string>,
  event: WsEvent,
): Record<string, string> {
  const payload = asPayload(event.payload);
  if (!payload) return current;

  const mrId = getMrId(payload);
  if (!mrId) return current;

  if (event.type === "mr.review.started") {
    return { ...current, [mrId]: "" };
  }

  if (event.type !== "mr.console" || typeof payload.chunk !== "string") {
    return current;
  }

  return { ...current, [mrId]: (current[mrId] ?? "") + payload.chunk };
}
