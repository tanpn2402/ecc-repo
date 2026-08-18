import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';

export const jiraIssues = sqliteTable('jira_issues', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  jiraUrl: text('jira_url').notNull().unique(),
  jiraKey: text('jira_key').notNull().unique(),
  jiraProject: text('jira_project').notNull(),
  jiraIssueId: text('jira_issue_id'),
  title: text('title'),
  responsible: text('responsible'),
  sprint: text('sprint'),
  group: text('group'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});
