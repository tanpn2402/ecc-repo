import { Inject, Injectable } from "@nestjs/common";
import { eq, desc, sql } from "drizzle-orm";
import { DRIZZLE_DB, type DrizzleDb } from "@/db/database.provider";
import { jiraIssuesSynced, jiraReviewRuns } from "@/db/schema";
import { GetSyncedIssueQuery } from "./jira-issues.service";

export type JiraIssueSyncedRow = typeof jiraIssuesSynced.$inferSelect;
export type JiraReviewRunRow = typeof jiraReviewRuns.$inferSelect;

export interface UpsertSyncedIssueInput {
  jiraKey: string;
  summary: string;
  labels: string | null;
  priority: string;
  sprint: string | null;
  group: string | null;
  assignee: string | null;
  status: string;
  jiraUpdatedAt: string | null;
}

/**
 * Only two things are persisted for the "Jira Issues" page: which issues
 * have been synced (jira_issues_synced), and review run history
 * (jira_review_runs, keyed by gitlab_url). MR data itself — author,
 * status, everything the GitLab API returns — is never stored; it's always
 * resolved live on row expand (see jira-issues.service.ts's getLiveMrs).
 */
@Injectable()
export class JiraIssuesRepository {
  constructor(@Inject(DRIZZLE_DB) private readonly db: DrizzleDb) {}

  getSyncedByKey(jiraKey: string): JiraIssueSyncedRow | null {
    return (
      this.db
        .select()
        .from(jiraIssuesSynced)
        .where(eq(jiraIssuesSynced.jiraKey, jiraKey))
        .get() ?? null
    );
  }

  getSyncedById(id: number): JiraIssueSyncedRow | null {
    return (
      this.db
        .select()
        .from(jiraIssuesSynced)
        .where(eq(jiraIssuesSynced.id, id))
        .get() ?? null
    );
  }

  listSynced(query?: GetSyncedIssueQuery): JiraIssueSyncedRow[] {
    const condition = query?.group
      ? eq(jiraIssuesSynced.group, query.group)
      : undefined;
      
    return this.db
      .select()
      .from(jiraIssuesSynced)
      .where(condition)
      .orderBy(desc(jiraIssuesSynced.jiraUpdatedAt))
      .all();
  }

  /** Removes a synced-issue row by jira_key ("Done" button on the Synced Issues table). Returns whether a row existed. */
  removeSyncedIssue(jiraKey: string): boolean {
    const info = this.db
      .delete(jiraIssuesSynced)
      .where(eq(jiraIssuesSynced.jiraKey, jiraKey))
      .run();
    return info.changes > 0;
  }

  /** Upserts the synced-issue row by jira_key (BACKEND_SPEC.md §4 step 2). */
  upsertSyncedIssue(input: UpsertSyncedIssueInput): JiraIssueSyncedRow {
    const now = new Date().toISOString();
    const existing = this.getSyncedByKey(input.jiraKey);
    if (existing) {
      this.db
        .update(jiraIssuesSynced)
        .set({ ...input, updatedAt: now })
        .where(eq(jiraIssuesSynced.id, existing.id))
        .run();
      return this.getSyncedById(existing.id)!;
    }
    const info = this.db
      .insert(jiraIssuesSynced)
      .values({ ...input, syncedAt: now, createdAt: now, updatedAt: now })
      .run();
    return this.getSyncedById(Number(info.lastInsertRowid))!;
  }

  createReviewQueued(gitlabUrl: string, execBy: string): JiraReviewRunRow {
    const now = new Date().toISOString();
    const info = this.db
      .insert(jiraReviewRuns)
      .values({ gitlabUrl, status: "queued", execBy, createdAt: now })
      .run();
    return this.getReviewById(Number(info.lastInsertRowid))!;
  }

  getReviewById(id: number): JiraReviewRunRow | null {
    return (
      this.db
        .select()
        .from(jiraReviewRuns)
        .where(eq(jiraReviewRuns.id, id))
        .get() ?? null
    );
  }

  /** queued -> running, once the Claude Code process actually starts. */
  setReviewRunning(id: number): JiraReviewRunRow {
    this.db
      .update(jiraReviewRuns)
      .set({ status: "running" })
      .where(eq(jiraReviewRuns.id, id))
      .run();
    return this.getReviewById(id)!;
  }

  /**
   * Appends one console chunk to a running review's console_log as it
   * streams in, so a page load/API call mid-review sees output-so-far
   * instead of null (only completeReview/failReview wrote it before, at the
   * very end). Uses a SQL-level concat rather than read-modify-write so
   * concurrent chunks for the same review can't clobber each other.
   */
  appendConsoleLog(id: number, chunk: string): void {
    const result = this.db
      .update(jiraReviewRuns)
      .set({
        consoleLog: sql`COALESCE(${jiraReviewRuns.consoleLog}, '') || ${chunk}`,
      })
      .where(eq(jiraReviewRuns.id, id))
      .returning({
        consoleLog: jiraReviewRuns.consoleLog,
      })
      .get();
    console.log("appendConsoleLog", result?.consoleLog);
  }

  /** queued/running -> failed. Persists whatever console output was captured before the failure, for debugging. */
  failReview(
    id: number,
    errorMessage: string,
    consoleLog: string,
  ): JiraReviewRunRow {
    const now = new Date().toISOString();
    this.db
      .update(jiraReviewRuns)
      .set({ status: "failed", errorMessage, consoleLog, completedAt: now })
      .where(eq(jiraReviewRuns.id, id))
      .run();
    return this.getReviewById(id)!;
  }

  completeReview(
    id: number,
    fields: {
      status: string;
      verdict: string;
      summary: string;
      findings: Array<{ severity: string; text: string }>;
      consoleLog: string;
    },
  ): JiraReviewRunRow {
    const now = new Date().toISOString();
    this.db
      .update(jiraReviewRuns)
      .set({
        status: fields.status,
        verdict: fields.verdict,
        summary: fields.summary,
        findingsJson: JSON.stringify(fields.findings),
        consoleLog: fields.consoleLog,
        completedAt: now,
      })
      .where(eq(jiraReviewRuns.id, id))
      .run();
    return this.getReviewById(id)!;
  }

  /** Most recent run for this MR, or null if it's never been reviewed. Used to derive lastRun/actionLabel. */
  getLatestReviewForUrl(gitlabUrl: string): JiraReviewRunRow | null {
    return (
      this.db
        .select()
        .from(jiraReviewRuns)
        .where(eq(jiraReviewRuns.gitlabUrl, gitlabUrl))
        .orderBy(desc(jiraReviewRuns.completedAt), desc(jiraReviewRuns.id))
        .limit(1)
        .get() ?? null
    );
  }

  /** Ordered newest-first by completed_at (BACKEND_SPEC.md §10), falling back to id for ties/in-flight rows. */
  listReviewsForUrl(gitlabUrl: string): JiraReviewRunRow[] {
    return this.db
      .select()
      .from(jiraReviewRuns)
      .where(eq(jiraReviewRuns.gitlabUrl, gitlabUrl))
      .orderBy(desc(jiraReviewRuns.completedAt), desc(jiraReviewRuns.id))
      .all();
  }
}
