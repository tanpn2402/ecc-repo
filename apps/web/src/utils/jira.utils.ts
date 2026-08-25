const JIRA_ID_PATTERN = /\b(?:CORE|REQ|ECHNL)-\d+\b/;

export function extractJiraId(title = ""): string | null {
  return title.match(JIRA_ID_PATTERN)?.[0] ?? null;
}

export function encodeMrId(gitlabUrl: string): string {
  const bytes = new TextEncoder().encode(gitlabUrl);

  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Inverse of encodeMrId.
 * Returns null for a malformed/garbage param.
 */
export function decodeMrId(mrId: string): string | null {
  try {
    // Convert base64url -> base64
    const base64 = mrId
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(mrId.length / 4) * 4, "=");

    const binary = atob(base64);

    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));

    const url = new TextDecoder().decode(bytes);

    return url.startsWith("https://") ? url : null;
  } catch {
    return null;
  }
}
