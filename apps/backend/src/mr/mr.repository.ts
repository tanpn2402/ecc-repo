import { Inject, Injectable } from '@nestjs/common';
import { eq, and, or, like, asc, desc, sql, SQL } from 'drizzle-orm';
import { DRIZZLE_DB, type DrizzleDb } from "@/db/database.provider";
import { mergeRequests, jiraIssues, mrReviews, MR_STATUSES } from '@/db/schema';
import type { JiraIssue } from './jira-client';

export { MR_STATUSES };

export interface MrRow {
  id: number;
  gitlabUrl: string;
  gitlabProject: string;
  gitlabMrIid: number;
  jiraId: string | null;
  jiraUrl: string | null;
  jiraTitle: string | null;
  responsible: string | null;
  sprint: string | null;
  author: string | null;
  title: string | null;
  status: string;
  errorMessage: string | null;
  currentReviewId: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface MrReviewRow {
  id: number;
  mergeRequestId: number;
  status: string;
  summary: string;
  businessUnderstanding: string;
  technicalAnalysis: string;
  testAnalysis: string;
  findings: string[];
  recommendations: string[];
  rawResult: string;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

type MergeRequestSelect = typeof mergeRequests.$inferSelect;
type JiraIssueSelect = typeof jiraIssues.$inferSelect;
type MrReviewSelect = typeof mrReviews.$inferSelect;

function mapJoinedRow(row: { mr: MergeRequestSelect; jira: JiraIssueSelect | null } | undefined): MrRow | null {
  if (!row) return null;
  const { mr, jira } = row;
  return {
    id: mr.id,
    gitlabUrl: mr.gitlabUrl,
    gitlabProject: mr.gitlabProject,
    gitlabMrIid: mr.gitlabMrIid,
    jiraId: jira?.jiraKey ?? null,
    jiraUrl: jira?.jiraUrl ?? null,
    jiraTitle: jira?.title ?? null,
    responsible: jira?.responsible ?? null,
    sprint: jira?.sprint ?? null,
    author: mr.author,
    title: mr.title,
    status: mr.status,
    errorMessage: mr.errorMessage,
    currentReviewId: mr.currentReviewId,
    createdAt: mr.createdAt,
    updatedAt: mr.updatedAt,
  };
}

function mapReview(row: MrReviewSelect | undefined): MrReviewRow | null {
  if (!row) return null;
  let findings: string[] = [];
  let recommendations: string[] = [];
  try {
    findings = row.findingsJson ? JSON.parse(row.findingsJson) : [];
  } catch {
    findings = [];
  }
  try {
    recommendations = row.recommendationsJson ? JSON.parse(row.recommendationsJson) : [];
  } catch {
    recommendations = [];
  }
  return {
    id: row.id,
    mergeRequestId: row.mergeRequestId,
    status: row.status,
    summary: row.summary || '',
    businessUnderstanding: row.businessUnderstanding || '',
    technicalAnalysis: row.technicalAnalysis || '',
    testAnalysis: row.testAnalysis || '',
    findings,
    recommendations,
    rawResult: row.rawResult || '',
    errorMessage: row.errorMessage || null,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
  };
}

export interface ListMrsParams {
  search?: string;
  status?: string;
  sort?: 'created_at' | 'updated_at' | 'status';
  order?: 'asc' | 'desc';
}

export interface ApplyMetadataInput {
  title: string | null;
  author: string | null;
  jira: JiraIssue | null;
}

export interface CompleteReviewValue {
  review: {
    status: string;
    summary: string;
    businessUnderstanding: string;
    technicalAnalysis: string;
    testAnalysis: string;
    findings: string[];
    recommendations: string[];
  };
  mergeRequestAuthor?: string | null;
  mergeRequestTitle?: string | null;
}

/**
 * Drizzle port of storage/mr-store.js's MrStore.
 *
 * FIX (see migration plan / confirmed with user): the live database and
 * this file's own bootstrap SQL already normalized Jira data into a
 * separate `jira_issues` table (`merge_requests.jira_issue_id` FK) — but
 * the pre-migration mapMr/applyMetadata/list() still read/wrote
 * jira_id/jira_url/jira_title/responsible/sprint as flat columns on
 * merge_requests, which don't exist there. That made applyMetadata() throw
 * a "no such column" SQLite error on every call (i.e. every POST /api/mrs).
 * This repository joins/upserts through jira_issues correctly instead.
 *
 * The same bug also existed in updateDetails() for the `responsible` field
 * (also a flat-column reference to a column that no longer exists on
 * merge_requests) — fixed the same way: routed to the linked jira_issues
 * row when one exists; a no-op (not an error) when the MR has no linked
 * Jira issue yet, since there is nowhere to persist "responsible" without
 * fabricating a placeholder Jira issue.
 */
@Injectable()
export class MrRepository {
  constructor(@Inject(DRIZZLE_DB) private readonly db: DrizzleDb) {}

  private baseQuery() {
    return this.db
      .select({ mr: mergeRequests, jira: jiraIssues })
      .from(mergeRequests)
      .leftJoin(jiraIssues, eq(mergeRequests.jiraIssueId, jiraIssues.id));
  }

  findByProjectAndIid(project: string, iid: number): MrRow | null {
    const row = this.baseQuery()
      .where(and(eq(mergeRequests.gitlabProject, project), eq(mergeRequests.gitlabMrIid, iid)))
      .get();
    return mapJoinedRow(row);
  }

  getById(id: number): MrRow | null {
    const row = this.baseQuery().where(eq(mergeRequests.id, id)).get();
    return mapJoinedRow(row);
  }

  /**
   * Creates a new MR record in PENDING status, or returns the existing one
   * (with existed:true) if the same GitLab project+iid was already submitted.
   */
  createOrGetMr({
    gitlabUrl,
    gitlabProject,
    gitlabMrIid,
  }: {
    gitlabUrl: string;
    gitlabProject: string;
    gitlabMrIid: number;
  }): { mr: MrRow; existed: boolean } {
    const existing = this.findByProjectAndIid(gitlabProject, gitlabMrIid);
    if (existing) {
      return { mr: existing, existed: true };
    }
    const now = new Date().toISOString();
    const info = this.db
      .insert(mergeRequests)
      .values({ gitlabUrl, gitlabProject, gitlabMrIid, status: 'PENDING', createdAt: now, updatedAt: now })
      .run();
    return { mr: this.getById(Number(info.lastInsertRowid))!, existed: false };
  }

  setStatus(id: number, status: string, errorMessage: string | null = null): MrRow | null {
    const now = new Date().toISOString();
    this.db.update(mergeRequests).set({ status, errorMessage, updatedAt: now }).where(eq(mergeRequests.id, id)).run();
    return this.getById(id);
  }

  static EDITABLE_FIELDS: Array<'title' | 'author' | 'responsible'> = ['title', 'author', 'responsible'];

  /**
   * Applies a manual edit (from the "Edit details" UI action) to one or more
   * of title/author/responsible. Only keys actually present in `fields` are
   * touched — an omitted key is left as-is, while an explicit empty string
   * clears that field to NULL. Never touches status/current_review_id.
   * `responsible` lives on jira_issues (see class docblock) — updated on the
   * linked jira_issues row if one exists, otherwise silently skipped (no
   * linked Jira issue to attach it to yet).
   */
  updateDetails(id: number, fields: Record<string, unknown> = {}): MrRow | null {
    const now = new Date().toISOString();
    const mrSets: { title?: string | null; author?: string | null } = {};
    if (Object.prototype.hasOwnProperty.call(fields, 'title')) {
      mrSets.title = normalizeField(fields.title);
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'author')) {
      mrSets.author = normalizeField(fields.author);
    }
    const hasResponsible = Object.prototype.hasOwnProperty.call(fields, 'responsible');
    const responsibleValue = hasResponsible ? normalizeField(fields.responsible) : undefined;

    if (Object.keys(mrSets).length === 0 && !hasResponsible) {
      return this.getById(id);
    }

    return this.db.transaction((tx) => {
      if (Object.keys(mrSets).length > 0) {
        tx.update(mergeRequests).set({ ...mrSets, updatedAt: now }).where(eq(mergeRequests.id, id)).run();
      }
      if (hasResponsible) {
        const current = tx.select({ jiraIssueId: mergeRequests.jiraIssueId }).from(mergeRequests).where(eq(mergeRequests.id, id)).get();
        if (current?.jiraIssueId) {
          tx.update(jiraIssues).set({ responsible: responsibleValue, updatedAt: now }).where(eq(jiraIssues.id, current.jiraIssueId)).run();
        }
      }
      const row = tx
        .select({ mr: mergeRequests, jira: jiraIssues })
        .from(mergeRequests)
        .leftJoin(jiraIssues, eq(mergeRequests.jiraIssueId, jiraIssues.id))
        .where(eq(mergeRequests.id, id))
        .get();
      return mapJoinedRow(row);
    });
  }

  list({ search = '', status = '', sort = 'updated_at', order = 'desc' }: ListMrsParams = {}): MrRow[] {
    const sortColumns = { created_at: mergeRequests.createdAt, updated_at: mergeRequests.updatedAt, status: mergeRequests.status };
    const sortCol = sortColumns[sort] || mergeRequests.updatedAt;
    const orderFn = order === 'asc' ? asc : desc;

    const conditions: SQL[] = [];
    if (status) {
      conditions.push(eq(mergeRequests.status, status));
    }
    if (search) {
      const q = `%${search}%`;
      conditions.push(
        or(
          like(jiraIssues.jiraKey, q),
          like(mergeRequests.title, q),
          like(jiraIssues.responsible, q),
          like(mergeRequests.author, q),
          like(jiraIssues.sprint, q),
          like(mergeRequests.gitlabProject, q),
          sql`CAST(${mergeRequests.gitlabMrIid} AS TEXT) LIKE ${q}`
        )!
      );
    }
    const where = conditions.length ? and(...conditions) : undefined;

    const rows = this.baseQuery()
      .where(where)
      .orderBy(orderFn(sortCol), orderFn(mergeRequests.id))
      .all();
    return rows.map((row) => mapJoinedRow(row)!);
  }

  createReviewRunning(mrId: number): number {
    const now = new Date().toISOString();
    const info = this.db.insert(mrReviews).values({ mergeRequestId: mrId, status: 'RUNNING', createdAt: now }).run();
    return Number(info.lastInsertRowid);
  }

  completeReview(reviewId: number, value: CompleteReviewValue, rawResult: string): void {
    const now = new Date().toISOString();
    this.db
      .update(mrReviews)
      .set({
        status: value.review.status,
        summary: value.review.summary,
        businessUnderstanding: value.review.businessUnderstanding,
        technicalAnalysis: value.review.technicalAnalysis,
        testAnalysis: value.review.testAnalysis,
        findingsJson: JSON.stringify(value.review.findings),
        recommendationsJson: JSON.stringify(value.review.recommendations),
        rawResult: rawResult || '',
        completedAt: now,
      })
      .where(eq(mrReviews.id, reviewId))
      .run();
  }

  failReview(reviewId: number, errorMessage: string): void {
    const now = new Date().toISOString();
    this.db.update(mrReviews).set({ status: 'FAILED', errorMessage, completedAt: now }).where(eq(mrReviews.id, reviewId)).run();
  }

  /**
   * Applies a completed, validated review result onto the parent MR row.
   * Deliberately never touches the Jira linkage — a review no longer looks
   * up Jira at all (see review-prompt.ts), so those fields are left exactly
   * as "Auto update details" (applyMetadata) last set them.
   */
  applyReviewToMr(mrId: number, reviewId: number, value: CompleteReviewValue): MrRow | null {
    const now = new Date().toISOString();
    this.db
      .update(mergeRequests)
      .set({
        status: value.review.status,
        currentReviewId: reviewId,
        errorMessage: null,
        author: value.mergeRequestAuthor ? value.mergeRequestAuthor : sql`${mergeRequests.author}`,
        title: value.mergeRequestTitle ? value.mergeRequestTitle : sql`${mergeRequests.title}`,
        updatedAt: now,
      })
      .where(eq(mergeRequests.id, mrId))
      .run();
    return this.getById(mrId);
  }

  /**
   * Applies a metadata-only refresh (from MR-creation intake, or the "Auto
   * update details" action: GitLab title/author + Jira "Responsible" custom
   * field, no code review) onto the parent MR row — see class docblock for
   * the jira_issues fix. Only overwrites title/author when this run
   * actually found a fresh value (COALESCE-equivalent); never erases a
   * previously-known Jira link just because this run's lookup came back
   * empty (jiraIssueId is left untouched when `jira` is null).
   */
  applyMetadata(mrId: number, value: ApplyMetadataInput): MrRow | null {
    const now = new Date().toISOString();

    return this.db.transaction((tx) => {
      let jiraIssueRowId: number | undefined;

      if (value.jira) {
        const jira = value.jira;
        const jiraProject = jira.id.includes('-') ? jira.id.split('-')[0] : jira.id;
        const existingJira = tx.select({ id: jiraIssues.id }).from(jiraIssues).where(eq(jiraIssues.jiraUrl, jira.url)).get();
        if (existingJira) {
          tx.update(jiraIssues)
            .set({ jiraKey: jira.id, jiraProject, title: jira.title, responsible: jira.responsible, sprint: jira.sprint, updatedAt: now })
            .where(eq(jiraIssues.id, existingJira.id))
            .run();
          jiraIssueRowId = existingJira.id;
        } else {
          const inserted = tx
            .insert(jiraIssues)
            .values({
              jiraUrl: jira.url,
              jiraKey: jira.id,
              jiraProject,
              title: jira.title,
              responsible: jira.responsible,
              sprint: jira.sprint,
              createdAt: now,
              updatedAt: now,
            })
            .run();
          jiraIssueRowId = Number(inserted.lastInsertRowid);
        }
      }

      tx.update(mergeRequests)
        .set({
          title: value.title ? value.title : sql`${mergeRequests.title}`,
          author: value.author ? value.author : sql`${mergeRequests.author}`,
          ...(jiraIssueRowId !== undefined ? { jiraIssueId: jiraIssueRowId } : {}),
          updatedAt: now,
        })
        .where(eq(mergeRequests.id, mrId))
        .run();

      const row = tx
        .select({ mr: mergeRequests, jira: jiraIssues })
        .from(mergeRequests)
        .leftJoin(jiraIssues, eq(mergeRequests.jiraIssueId, jiraIssues.id))
        .where(eq(mergeRequests.id, mrId))
        .get();
      return mapJoinedRow(row);
    });
  }

  getReview(reviewId: number): MrReviewRow | null {
    return mapReview(this.db.select().from(mrReviews).where(eq(mrReviews.id, reviewId)).get());
  }

  listReviews(mrId: number): MrReviewRow[] {
    // Secondary sort by id: two reviews created within the same millisecond
    // would otherwise tie on created_at and fall back to an unspecified
    // order, putting an older review first.
    const rows = this.db
      .select()
      .from(mrReviews)
      .where(eq(mrReviews.mergeRequestId, mrId))
      .orderBy(desc(mrReviews.createdAt), desc(mrReviews.id))
      .all();
    return rows.map((row) => mapReview(row)!);
  }
}

function normalizeField(raw: unknown): string | null {
  const value = typeof raw === 'string' ? raw.trim() : raw;
  return (value as string) || null;
}
