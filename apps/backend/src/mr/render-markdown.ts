import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

marked.setOptions({ gfm: true, breaks: true });

const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'code', 'pre', 'blockquote',
  'h1', 'h2', 'h3', 'h4', 'a', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr',
];

/**
 * Converts Claude-produced Markdown to sanitized HTML. This is the only
 * place raw model output is turned into HTML that will ever be rendered
 * with dangerouslySetInnerHTML on the client — the client never receives
 * unsanitized text.
 */
export function renderMarkdownSafe(markdown: string): string {
  if (!markdown) return '';
  const html = marked.parse(markdown) as string;
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
    },
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }),
    },
  });
}

export default renderMarkdownSafe;
