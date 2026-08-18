import { sqliteTable, integer, text, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import { jiraIssues } from './jira-issues';

export const mergeRequests = sqliteTable(
  'merge_requests',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    gitlabUrl: text('gitlab_url').notNull().unique(),
    gitlabProject: text('gitlab_project').notNull(),
    gitlabMrIid: integer('gitlab_mr_iid').notNull(),
    jiraIssueId: integer('jira_issue_id').references(() => jiraIssues.id, { onDelete: 'set null' }),
    author: text('author'),
    title: text('title'),
    status: text('status').notNull(),
    errorMessage: text('error_message'),
    currentReviewId: integer('current_review_id'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    projectIidUnique: uniqueIndex('merge_requests_gitlab_project_gitlab_mr_iid_unique').on(
      table.gitlabProject,
      table.gitlabMrIid
    ),
    statusIdx: index('idx_merge_requests_status').on(table.status),
    updatedAtIdx: index('idx_merge_requests_updated_at').on(table.updatedAt),
    jiraIssueIdIdx: index('idx_merge_requests_jira_issue_id').on(table.jiraIssueId),
  })
);

export const MR_STATUSES = ['PENDING', 'REVIEWING', 'READY_TO_MERGE', 'BLOCKED', 'ERROR'] as const;
