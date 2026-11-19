/**
 * Atlassian Document Format (Jira Cloud rich text: description, comments,
 * rich-text custom fields) -> Markdown. Covers the node types Jira emits in
 * practice; unknown nodes fall back to their children's text so nothing is
 * silently dropped. `mediaName` maps a media node id to a local file name.
 */
export interface AdfOptions {
  mediaName?: (id: string, alt?: string) => string | undefined;
}

type Node = { type?: string; text?: string; attrs?: Record<string, any>; marks?: Array<{ type: string; attrs?: any }>; content?: Node[] };

export function isAdf(value: unknown): value is Node {
  return !!value && typeof value === 'object' && (value as Node).type === 'doc';
}

export function adfToMarkdown(doc: unknown, opts: AdfOptions = {}): string {
  if (doc == null) return '';
  if (typeof doc === 'string') return doc;
  return block(doc as Node, opts).replace(/\n{3,}/g, '\n\n').trim();
}

function children(n: Node, opts: AdfOptions, sep = ''): string {
  return (n.content ?? []).map((c) => block(c, opts)).join(sep);
}

function inline(n: Node, opts: AdfOptions): string {
  return (n.content ?? []).map((c) => block(c, opts)).join('');
}

function text(n: Node): string {
  let t = n.text ?? '';
  for (const m of n.marks ?? []) {
    switch (m.type) {
      case 'strong': t = `**${t}**`; break;
      case 'em': t = `*${t}*`; break;
      case 'strike': t = `~~${t}~~`; break;
      case 'code': t = '`' + t + '`'; break;
      case 'link': t = `[${t}](${m.attrs?.href ?? ''})`; break;
      default: break;
    }
  }
  return t;
}

function list(n: Node, opts: AdfOptions, ordered: boolean): string {
  return (
    (n.content ?? [])
      .map((item, i) => {
        const body = children(item, opts, '\n').trim().replace(/\n/g, '\n   ');
        return `${ordered ? `${i + 1}.` : '-'} ${body}`;
      })
      .join('\n') + '\n\n'
  );
}

function table(n: Node, opts: AdfOptions): string {
  const rows = (n.content ?? []).map((row) =>
    (row.content ?? []).map((cell) => children(cell, opts, ' ').replace(/\n+/g, ' ').replace(/\|/g, '\\|').trim()),
  );
  if (!rows.length) return '';
  const width = Math.max(...rows.map((r) => r.length));
  const pad = (r: string[]) => [...r, ...Array(width - r.length).fill('')];
  const [head, ...body] = rows;
  return [`| ${pad(head).join(' | ')} |`, `|${' --- |'.repeat(width)}`, ...body.map((r) => `| ${pad(r).join(' | ')} |`)].join('\n') + '\n\n';
}

function block(n: Node, opts: AdfOptions): string {
  switch (n.type) {
    case 'doc': return children(n, opts);
    case 'text': return text(n);
    case 'paragraph': return inline(n, opts) + '\n\n';
    case 'heading': return `${'#'.repeat(Math.min(6, Number(n.attrs?.level) || 1))} ${inline(n, opts)}\n\n`;
    case 'hardBreak': return '\n';
    case 'rule': return '---\n\n';
    case 'bulletList': return list(n, opts, false);
    case 'orderedList': return list(n, opts, true);
    case 'listItem': return children(n, opts);
    case 'taskList': return (n.content ?? []).map((t) => `- [${t.attrs?.state === 'DONE' ? 'x' : ' '}] ${inline(t, opts)}`).join('\n') + '\n\n';
    case 'codeBlock': return '```' + (n.attrs?.language ?? '') + '\n' + inline(n, opts) + '\n```\n\n';
    case 'blockquote': return children(n, opts).trim().split('\n').map((l) => `> ${l}`).join('\n') + '\n\n';
    case 'panel': return `> **${String(n.attrs?.panelType ?? 'note').toUpperCase()}:** ${children(n, opts).trim().replace(/\n/g, '\n> ')}\n\n`;
    case 'expand':
    case 'nestedExpand': return `**${n.attrs?.title ?? 'Details'}**\n\n${children(n, opts)}`;
    case 'table': return table(n, opts);
    case 'mention': return `@${String(n.attrs?.text ?? n.attrs?.id ?? '').replace(/^@/, '')}`;
    case 'emoji': return n.attrs?.text ?? n.attrs?.shortName ?? '';
    case 'date': return n.attrs?.timestamp ? new Date(Number(n.attrs.timestamp)).toISOString().slice(0, 10) : '';
    case 'status': return `[${n.attrs?.text ?? ''}]`;
    case 'inlineCard':
    case 'blockCard':
    case 'embedCard': return `<${n.attrs?.url ?? ''}>` + (n.type === 'inlineCard' ? '' : '\n\n');
    case 'mediaSingle':
    case 'mediaGroup': return children(n, opts, '\n') + '\n\n';
    case 'media': {
      const id = String(n.attrs?.id ?? '');
      const alt = n.attrs?.alt;
      const local = opts.mediaName?.(id, alt);
      return local ? `![${alt ?? local}](attachments/${local})` : `[attachment: ${alt ?? id}]`;
    }
    case 'mediaInline': return `[attachment: ${n.attrs?.alt ?? n.attrs?.id ?? ''}]`;
    default: return n.content ? children(n, opts) : (n.text ?? '');
  }
}
