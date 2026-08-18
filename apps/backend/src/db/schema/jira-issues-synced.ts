import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';

/**
 * Issues the team has explicitly synced into ECC from the "Jira Issues"
 * page (BACKEND_SPEC.md §2-5). Deliberately a separate table from the
 * pre-existing `jira_issues` table (see database/schema/jira-issues.ts),
 * which backs the unrelated MR Management feature and has a different shape
 * (no priority/assignee/status — it only exists to link one Jira issue to
 * one GitLab MR). This table is the system of record for the Jira Issues
 * page's "Synced Issues" tab.
 */
export const jiraIssuesSynced = sqliteTable('jira_issues_synced', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  jiraKey: text('jira_key').notNull().unique(),
  summary: text('summary').notNull(),
  labels: text('labels'),
  priority: text('priority').notNull(),
  sprint: text('sprint'),
  group: text('group'),
  assignee: text('assignee'),
  status: text('status').notNull(),
  jiraUpdatedAt: text('jira_updated_at'),
  syncedAt: text('synced_at').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});
