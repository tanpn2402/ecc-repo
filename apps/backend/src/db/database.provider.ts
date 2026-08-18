import * as fs from 'node:fs';
import * as path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

export const DATABASE_CONNECTION = Symbol('DATABASE_CONNECTION');
export const DRIZZLE_DB = Symbol('DRIZZLE_DB');

export type DrizzleDb = BetterSQLite3Database<typeof schema>;

/**
 * Idempotent bootstrap SQL — identical to the CREATE TABLE IF NOT EXISTS
 * statements SessionStore/MrStore ran today. Executed once at startup, never
 * via drizzle-kit push/migrate against DATABASE_PATH (see migration plan:
 * the live DB's schema already matches this exactly, so this only matters
 * for brand-new/test databases).
 */
const BOOTSTRAP_SQL = `
CREATE TABLE IF NOT EXISTS sessions (
  chat_id           INTEGER PRIMARY KEY,
  telegram_user_id  INTEGER NOT NULL,
  project           TEXT,
  workspace         TEXT,
  claude_session_id TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jira_issues (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  jira_url        TEXT NOT NULL UNIQUE,
  jira_key        TEXT NOT NULL UNIQUE,
  jira_project    TEXT NOT NULL,
  jira_issue_id   TEXT,
  title           TEXT,
  responsible     TEXT,
  sprint          TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS merge_requests (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  gitlab_url         TEXT NOT NULL UNIQUE,
  gitlab_project     TEXT NOT NULL,
  gitlab_mr_iid      INTEGER NOT NULL,
  jira_issue_id      INTEGER REFERENCES jira_issues(id) ON DELETE SET NULL,
  author             TEXT,
  title              TEXT,
  status             TEXT NOT NULL,
  error_message      TEXT,
  current_review_id  INTEGER,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL,
  UNIQUE(gitlab_project, gitlab_mr_iid)
);

CREATE INDEX IF NOT EXISTS idx_merge_requests_status ON merge_requests(status);
CREATE INDEX IF NOT EXISTS idx_merge_requests_updated_at ON merge_requests(updated_at);
CREATE INDEX IF NOT EXISTS idx_merge_requests_jira_issue_id ON merge_requests(jira_issue_id);

CREATE TABLE IF NOT EXISTS mr_reviews (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  merge_request_id        INTEGER NOT NULL REFERENCES merge_requests(id) ON DELETE CASCADE,
  status                  TEXT NOT NULL,
  summary                 TEXT,
  business_understanding  TEXT,
  technical_analysis      TEXT,
  test_analysis           TEXT,
  findings_json           TEXT,
  recommendations_json    TEXT,
  raw_result              TEXT,
  error_message           TEXT,
  created_at              TEXT NOT NULL,
  completed_at            TEXT
);

CREATE INDEX IF NOT EXISTS idx_mr_reviews_mr_id ON mr_reviews(merge_request_id);

-- "Jira Issues" page tables (BACKEND_SPEC.md). Kept separate from
-- jira_issues/merge_requests/mr_reviews above, which back the unrelated MR
-- Management feature with a different shape.
CREATE TABLE IF NOT EXISTS jira_issues_synced (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  jira_key          TEXT NOT NULL UNIQUE,
  summary           TEXT NOT NULL,
  labels            TEXT,
  priority          TEXT NOT NULL,
  sprint            TEXT,
  assignee          TEXT,
  status            TEXT NOT NULL,
  jira_updated_at   TEXT,
  synced_at         TEXT NOT NULL,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

-- No jira_synced_mrs table: MR data (author/status/etc.) is never
-- persisted — it's always resolved live from the Jira remote-link +
-- GitLab APIs on row expand. Review history is the one thing worth
-- keeping, keyed directly by gitlab_url instead of a synced-MR row id.
CREATE TABLE IF NOT EXISTS jira_review_runs (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  gitlab_url          TEXT NOT NULL,
  status              TEXT NOT NULL,
  verdict             TEXT,
  summary             TEXT,
  findings_json       TEXT,
  exec_by             TEXT NOT NULL,
  console_log         TEXT,
  error_message       TEXT,
  created_at          TEXT NOT NULL,
  completed_at        TEXT
);

CREATE INDEX IF NOT EXISTS idx_jira_review_runs_gitlab_url ON jira_review_runs(gitlab_url);
`;

export function createDatabaseConnection(databasePath: string): Database.Database {
  if (databasePath !== ':memory:') {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  }
  const db = new Database(databasePath);
  return db;
}

export function createDrizzleClient(connection: Database.Database): DrizzleDb {
  return drizzle(connection, { schema });
}
