import {
  sqliteTable,
  integer,
  text,
  uniqueIndex,
  index,
} from 'drizzle-orm/sqlite-core';

export const mergeRequests = sqliteTable(
  'merge_requests',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),

    gitlabUrl: text('gitlab_url').notNull().unique(),

    gitlabProject: text('gitlab_project').notNull(),

    gitlabMrIid: integer('gitlab_mr_iid').notNull(),

    jiraKey: text('jira_key'),

    author: text('author'),

    title: text('title'),

    status: text('status').notNull(),

    createdAt: text('created_at').notNull(),

    updatedAt: text('updated_at').notNull(),
  },

  (table) => ({
    projectIidUnique: uniqueIndex(
      'merge_requests_gitlab_project_gitlab_mr_iid_unique',
    ).on(table.gitlabProject, table.gitlabMrIid),

    statusIdx: index('idx_merge_requests_status').on(table.status),

    updatedAtIdx: index('idx_merge_requests_updated_at').on(table.updatedAt),

    jiraKeyIdx: index('idx_merge_requests_jira_key').on(table.jiraKey),
  }),
);

export const MR_STATUSES = [
  'PENDING',
  'REVIEWING',
  'READY_TO_MERGE',
  'BLOCKED',
  'ERROR',
] as const;

export type MrStatus = (typeof MR_STATUSES)[number];
