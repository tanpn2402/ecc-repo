import { sqliteTable, integer, text, real, index, primaryKey } from 'drizzle-orm/sqlite-core';

/**
 * Analysis tab (docs/epics/EPIC-001-analysis-tab.md). Only metadata lives
 * here: chat content is the Claude Code transcript of each thread
 * (~/.claude/projects/...), events of the running turn are in
 * ~/.ecc/sessions/<sessionId>/events.ndjson.
 */
export const analysisWorkspaces = sqliteTable('analysis_workspaces', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  /** Absolute folder on the backend machine (inside ANALYSIS_ROOTS). */
  path: text('path').notNull(),
  /** Notes appended to the system prompt of every thread of the workspace. */
  contextMd: text('context_md').notNull().default(''),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

/** One thread = one Claude Code session (session_id is its transcript id). */
export const analysisThreads = sqliteTable(
  'analysis_threads',
  {
    sessionId: text('session_id').primaryKey(),
    workspaceId: integer('workspace_id').notNull(),
    title: text('title'),
    cwd: text('cwd').notNull(),
    addDirsJson: text('add_dirs_json').notNull().default('[]'),
    model: text('model').notNull().default(''),
    started: integer('started', { mode: 'boolean' }).notNull().default(false),
    turns: integer('turns').notNull().default(0),
    costUsd: real('cost_usd').notNull().default(0),
    eventSeq: integer('event_seq').notNull().default(0),
    lastBranch: text('last_branch'),
    lastOwnActivity: integer('last_own_activity').notNull().default(0),
    turnEntryCount: integer('turn_entry_count'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    workspaceIdx: index('idx_analysis_threads_workspace').on(table.workspaceId),
  }),
);

/** Jira issues a thread mentioned or fetched (Context panel). */
export const analysisThreadJira = sqliteTable(
  'analysis_thread_jira',
  {
    sessionId: text('session_id').notNull(),
    jiraKey: text('jira_key').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.sessionId, table.jiraKey] }),
  }),
);
