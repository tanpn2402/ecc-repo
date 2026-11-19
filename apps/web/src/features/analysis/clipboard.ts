/**
 * navigator.clipboard needs a secure context and a focused document (plain
 * http on a LAN address, or focus still on a closing menu, makes it reject);
 * execCommand is the fallback.
 */
export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      return await navigator.clipboard.writeText(text);
    } catch {
      /* fall through */
    }
  }
  const el = document.createElement("textarea");
  el.value = text;
  el.style.position = "fixed";
  el.style.opacity = "0";
  document.body.appendChild(el);
  el.select();
  try {
    if (!document.execCommand("copy")) throw new Error("Copy failed");
  } finally {
    el.remove();
  }
}
