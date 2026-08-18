import { sqliteTable, integer, text, index } from 'drizzle-orm/sqlite-core';

/**
 * One row per Claude Code review run against a GitLab merge request
 * (BACKEND_SPEC.md §6/§7/§9/§10 — the spec's `ReviewRun` type, never
 * actually defined in the frontend, only described by shape).
 *
 * Keyed directly by `gitlab_url` rather than a foreign key into a
 * "synced MR" table — MR data (author/status/etc.) is never persisted at
 * all; it's always resolved live from the Jira remote-link + GitLab APIs on
 * row expand (see jira-issues.service.ts's getLiveMrs). Review history is
 * the one thing that *is* worth persisting, and it's intentionally
 * decoupled from Jira-issue sync state — reviewing an MR doesn't require
 * (and doesn't touch) the issue's `jira_issues_synced` row.
 */
export const jiraReviewRuns = sqliteTable(
  'jira_review_runs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    gitlabUrl: text('gitlab_url').notNull(),
    status: text('status').notNull(),
    verdict: text('verdict'),
    summary: text('summary'),
    findingsJson: text('findings_json'),
    execBy: text('exec_by').notNull(),
    consoleLog: text('console_log'),
    errorMessage: text('error_message'),
    createdAt: text('created_at').notNull(),
    completedAt: text('completed_at'),
  },
  (table) => ({
    gitlabUrlIdx: index('idx_jira_review_runs_gitlab_url').on(table.gitlabUrl),
  })
);

export const JIRA_REVIEW_STATUSES = ['queued', 'running', 'completed', 'failed'] as const;
