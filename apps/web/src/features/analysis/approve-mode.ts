import type { ApproveMode } from "./types";

const KEY = "ecc.analysis.approveMode";
const MODES: ApproveMode[] = ["manual", "edits", "auto"];

/** The mode picked last; new chats start with it. */
export function lastApproveMode(): ApproveMode {
  try {
    const v = localStorage.getItem(KEY) as ApproveMode | null;
    return v && MODES.includes(v) ? v : "manual";
  } catch {
    return "manual";
  }
}

export function rememberApproveMode(mode: ApproveMode): void {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* private mode: new chats start in manual */
  }
}
