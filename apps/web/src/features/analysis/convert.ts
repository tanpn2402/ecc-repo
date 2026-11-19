// UI messages <-> assistant-ui: message conversion and the attachment adapter.
import type {
  AttachmentAdapter,
  CompleteAttachment,
  PendingAttachment,
  ThreadMessageLike,
} from "@assistant-ui/react";
import type { Part, UiMessage } from "./types";

const TEXT_EXT = /\.(md|txt|csv|json|log|xml|ya?ml)$/i;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const MAX = 5 * 1024 * 1024;

function toBase64(buf: ArrayBuffer): string {
  let bin = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Text files and images; the file travels base64 in a file part until the composer sends it. */
export const attachmentAdapter: AttachmentAdapter = {
  accept:
    ".md,.txt,.csv,.json,.log,.xml,.yml,.yaml,text/*," + IMAGE_TYPES.join(","),
  async add({ file }): Promise<PendingAttachment> {
    const image = IMAGE_TYPES.includes(file.type);
    if (!image && !TEXT_EXT.test(file.name))
      throw new Error(`${file.name}: only text files and images`);
    if (file.size > MAX) throw new Error(`${file.name} is larger than 5 MB`);
    return {
      id: crypto.randomUUID(),
      type: image ? "image" : "document",
      name: file.name,
      contentType: file.type || "text/plain",
      file,
      status: { type: "requires-action", reason: "composer-send" },
    };
  },
  async send(a): Promise<CompleteAttachment> {
    const data = toBase64(await a.file.arrayBuffer());
    return {
      ...a,
      status: { type: "complete" },
      content: [
        {
          type: "file",
          data,
          mimeType: a.contentType || "application/octet-stream",
          filename: a.name,
        },
      ],
    };
  },
  async remove() {
    /* nothing stored server side before sending */
  },
};

function partOf(
  p: Part,
): Exclude<ThreadMessageLike["content"], string>[number] {
  switch (p.type) {
    case "text":
      return { type: "text", text: p.text };
    case "thinking":
      return { type: "reasoning", text: p.text };
    case "tool":
      return {
        type: "tool-call",
        toolCallId: p.id,
        toolName: p.name,
        args: (p.input ?? {}) as never,
        result:
          p.status === "running"
            ? undefined
            : (p.result ?? { text: "", images: [] }),
        isError: p.status === "error",
      };
    default:
      return { type: `data-${p.type}` as `data-${string}`, data: p };
  }
}

export function convertMessage(m: UiMessage): ThreadMessageLike {
  if (m.role === "user") {
    return {
      id: m.id,
      role: "user",
      content: [{ type: "text", text: m.text ?? "" }],
      attachments: (m.attachments ?? []).map((a, i) => ({
        id: `${m.id}-a${i}`,
        type: a.kind === "image" ? "image" : "document",
        name: a.name,
        status: { type: "complete" as const },
        content: [],
      })),
    };
  }
  if (m.role === "notice") {
    return {
      id: m.id,
      role: "assistant",
      content: [
        {
          type: "data-notice",
          data: { type: "notice", level: m.level ?? "info", text: m.text },
        },
      ],
    };
  }
  return {
    id: m.id,
    role: "assistant",
    content: (m.parts ?? []).map(partOf),
    metadata: { custom: { result: m.result } },
  };
}
