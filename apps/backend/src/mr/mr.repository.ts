import { Inject, Injectable } from '@nestjs/common';
import { DRIZZLE_DB, type DrizzleDb } from '@/db/database.provider';
import { jiraIssuesSynced, jiraReviewRuns, mergeRequests } from '@/db/schema';
import logger from '@/common/logger';
import { desc, eq, sql } from 'drizzle-orm';

export type UpsertMrInput = {
  gitlabUrl: string;
  gitlabProject: string;
  gitlabMrIid: number;
  jiraKey?: string | null;
  author?: string | null;
  title?: string | null;
  status: string;
  createdAt?: string | null;
};

@Injectable()
export class MrRepository {
  constructor(@Inject(DRIZZLE_DB) private readonly db: DrizzleDb) {}

  async listMrs() {
    return this.db
      .select({
        id: mergeRequests.id,
        gitlabUrl: mergeRequests.gitlabUrl,
        gitlabProject: mergeRequests.gitlabProject,
        gitlabMrIid: mergeRequests.gitlabMrIid,

        jiraKey: mergeRequests.jiraKey,
        jiraTitle: jiraIssuesSynced.summary,

        author: mergeRequests.author,
        title: mergeRequests.title,
        status: mergeRequests.status,

        reviewStatus: sql<string | null>`(
          SELECT ${jiraReviewRuns.status}
          FROM ${jiraReviewRuns}
          WHERE ${jiraReviewRuns.gitlabUrl} = ${mergeRequests.gitlabUrl}
          ORDER BY ${jiraReviewRuns.createdAt} DESC
          LIMIT 1
        )`,

        reviewVerdict: sql<string | null>`(
          SELECT ${jiraReviewRuns.verdict}
          FROM ${jiraReviewRuns}
          WHERE ${jiraReviewRuns.gitlabUrl} = ${mergeRequests.gitlabUrl}
          ORDER BY ${jiraReviewRuns.createdAt} DESC
          LIMIT 1
        )`,

        reviewCompletedAt: sql<string | null>`(
          SELECT ${jiraReviewRuns.completedAt}
          FROM ${jiraReviewRuns}
          WHERE ${jiraReviewRuns.gitlabUrl} = ${mergeRequests.gitlabUrl}
          ORDER BY ${jiraReviewRuns.createdAt} DESC
          LIMIT 1
        )`,

        createdAt: mergeRequests.createdAt,
        updatedAt: mergeRequests.updatedAt,
      })
      .from(mergeRequests)
      .leftJoin(
        jiraIssuesSynced,
        eq(mergeRequests.jiraKey, jiraIssuesSynced.jiraKey),
      )
      .orderBy(desc(mergeRequests.createdAt));
  }

  async upsertMr(input: UpsertMrInput) {
    const now = new Date().toISOString();

    logger.info('[MrRepository] upsertMr ', { input });

    const [mr] = await this.db
      .insert(mergeRequests)
      .values({
        gitlabUrl: input.gitlabUrl,
        gitlabProject: input.gitlabProject,
        gitlabMrIid: input.gitlabMrIid,
        jiraKey: input.jiraKey ?? null,
        author: input.author ?? null,
        title: input.title ?? null,
        status: input.status,
        createdAt: input.createdAt ?? now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [mergeRequests.gitlabProject, mergeRequests.gitlabMrIid],
        set: {
          gitlabUrl: input.gitlabUrl,
          jiraKey: input.jiraKey ?? null,
          author: input.author ?? null,
          title: input.title ?? null,
          status: input.status,
          updatedAt: now,
        },
      })
      .returning();

    return mr;
  }
}
