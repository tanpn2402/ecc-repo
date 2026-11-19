import { Inject, Injectable } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/configuration';
import logger from '../common/logger';
import JiraClient from '../mr/jira-client';
import { adfToMarkdown, isAdf } from './adf-to-markdown';

export const JIRA_KEY_RE = /^[A-Z][A-Z0-9_]*-\d+$/;

/** Re-use a cache this fresh without calling Jira at all. */
const FRESH_MS = 60_000;
const MAX_COMMENTS = 30;
const MAX_LINKED = 10;

/** Fields that are rendered in their own section or are noise for analysis. */
const SKIP_FIELDS = new Set([
  'summary', 'description', 'comment', 'attachment', 'issuelinks', 'subtasks', 'worklog', 'watches', 'votes',
  'thumbnail', 'avatarUrls', 'lastViewed', 'aggregateprogress', 'progress', 'timetracking', 'aggregatetimespent',
  'aggregatetimeestimate', 'aggregatetimeoriginalestimate', 'workratio', 'statuscategorychangedate', 'issuerestriction',
]);

export interface CachedAttachment {
  id: string;
  filename: string;
  /** Path relative to the issue folder, or null when skipped. */
  file: string | null;
  size: number;
  mimeType: string;
  skipped?: string;
}

export interface CachedIssueMeta {
  key: string;
  summary: string;
  status: string;
  type: string;
  url: string;
  jiraUpdated: string;
  fetchedAt: string;
  attachments: CachedAttachment[];
  linkedKeys: string[];
}

export interface CachedIssue extends CachedIssueMeta {
  /** Absolute folder of the cached issue. */
  dir: string;
  /** True when served from cache without calling Jira. */
  fromCache: boolean;
}

/** What the chat popup shows for an issue key. */
export interface JiraPreview {
  key: string;
  summary: string;
  status: string;
  /** Jira status category: new | indeterminate | done. */
  statusCategory: string | null;
  type: string;
  priority: string | null;
  assignee: string | null;
  reporter: string | null;
  created: string | null;
  updated: string | null;
  labels: string[];
  fixVersions: string[];
  parent: { key: string; summary: string } | null;
  /** Markdown, cut to PREVIEW_DESC_CHARS. */
  description: string;
  url: string;
  /** True when the full issue is in the local cache (the details drawer can open). */
  cached: boolean;
}

const PREVIEW_FIELDS = [
  'summary',
  'status',
  'issuetype',
  'priority',
  'assignee',
  'reporter',
  'created',
  'updated',
  'labels',
  'fixVersions',
  'parent',
  'description',
];
const PREVIEW_DESC_CHARS = 1500;

export class JiraCacheError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

/**
 * Local cache of Jira issues for the agent: ~/.ecc/jira/<KEY>/ holds
 * issue.md (readable summary), issue.json (raw), fields.json (custom fields
 * by display name), links.json and attachments/. Claude reads these files
 * instead of calling Jira; the Jira token never leaves this process.
 */
@Injectable()
export class JiraCacheService {
  readonly root: string;
  private readonly inFlight = new Map<string, Promise<CachedIssue>>();
  private readonly previews = new Map<string, { at: number; value: JiraPreview }>();

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(JiraClient) private readonly jira: JiraClient | null,
  ) {
    this.root = path.join(config.analysis.eccHome, 'jira');
    fs.mkdirSync(this.root, { recursive: true });
  }

  get enabled(): boolean {
    return this.jira !== null;
  }

  issueDir(key: string): string {
    const k = normalizeKey(key);
    return path.join(this.root, k);
  }

  /** Cached metadata without calling Jira, or null. */
  readMeta(key: string): CachedIssueMeta | null {
    try {
      return JSON.parse(fs.readFileSync(path.join(this.issueDir(key), 'meta.json'), 'utf8'));
    } catch {
      return null;
    }
  }

  readMarkdown(key: string): string | null {
    try {
      return fs.readFileSync(path.join(this.issueDir(key), 'issue.md'), 'utf8');
    } catch {
      return null;
    }
  }

  attachmentPath(key: string, file: string): string | null {
    const dir = path.join(this.issueDir(key), 'attachments');
    const full = path.resolve(dir, path.basename(file));
    return full.startsWith(dir + path.sep) && fs.existsSync(full) ? full : null;
  }

  /**
   * A light live view of one issue for the chat popup: a few fields and the
   * description, straight from Jira (no files written, no attachments). Kept
   * in memory for a minute so hovering over the same key again is instant.
   */
  async preview(key: string): Promise<JiraPreview> {
    const k = normalizeKey(key);
    const hit = this.previews.get(k);
    if (hit && Date.now() - hit.at < FRESH_MS) return hit.value;
    if (!this.jira) throw new JiraCacheError('Jira is not configured (JIRA_EMAIL / JIRA_API_TOKEN)', 503);
    let issue: any;
    try {
      issue = await this.jira.getJson(`/rest/api/3/issue/${encodeURIComponent(k)}?fields=${PREVIEW_FIELDS.join(',')}`);
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 404) throw new JiraCacheError(`Jira issue ${k} not found (or no access)`, 404);
      throw err;
    }
    const f = issue.fields ?? {};
    const description = isAdf(f.description) ? adfToMarkdown(f.description) : typeof f.description === 'string' ? f.description : '';
    const value: JiraPreview = {
      key: issue.key ?? k,
      summary: f.summary ?? '',
      status: f.status?.name ?? '',
      statusCategory: f.status?.statusCategory?.key ?? null,
      type: f.issuetype?.name ?? '',
      priority: f.priority?.name ?? null,
      assignee: f.assignee?.displayName ?? null,
      reporter: f.reporter?.displayName ?? null,
      created: f.created ?? null,
      updated: f.updated ?? null,
      labels: Array.isArray(f.labels) ? f.labels : [],
      fixVersions: Array.isArray(f.fixVersions) ? f.fixVersions.map((v: { name?: string }) => v.name ?? '').filter(Boolean) : [],
      parent: f.parent ? { key: f.parent.key, summary: f.parent.fields?.summary ?? '' } : null,
      description: description.length > PREVIEW_DESC_CHARS ? `${description.slice(0, PREVIEW_DESC_CHARS)}…` : description,
      url: `${this.config.mr.jiraBaseUrl.replace(/\/+$/, '')}/browse/${issue.key ?? k}`,
      cached: this.readMeta(k) !== null,
    };
    this.previews.set(k, { at: Date.now(), value });
    if (this.previews.size > 200) this.previews.delete(this.previews.keys().next().value!);
    return value;
  }

  /**
   * Makes sure <KEY> is cached and current. Concurrent calls for one key share
   * one fetch. `includeLinked` also caches the directly linked issues.
   */
  async ensure(key: string, opts: { force?: boolean; includeLinked?: boolean } = {}): Promise<CachedIssue> {
    const k = normalizeKey(key);
    let p = this.inFlight.get(k);
    if (!p) {
      p = this.fetch(k, !!opts.force).finally(() => this.inFlight.delete(k));
      this.inFlight.set(k, p);
    }
    const issue = await p;
    if (opts.includeLinked) {
      for (const linked of issue.linkedKeys.slice(0, MAX_LINKED)) {
        await this.ensure(linked).catch((err) =>
          logger.warn('Cannot cache linked Jira issue', { key: linked, error: (err as Error).message }),
        );
      }
    }
    return issue;
  }

  private async fetch(key: string, force: boolean): Promise<CachedIssue> {
    const dir = this.issueDir(key);
    const cached = this.readMeta(key);
    if (!force && cached && Date.now() - Date.parse(cached.fetchedAt) < FRESH_MS) {
      return { ...cached, dir, fromCache: true };
    }
    if (!this.jira) throw new JiraCacheError('Jira is not configured (JIRA_EMAIL / JIRA_API_TOKEN)', 503);

    let issue: any;
    try {
      issue = await this.jira.getJson(`/rest/api/3/issue/${encodeURIComponent(key)}?expand=names,renderedFields&fields=*all`);
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 404) throw new JiraCacheError(`Jira issue ${key} not found (or no access)`, 404);
      throw err;
    }
    const fields = issue.fields ?? {};
    const names: Record<string, string> = issue.names ?? {};
    const remoteLinks = await this.jira.fetchRemoteLinks(key).catch(() => []);

    fs.mkdirSync(path.join(dir, 'attachments'), { recursive: true });
    const unchanged = !force && cached?.jiraUpdated === fields.updated && fs.existsSync(path.join(dir, 'issue.md'));
    const attachments = await this.syncAttachments(dir, fields.attachment ?? [], cached?.attachments ?? []);
    const byFilename = new Map(attachments.filter((a) => a.file).map((a) => [a.filename, path.basename(a.file!)]));
    const md = (v: unknown) => (isAdf(v) ? adfToMarkdown(v, { mediaName: (_id, alt) => (alt ? byFilename.get(alt) : undefined) }) : v);

    const issueLinks = (fields.issuelinks ?? []).map((l: any) => {
      const other = l.outwardIssue ?? l.inwardIssue;
      return {
        relation: l.outwardIssue ? l.type?.outward : l.type?.inward,
        key: other?.key,
        summary: other?.fields?.summary,
        status: other?.fields?.status?.name,
      };
    });
    const subtasks = (fields.subtasks ?? []).map((s: any) => ({ key: s.key, summary: s.fields?.summary, status: s.fields?.status?.name }));
    const linkedKeys = [...new Set([...issueLinks.map((l: any) => l.key), ...subtasks.map((s: any) => s.key), fields.parent?.key].filter(Boolean))] as string[];

    const named: Record<string, unknown> = {};
    for (const [id, value] of Object.entries(fields)) {
      if (SKIP_FIELDS.has(id)) continue;
      const simple = simplify(value, md);
      if (isEmpty(simple)) continue;
      named[names[id] ?? id] = simple;
    }

    const meta: CachedIssueMeta = {
      key,
      summary: fields.summary ?? '',
      status: fields.status?.name ?? '',
      type: fields.issuetype?.name ?? '',
      url: `${this.jira.baseUrl}/browse/${key}`,
      jiraUpdated: fields.updated ?? '',
      fetchedAt: new Date().toISOString(),
      attachments,
      linkedKeys,
    };

    if (!unchanged) {
      fs.writeFileSync(path.join(dir, 'issue.json'), JSON.stringify(issue, null, 2));
      fs.writeFileSync(path.join(dir, 'fields.json'), JSON.stringify(named, null, 2));
      fs.writeFileSync(path.join(dir, 'links.json'), JSON.stringify({ issueLinks, subtasks, parent: fields.parent?.key ?? null, remoteLinks }, null, 2));
      fs.writeFileSync(
        path.join(dir, 'issue.md'),
        renderIssueMd({ meta, fields, named, issueLinks, subtasks, remoteLinks, md }),
      );
    }
    fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2));
    logger.info('Cached Jira issue', { key, attachments: attachments.length, unchanged });
    return { ...meta, dir, fromCache: false };
  }

  private async syncAttachments(dir: string, list: any[], previous: CachedAttachment[]): Promise<CachedAttachment[]> {
    const max = this.config.uploads.maxBytes;
    const out: CachedAttachment[] = [];
    for (const a of list) {
      const id = String(a.id);
      const filename = String(a.filename ?? `attachment-${id}`);
      const safe = `${id}_${filename.replace(/[^\w.-]+/g, '_').slice(-100)}`;
      const rel = path.join('attachments', safe);
      const entry: CachedAttachment = { id, filename, file: rel, size: Number(a.size ?? 0), mimeType: a.mimeType ?? '' };
      const full = path.join(dir, rel);
      if (fs.existsSync(full) && previous.some((p) => p.id === id && p.file)) {
        out.push(entry);
        continue;
      }
      if (entry.size > max) {
        out.push({ ...entry, file: null, skipped: `larger than ${Math.round(max / 1048576)} MB` });
        continue;
      }
      try {
        fs.writeFileSync(full, await this.jira!.download(a.content));
        out.push(entry);
      } catch (err) {
        out.push({ ...entry, file: null, skipped: (err as Error).message });
      }
    }
    return out;
  }
}

export function normalizeKey(key: string): string {
  const k = String(key ?? '').trim().toUpperCase();
  if (!JIRA_KEY_RE.test(k)) throw new JiraCacheError(`Not a Jira issue key: ${key}`);
  return k;
}

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined || v === '' || v === '{}') return true;
  if (Array.isArray(v)) return v.length === 0;
  return typeof v === 'object' && Object.keys(v as object).length === 0;
}

/** Field value for issue.md: lists of plain values as "a, b", objects as JSON. */
function fieldText(v: unknown): string {
  if (typeof v === 'string') return v;
  if (Array.isArray(v) && v.every((x) => typeof x !== 'object')) return v.join(', ');
  return JSON.stringify(v);
}

/** Jira field value -> plain JSON a model reads easily. */
function simplify(value: unknown, md: (v: unknown) => unknown): unknown {
  if (value == null) return null;
  if (isAdf(value)) return md(value);
  if (Array.isArray(value)) return value.map((v) => simplify(v, md)).filter((v) => v !== null);
  if (typeof value !== 'object') return value;
  const o = value as Record<string, any>;
  if (typeof o.displayName === 'string') return o.displayName;
  if (typeof o.value === 'string') return o.child?.value ? `${o.value} / ${o.child.value}` : o.value;
  if (typeof o.name === 'string') return o.name;
  if (typeof o.key === 'string') return o.key;
  return o;
}

function renderIssueMd(x: {
  meta: CachedIssueMeta;
  fields: any;
  named: Record<string, unknown>;
  issueLinks: Array<{ relation: string; key: string; summary: string; status: string }>;
  subtasks: Array<{ key: string; summary: string; status: string }>;
  remoteLinks: Array<{ url: string; title: string | null }>;
  md: (v: unknown) => unknown;
}): string {
  const { meta, fields, named, issueLinks, subtasks, remoteLinks, md } = x;
  const lines: string[] = [`# ${meta.key}: ${meta.summary}`, '', `<${meta.url}>`, ''];
  const facts: Array<[string, unknown]> = [
    ['Type', meta.type],
    ['Status', meta.status],
    ['Priority', fields.priority?.name],
    ['Assignee', fields.assignee?.displayName],
    ['Reporter', fields.reporter?.displayName],
    ['Parent', fields.parent ? `${fields.parent.key} ${fields.parent.fields?.summary ?? ''}` : null],
    ['Labels', (fields.labels ?? []).join(', ')],
    ['Components', (fields.components ?? []).map((c: any) => c.name).join(', ')],
    ['Fix versions', (fields.fixVersions ?? []).map((v: any) => v.name).join(', ')],
    ['Created', fields.created],
    ['Updated', fields.updated],
  ];
  for (const [k, v] of facts) if (v) lines.push(`- **${k}:** ${v}`);

  lines.push('', '## Description', '', String(md(fields.description) || '_(empty)_'), '');

  const custom = Object.entries(named).filter(([name]) => !/^(Issue Type|Status|Priority|Assignee|Reporter|Parent|Labels|Components|Fix versions|Created|Updated|Project|Creator|Resolution|Resolved|Status Category|Rank)$/i.test(name));
  if (custom.length) {
    lines.push('## Fields', '');
    for (const [name, value] of custom) {
      const v = fieldText(value);
      lines.push(v.includes('\n') ? `### ${name}\n\n${v}\n` : `- **${name}:** ${v}`);
    }
    lines.push('');
  }

  if (issueLinks.length || subtasks.length) {
    lines.push('## Linked issues', '');
    for (const l of issueLinks) lines.push(`- ${l.relation} **${l.key}** ${l.summary ?? ''} [${l.status ?? ''}]`);
    for (const s of subtasks) lines.push(`- subtask **${s.key}** ${s.summary ?? ''} [${s.status ?? ''}]`);
    lines.push('', `Linked issues are cached on demand in sibling folders (../<KEY>/issue.md).`, '');
  }

  if (remoteLinks.length) {
    lines.push('## Remote links (merge requests, Confluence, ...)', '');
    for (const r of remoteLinks) lines.push(`- [${r.title ?? r.url}](${r.url})`);
    lines.push('');
  }

  if (meta.attachments.length) {
    lines.push('## Attachments', '');
    for (const a of meta.attachments) {
      lines.push(a.file ? `- ${a.filename} -> \`${a.file}\` (${a.mimeType}, ${a.size} bytes)` : `- ${a.filename} (not downloaded: ${a.skipped})`);
    }
    lines.push('');
  }

  const comments: any[] = fields.comment?.comments ?? [];
  if (comments.length) {
    lines.push(`## Comments (last ${Math.min(comments.length, MAX_COMMENTS)} of ${comments.length})`, '');
    for (const c of comments.slice(-MAX_COMMENTS)) {
      lines.push(`### ${c.author?.displayName ?? 'unknown'} · ${String(c.created ?? '').slice(0, 16)}`, '', String(md(c.body) || ''), '');
    }
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}
