// Converts the loosely markdown-ish plain text that Claude Code emits into
// Telegram's HTML message format (parse_mode: 'HTML'), which supports a
// small, fixed tag set: <b> <i> <s> <u> <code> <pre> <a href> <blockquote>.
//
// Every conversion below only fires on a *complete* markdown construct
// (matching regex requires both an opening and a closing marker). An
// in-progress/unclosed marker -- which happens constantly while a response
// is still streaming in -- is therefore left as literal, HTML-escaped text
// instead of turning into an unbalanced tag that Telegram's HTML parser
// would reject outright.

// Placeholder wrapper used to stash already-built HTML fragments (code
// blocks, inline code, links) so later regex passes over the surrounding
// prose can't see or mangle them. Built only from characters ('@', letters,
// digits) that none of the markdown regexes below key off of (they look for
// '*', '~', '#', '-', backticks, brackets), so a placeholder can never be
// misread as -- or fragment -- another construct.
const PLACEHOLDER_RE = /@@TGFMT(\d+)@@/g;

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function toTelegramHtml(rawText: string): string {
  if (!rawText) return '';

  const stash: string[] = [];
  const stow = (html: string): string => {
    const token = `@@TGFMT${stash.length}@@`;
    stash.push(html);
    return token;
  };

  // Fenced code blocks: ```lang\ncode``` (lang optional).
  let text = rawText.replace(/```([a-zA-Z0-9_+-]*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const cls = lang ? ` class="language-${escapeHtml(lang)}"` : '';
    return stow(`<pre><code${cls}>${escapeHtml(code)}</code></pre>`);
  });

  // Inline code spans: `code`.
  text = text.replace(/`([^`\n]+)`/g, (_, code) => stow(`<code>${escapeHtml(code)}</code>`));

  // Links: [text](url).
  text = text.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) =>
    stow(`<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`)
  );

  // Everything else is prose: escape HTML-significant characters before
  // applying any further markup so raw "<"/">"/"&" can never be mistaken
  // for real tags.
  text = escapeHtml(text);

  // Bold: **text**.
  text = text.replace(/\*\*([^\n]+?)\*\*/g, '<b>$1</b>');

  // Strikethrough: ~~text~~.
  text = text.replace(/~~([^\n]+?)~~/g, '<s>$1</s>');

  // Headings (#, ##, ...): rendered as bold since Telegram HTML has no <h*>.
  text = text.replace(/^#{1,6}\s+(.+)$/gm, '<b>$1</b>');

  // "- item" / "* item" bullet markers -> a plain bullet dot (no <ul>/<li> in Telegram HTML).
  text = text.replace(/^(\s*)[-*]\s+/gm, '$1• ');

  // Restore stashed fragments. None of the stashed HTML itself contains a
  // placeholder token, so a single non-recursive pass is sufficient.
  text = text.replace(PLACEHOLDER_RE, (_, i) => stash[Number(i)]);

  return text;
}
