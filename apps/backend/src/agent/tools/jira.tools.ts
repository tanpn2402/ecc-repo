import * as path from 'node:path';
import { z } from 'zod';
import JiraClient from '../../mr/jira-client';
import { JiraCacheService, normalizeKey } from '../../jira-cache/jira-cache.service';
import { type AgentTool, type ToolProvider, textResult } from '../tool-registry';

/** Jira tools: cache issues under ~/.ecc/jira and search with JQL. */
export class JiraToolProvider implements ToolProvider {
  readonly name = 'jira';

  constructor(
    private readonly cache: JiraCacheService,
    private readonly jira: JiraClient | null,
  ) {}

  tools(): AgentTool[] {
    return [
      {
        name: 'jira_fetch_issue',
        description:
          'Download a Jira issue (description, all custom fields, issue links, remote links such as merge requests, comments, attachments) into the local cache and return the paths. Read issue.md first; attachments/ holds the files. Use includeLinked to also cache the linked issues, parent and subtasks.',
        schema: {
          key: z.string().describe('Issue key, e.g. CORE-123'),
          includeLinked: z.boolean().optional().describe('Also cache directly linked issues (max 10)'),
          refresh: z.boolean().optional().describe('Ignore the cache and fetch again'),
        },
        readOnly: true,
        handler: async (args, ctx) => {
          const issue = await this.cache.ensure(normalizeKey(args.key), {
            force: !!args.refresh,
            includeLinked: !!args.includeLinked,
          });
          ctx.emit({ type: 'jira_cached', key: issue.key, summary: issue.summary, status: issue.status, dir: issue.dir, attachments: issue.attachments.length });
          const files = issue.attachments.filter((a) => a.file).map((a) => path.join(issue.dir, a.file!));
          return textResult(
            [
              `${issue.key}: ${issue.summary} [${issue.status}]`,
              `Folder: ${issue.dir}`,
              `Read: ${path.join(issue.dir, 'issue.md')}`,
              `Custom fields (JSON): ${path.join(issue.dir, 'fields.json')}`,
              `Links (JSON): ${path.join(issue.dir, 'links.json')}`,
              files.length ? `Attachments:\n${files.map((f) => `- ${f}`).join('\n')}` : 'No downloaded attachments.',
              issue.linkedKeys.length ? `Linked: ${issue.linkedKeys.join(', ')}${args.includeLinked ? ' (cached as sibling folders)' : ''}` : '',
            ]
              .filter(Boolean)
              .join('\n'),
          );
        },
      },
      {
        name: 'jira_search',
        description: 'Search Jira with JQL. Returns key, summary, status, assignee, updated for up to 50 issues.',
        schema: {
          jql: z.string().describe('JQL, e.g. project = CORE AND text ~ "settlement" ORDER BY updated DESC'),
          limit: z.number().int().min(1).max(50).optional(),
        },
        readOnly: true,
        handler: async (args) => {
          if (!this.jira) return textResult('Jira is not configured on the server.', true);
          const issues = await this.jira.searchIssues(args.jql, { maxResults: args.limit ?? 20 });
          if (!issues.length) return textResult('No issues match.');
          return textResult(
            issues.map((i) => `${i.key} [${i.status}] ${i.summary} — ${i.assignee ?? 'unassigned'}, updated ${i.updated.slice(0, 10)}`).join('\n'),
          );
        },
      },
    ];
  }
}
