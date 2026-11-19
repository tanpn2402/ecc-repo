import { z } from 'zod';
import GitlabClient from '../../mr/gitlab-client';
import { parseGitlabMrUrl } from '../../mr/gitlab-url';
import { type AgentTool, type ToolProvider, textResult } from '../tool-registry';

const PROJECT_RE = /^([A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$|^\d+$/;

/**
 * Read-only GitLab tools. The token stays in this process; Claude only sees
 * the results. Projects are given as a path ("group/sub/project") or an id;
 * merge requests also as a full URL on an allowed host.
 */
export class GitlabToolProvider implements ToolProvider {
  readonly name = 'gitlab';

  constructor(
    private readonly gitlab: GitlabClient,
    private readonly baseUrl: string,
    private readonly allowedHosts: Set<string>,
  ) {}

  private project(p: string): string {
    const v = String(p ?? '').trim().replace(/^\/+|\/+$/g, '');
    if (!PROJECT_RE.test(v) || v.includes('..')) throw new Error(`Invalid GitLab project: ${p}`);
    return encodeURIComponent(v);
  }

  /** {url} or {project, iid} -> base URL + encoded project + iid. */
  private mr(args: { url?: string; project?: string; iid?: number }) {
    if (args.url) {
      const parsed = parseGitlabMrUrl(args.url, this.allowedHosts);
      return { base: `https://${parsed.host}`, project: encodeURIComponent(parsed.projectPath), iid: parsed.iid };
    }
    if (!args.project || !args.iid) throw new Error('Give either url, or project and iid');
    return { base: this.baseUrl, project: this.project(args.project), iid: args.iid };
  }

  private get(base: string, apiPath: string, raw = false) {
    return this.gitlab.apiGet(base, apiPath, raw);
  }

  tools(): AgentTool[] {
    const mrSchema = {
      url: z.string().optional().describe('Merge request URL'),
      project: z.string().optional().describe('Project path (group/project) or id, when no url'),
      iid: z.number().int().optional().describe('Merge request iid, when no url'),
    };
    return [
      {
        name: 'gitlab_get_mr',
        description: 'Merge request details: title, description, state, author, branches, reviewers, pipeline, changed files.',
        schema: mrSchema,
        readOnly: true,
        handler: async (args) => {
          const { base, project, iid } = this.mr(args);
          const mr = await this.get(base, `/projects/${project}/merge_requests/${iid}`);
          const changes = await this.get(base, `/projects/${project}/merge_requests/${iid}/changes`).catch(() => null);
          const files = (changes?.changes ?? []).map((c: any) => `- ${c.new_file ? 'A' : c.deleted_file ? 'D' : c.renamed_file ? 'R' : 'M'} ${c.new_path}`);
          return textResult(
            [
              `!${mr.iid} ${mr.title} [${mr.state}${mr.draft ? ', draft' : ''}]`,
              `${mr.web_url}`,
              `Author: ${mr.author?.name} · ${mr.source_branch} -> ${mr.target_branch}`,
              `Reviewers: ${(mr.reviewers ?? []).map((r: any) => r.name).join(', ') || '-'} · Merge status: ${mr.detailed_merge_status ?? mr.merge_status}`,
              `Pipeline: ${mr.head_pipeline?.status ?? '-'} · Updated: ${mr.updated_at}`,
              '',
              '## Description',
              mr.description || '(empty)',
              '',
              `## Changed files (${files.length})`,
              ...files,
            ].join('\n'),
          );
        },
      },
      {
        name: 'gitlab_get_mr_diff',
        description: 'Unified diff of a merge request, optionally only the files whose path contains `pathFilter`.',
        schema: { ...mrSchema, pathFilter: z.string().optional() },
        readOnly: true,
        handler: async (args) => {
          const { base, project, iid } = this.mr(args);
          const changes = await this.get(base, `/projects/${project}/merge_requests/${iid}/changes?access_raw_diffs=true`);
          const diffs = (changes.changes ?? [])
            .filter((c: any) => !args.pathFilter || String(c.new_path).includes(args.pathFilter))
            .map((c: any) => `diff --git a/${c.old_path} b/${c.new_path}\n${c.diff}`);
          return textResult(diffs.join('\n') || 'No matching changes.');
        },
      },
      {
        name: 'gitlab_list_branches',
        description: 'Branches of a project, newest first, optionally filtered by a search string.',
        schema: { project: z.string(), search: z.string().optional() },
        readOnly: true,
        handler: async (args) => {
          const q = args.search ? `&search=${encodeURIComponent(args.search)}` : '';
          const branches = await this.get(this.baseUrl, `/projects/${this.project(args.project)}/repository/branches?per_page=100${q}`);
          return textResult(
            (branches as any[])
              .sort((a, b) => String(b.commit?.committed_date).localeCompare(String(a.commit?.committed_date)))
              .map((b) => `${b.name}${b.default ? ' (default)' : ''} — ${String(b.commit?.committed_date).slice(0, 10)} ${b.commit?.author_name ?? ''}: ${b.commit?.title ?? ''}`)
              .join('\n') || 'No branches.',
          );
        },
      },
      {
        name: 'gitlab_get_file',
        description: 'Raw content of one file at a branch, tag or commit (use it to read code that is not checked out locally).',
        schema: { project: z.string(), ref: z.string().describe('Branch, tag or commit sha'), path: z.string().describe('File path in the repository') },
        readOnly: true,
        handler: async (args) => {
          const file = encodeURIComponent(String(args.path).replace(/^\/+/, ''));
          const text = await this.get(this.baseUrl, `/projects/${this.project(args.project)}/repository/files/${file}/raw?ref=${encodeURIComponent(args.ref)}`, true);
          return textResult(String(text));
        },
      },
      {
        name: 'gitlab_compare',
        description: 'Commits and diff between two refs (from..to) of a project, optionally only files whose path contains `pathFilter`.',
        schema: { project: z.string(), from: z.string(), to: z.string(), pathFilter: z.string().optional() },
        readOnly: true,
        handler: async (args) => {
          const cmp = await this.get(
            this.baseUrl,
            `/projects/${this.project(args.project)}/repository/compare?from=${encodeURIComponent(args.from)}&to=${encodeURIComponent(args.to)}`,
          );
          const commits = (cmp.commits ?? []).map((c: any) => `- ${c.short_id} ${c.author_name}: ${c.title}`);
          const diffs = (cmp.diffs ?? [])
            .filter((d: any) => !args.pathFilter || String(d.new_path).includes(args.pathFilter))
            .map((d: any) => `diff --git a/${d.old_path} b/${d.new_path}\n${d.diff}`);
          return textResult([`## Commits (${commits.length})`, ...commits, '', `## Diff (${diffs.length} files)`, ...diffs].join('\n'));
        },
      },
    ];
  }
}
