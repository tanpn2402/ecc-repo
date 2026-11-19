// Live events -> UI messages: pure (messages, event) -> messages. Produces the same shapes as the
// backend's transcriptToUiMessages (apps/backend/src/agent/history.ts). To support a new event
// type, add a case here (and a part renderer in parts/registry.tsx if it shows something).
import type { AiEvent, Part, UiMessage } from "./types";

type P<T extends Part["type"]> = Extract<Part, { type: T }>;

/** The assistant message the event belongs to: the last one, or a new one. */
function lastAssistant(
  msgs: UiMessage[],
  ev: AiEvent,
): [UiMessage[], UiMessage] {
  const last = msgs[msgs.length - 1];
  if (last && last.role === "assistant") {
    const copy = { ...last, parts: [...(last.parts ?? [])] };
    return [[...msgs.slice(0, -1), copy], copy];
  }
  const m: UiMessage = { id: `turn-${ev.id}`, role: "assistant", parts: [] };
  return [[...msgs, m], m];
}

function mapParts(
  msgs: UiMessage[],
  fn: (p: Part) => Part | null,
): UiMessage[] {
  let changed = false;
  const out = msgs.map((m) => {
    if (!m.parts) return m;
    let hit = false;
    const parts = m.parts.map((p) => {
      const q = fn(p);
      if (q) hit = true;
      return q ?? p;
    });
    if (!hit) return m;
    changed = true;
    return { ...m, parts };
  });
  return changed ? out : msgs;
}

export function applyEvent(msgs: UiMessage[], ev: AiEvent): UiMessage[] {
  // Event payloads are untyped JSON from the backend (agent-events.ts); fields are read per case.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const e = ev as AiEvent & Record<string, any>;
  switch (ev.type) {
    case "user":
      return [
        ...msgs,
        {
          id: `ev-${ev.id}`,
          role: "user",
          text: e.text ?? "",
          attachments: e.attachments ?? [],
        },
      ];

    case "text":
    case "text_set":
    case "thinking": {
      const kind = ev.type === "thinking" ? "thinking" : "text";
      const [out, m] = lastAssistant(msgs, ev);
      const parts = m.parts!;
      const i = parts.findIndex(
        (p) => (p.type === "text" || p.type === "thinking") && p.key === e.key,
      );
      if (i >= 0) {
        const p = parts[i] as P<"text">;
        parts[i] = {
          ...p,
          text: ev.type === "text_set" ? e.text : p.text + e.delta,
        };
      } else {
        parts.push({
          type: kind,
          key: e.key,
          text: ev.type === "text_set" ? e.text : e.delta,
        });
      }
      return out;
    }

    case "tool_use": {
      if (e.parent) return msgs; // subagent internals are not shown
      const [out, m] = lastAssistant(msgs, ev);
      m.parts!.push({
        type: "tool",
        id: e.toolId,
        name: e.name,
        input: e.input ?? {},
        status: "running",
      });
      return out;
    }

    case "tool_result":
      return mapParts(msgs, (p) =>
        p.type === "tool" && p.id === e.toolUseId
          ? {
              ...p,
              status: e.isError ? "error" : "done",
              result: { text: e.text ?? "", images: e.images ?? [] },
            }
          : null,
      );

    case "permission_request": {
      const [out, m] = lastAssistant(msgs, ev);
      m.parts!.push({
        type: "permission",
        requestId: e.requestId,
        tool: e.tool,
        input: e.input ?? {},
        title: e.title ?? null,
        description: e.description ?? null,
        blockedPath: e.blockedPath ?? null,
        alwaysAllow: (e.alwaysAllow as string[] | null) ?? null,
        status: "pending",
      });
      return out;
    }

    case "question": {
      const [out, m] = lastAssistant(msgs, ev);
      m.parts!.push({
        type: "question",
        requestId: e.requestId,
        questions: e.questions ?? [],
        status: "pending",
      });
      return out;
    }

    case "permission_resolved":
      return mapParts(msgs, (p) => {
        if (p.type === "permission" && p.requestId === e.requestId) {
          const status =
            e.decision === "allowed" ||
            e.decision === "allowed_session" ||
            e.decision === "expired"
              ? e.decision
              : "denied";
          return { ...p, status, message: e.message };
        }
        if (p.type === "question" && p.requestId === e.requestId) {
          return {
            ...p,
            status:
              e.decision === "answered"
                ? "answered"
                : e.decision === "expired"
                  ? "expired"
                  : "denied",
            answers: e.answers,
          };
        }
        return null;
      });

    case "jira_cached": {
      const [out, m] = lastAssistant(msgs, ev);
      m.parts!.push({
        type: "jira",
        key: e.key,
        summary: e.summary ?? "",
        status: e.status ?? "",
        attachments: e.attachments ?? 0,
      });
      return out;
    }

    case "notice":
    case "error": {
      const [out, m] = lastAssistant(msgs, ev);
      m.parts!.push({
        type: "notice",
        level: ev.type === "error" ? "error" : (e.level ?? "info"),
        text: ev.type === "error" ? e.message : e.text,
      });
      return out;
    }

    case "result": {
      const last = msgs[msgs.length - 1];
      if (!last || last.role !== "assistant") return msgs;
      return [
        ...msgs.slice(0, -1),
        {
          ...last,
          result: {
            subtype: e.subtype,
            costUsd: e.costUsd ?? null,
            numTurns: e.numTurns,
            durationMs: e.durationMs,
            isError: !!e.isError,
          },
        },
      ];
    }

    default:
      return msgs;
  }
}
