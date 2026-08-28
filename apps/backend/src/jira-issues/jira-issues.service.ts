import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { JiraClient } from '../mr/jira-client';
import { GitlabClient } from '../mr/gitlab-client';
import { extractGitlabMrLinks } from '../mr/remote-link-extract';
import { parseGitlabMrUrl } from '../mr/gitlab-url';
import type { ParsedGitlabMrUrl } from '../mr/gitlab-url';
import { parseJiraIssueInput } from './parse-issue-input';
import {
  JiraIssuesRepository,
  JiraIssueSyncedRow,
  JiraReviewRunRow,
} from './jira-issues.repository';
import { ClaudeClient } from '../claude/claude-client';
import { WorkspaceService } from '../workspace/workspace.service';
import { buildJiraReviewPrompt } from './jira-review-prompt';
import { parseJiraReviewResult } from './jira-review-parser';
import { formatConsoleChunk } from './format-console-chunk';
import {
  mapJiraStatus,
  mapJiraPriority,
  avatarInitial,
  avatarColorVar,
  encodeMrId,
  decodeMrId,
} from './jira-mapping';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/configuration';
import logger from '../common/logger';
import { MrRepository } from '@/mr/mr.repository';

export interface MergeRequestDto {
  id: number;
  mrId: string; // = encodeMrId(gitlabUrl)
  gitlabUrl: string;
  gitlabProject: string;
  gitlabMrIid: number;
  jiraKey: string | null;
  jiraTitle: string | null;
  author: string | null;
  title: string | null;
  status: string;
  reviewStatus: string | null;
  reviewVerdict: string | null;
  reviewCompletedAt: string | null;
  createdAt: string | null;
}

export interface IssueDto {
  key: string;
  summary: string;
  labels?: string;
  priority: 'High' | 'Medium' | 'Low';
  sprint: string;
  group: string;
  assignee: string;
  avatarInitial: string;
  avatarColorVar: string;
  status: string;
  updated: string;
  createdAt: string;
}

export interface AtlassianIssueDto extends IssueDto {
  synced: boolean;
}

export interface ReviewRunDto {
  id: string;
  status: string;
  verdict: string | null;
  summary: string | null;
  findings: Array<{ severity: string; text: string }>;
  execBy: string;
  consoleLog: string | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface GitlabMr {
  gitlabUrl: string;
  gitlabProject: string;
  gitlabMrIid: number;
  gitlabState: string;
  author: string | null;
  authorId: number | null;
  createdAt: string | null;
}

export interface JiraMeta {
  groups: { id: string; name: string }[];
}

export interface GetSyncedIssueQuery {
  group?: string;
}
/**
 * MR data (author/status/lastRun/etc.) is never persisted — every table row
 * and every row-expand always resolves it live from the Jira remote-link +
 * GitLab APIs (see getLiveMrs). The only thing that *is* persisted here is
 * which issues have been synced (jira_issues_synced) and review run history
 * (jira_review_runs, keyed by the MR's gitlab_url) — review history is
 * intentionally independent of Jira-issue sync state, so reviewing an MR
 * works the same whether or not its issue has ever been synced.
 */
@Injectable()
export class JiraIssuesService extends EventEmitter {
  /** mrIds with a review job currently running (queued or executing) — guards against a double-submit. */
  private readonly activeReviews = new Set<string>();

  /**
   * mrId -> console log accumulated so far for its in-flight review. Mirrors
   * what's being persisted to jira_review_runs.console_log (see
   * appendLiveConsole) and is exposed via getLiveConsoleLog so a client that
   * opens the Console tab mid-review can ask over the WebSocket for the
   * current transcript instead of racing a REST read against the DB writes
   * still streaming in (see MrGateway's jira.review.subscribe handling).
   */
  private readonly liveConsoleLogs = new Map<string, string>();

  private gitlabUserMap: Map<string, string> = new Map();

  constructor(
    @Inject(JiraClient) private readonly jiraClient: JiraClient | null,
    @Inject(GitlabClient) private readonly gitlabClient: GitlabClient,
    @Inject(JiraIssuesRepository)
    private readonly issuesRepo: JiraIssuesRepository,
    @Inject(MrRepository) private readonly mrRepo: MrRepository,
    @Inject(ClaudeClient) private readonly claudeClient: ClaudeClient,
    @Inject(WorkspaceService)
    private readonly workspaceService: WorkspaceService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {
    super();
    config.gitlabActivities.users.forEach((user) => {
      this.gitlabUserMap.set(String(user.id), user.name);
    });
  }

  private mapSyncedIssue(row: JiraIssueSyncedRow): IssueDto {
    return {
      key: row.jiraKey,
      summary: row.summary,
      labels: row.labels ?? undefined,
      priority: row.priority as IssueDto['priority'],
      sprint: row.sprint || 'Backlog',
      group: row.group || '',
      assignee: row.assignee || 'Unassigned',
      avatarInitial: avatarInitial(row.assignee),
      avatarColorVar: avatarColorVar(row.assignee),
      status: '-', // Will be updated via jira.data.updated
      updated: row.jiraUpdatedAt ?? '',
      createdAt: row.createdAt,
    };
  }

  private requireJiraClient(): JiraClient {
    if (!this.jiraClient) {
      throw new Error(
        'Jira is not configured (set JIRA_EMAIL and JIRA_API_TOKEN)',
      );
    }
    return this.jiraClient;
  }

  /**
   * Resolves one candidate GitLab MR link to author/status via the GitLab
   * API. Returns null on any GitLab-side failure (private/deleted project,
   * network error, etc.) so callers can just skip that one link.
   */
  private async resolveGitlabMr(
    mrUrl: ParsedGitlabMrUrl,
  ): Promise<GitlabMr | null> {
    try {
      const mr = await this.gitlabClient.fetchMr({
        gitlabUrl: mrUrl.canonicalUrl,
        gitlabProject: mrUrl.projectPath,
        gitlabMrIid: mrUrl.iid,
      });
      return {
        gitlabUrl: mrUrl.canonicalUrl,
        gitlabProject: mrUrl.projectPath,
        gitlabMrIid: mrUrl.iid,
        author: mr.author || null,
        authorId: mr.authorId || null,
        gitlabState: mr.state,
        createdAt: mr.createdAt,
      };
    } catch (err: any) {
      logger.warn('GitLab MR resolution failed, skipping this MR', {
        mrUrl: mrUrl.canonicalUrl,
        error: err.message,
      });
      // return null;
      return {
        gitlabUrl: mrUrl.canonicalUrl,
        gitlabProject: mrUrl.projectPath,
        gitlabMrIid: mrUrl.iid,
        author: 'dev',
        authorId: null,
        gitlabState: 'opened',
        createdAt: new Date().getTime().toString(),
      };
    }
  }

  private buildMrDto(resolved: GitlabMr): MergeRequestDto {
    const latest = this.issuesRepo.getLatestReviewForUrl(resolved.gitlabUrl);
    logger.info(`[buildMrDto] latest: ${JSON.stringify(latest)}`);

    return {
      id: -1,
      mrId: encodeMrId(resolved.gitlabUrl),
      gitlabUrl: resolved.gitlabUrl,
      gitlabProject: resolved.gitlabProject,
      gitlabMrIid: resolved.gitlabMrIid,
      jiraKey: null,
      jiraTitle: null,
      author:
        (resolved.authorId
          ? this.gitlabUserMap.get(String(resolved.authorId))
          : resolved.author) ||
        resolved.author ||
        'Unknown',
      title: null,
      status: resolved.gitlabState,
      reviewStatus: latest?.status ?? null,
      reviewVerdict: latest?.verdict ?? null,
      reviewCompletedAt: latest?.completedAt ?? null,
      createdAt: resolved.createdAt,
    };
  }

  /** GET /api/jira/issues (BACKEND_SPEC.md §3). */
  async listAtlassianIssues(): Promise<AtlassianIssueDto[]> {
    const jira = this.requireJiraClient();
    const jql = `"cf[10020]" = 10379 AND assignee = currentUser()`;
    const results = await jira.searchIssues(jql);

    return results.map((issue) => {
      const synced = this.issuesRepo.getSyncedByKey(issue.key);
      return {
        key: issue.key,
        summary: issue.summary,
        priority: mapJiraPriority(issue.priority),
        sprint: issue.sprint || 'Backlog',
        group: synced?.group || '',
        assignee: issue.assignee || 'Unassigned',
        avatarInitial: avatarInitial(issue.assignee),
        avatarColorVar: avatarColorVar(issue.assignee),
        status: mapJiraStatus(issue.status),
        updated: issue.updated,
        createdAt: issue.createdAt,
        synced: Boolean(synced),
      };
    });
  }

  /**
   * GET /api/jira/issues/:key/mrs — live, read-only preview of the GitLab
   * MRs linked to a Jira issue via its remote links (BACKEND_SPEC.md §3's
   * "resolve them live via the GitLab API" alternative). Nothing here is
   * persisted, for either an unsynced or already-synced issue — call this
   * on-demand (row expand), not for every row on page load, to avoid
   * hammering GitLab. Review history (lastRun/actionLabel) is looked up by
   * gitlab_url regardless of sync state.
   */
  async getLiveMrs(issueKey: string): Promise<MergeRequestDto[]> {
    const jira = this.requireJiraClient();
    const remoteLinks = await jira.fetchRemoteLinks(issueKey);
    logger.info(`[getLiveMrs] ${issueKey}: ${JSON.stringify(remoteLinks)}`);
    const gitlabMrs = extractGitlabMrLinks(
      remoteLinks,
      this.config.mr.gitlabAllowedHosts,
    );

    const resolved = (
      await Promise.all(gitlabMrs.map((mrUrl) => this.resolveGitlabMr(mrUrl)))
    ).filter((mr): mr is NonNullable<typeof mr> => mr !== null);

    setImmediate(() => {
      const jira = this.issuesRepo.getSyncedByKey(issueKey);
      if (jira) {
        resolved.map(
          ({
            gitlabUrl,
            author,
            createdAt,
            gitlabMrIid,
            gitlabProject,
            gitlabState,
          }) => {
            this.mrRepo.upsertMr({
              gitlabUrl,
              gitlabProject,
              gitlabMrIid,
              jiraKey: issueKey,
              author,
              createdAt,
              title: '',
              status: gitlabState,
            });
          },
        );
      }
    });

    return resolved.map((mr) => this.buildMrDto(mr));
  }

  /**
   * POST /api/jira/issues/:key/sync (BACKEND_SPEC.md §4) — persists the
   * Jira issue's own fields only. MR data is deliberately not touched here
   * at all (see class docblock); the "Synced Issues" table's MR sub-table
   * resolves the same way as the Atlassian table's, via getLiveMrs.
   */
  async syncIssue(
    issueKey: string,
    data?: { group?: string },
  ): Promise<IssueDto> {
    const jira = this.requireJiraClient();
    const [fresh] = await jira.searchIssues(`key=${issueKey}`);
    if (!fresh) {
      throw new NotFoundException(`Jira issue "${issueKey}" not found`);
    }

    this.issuesRepo.upsertSyncedIssue({
      jiraKey: fresh.key,
      summary: fresh.summary,
      labels: null,
      priority: mapJiraPriority(fresh.priority),
      sprint: fresh.sprint || 'Backlog',
      group: data?.group || '',
      assignee: fresh.assignee,
      status: mapJiraStatus(fresh.status),
      jiraUpdatedAt: fresh.updated || null,
      createdAt: fresh.createdAt,
    });

    return this.mapSyncedIssue(this.issuesRepo.getSyncedByKey(issueKey)!);
  }

  async updateIssue(issueKey: string, data: { group?: string }) {
    const jira = this.issuesRepo.getSyncedByKey(issueKey);
    if (!jira) {
      throw new NotFoundException(`Jira issue "${issueKey}" not found`);
    }

    this.issuesRepo.upsertSyncedIssue({
      ...jira,
      group: data.group ?? null,
    });

    return this.mapSyncedIssue(this.issuesRepo.getSyncedByKey(issueKey)!);
  }

  /** GET /api/synced-issues (BACKEND_SPEC.md §5). */
  listSyncedIssues(query?: GetSyncedIssueQuery): IssueDto[] {
    const result = this.issuesRepo
      .listSynced(query)
      .map((row) => this.mapSyncedIssue(row));
    this.getLiveJiraStatus(result);
    return result;
  }

  async getLiveJiraStatus(issues: IssueDto[]) {
    if (!this.jiraClient || !issues.length) {
      return;
    }
    const keys = issues.map((issue) => issue.key).filter(Boolean);
    const data = await this.jiraClient.getIssueData(keys);
    const result = Object.values(data);
    this.emit('jira.data.updated', result);
  }

  /**
   * DELETE /api/synced-issues/:key — the "Done" button on the Synced Issues
   * table. Only removes the jira_issues_synced row; it's a purely local
   * "stop tracking this issue" action and never touches Jira itself, so the
   * issue can reappear here later via Sync/Add Issue if needed.
   */
  removeSyncedIssue(issueKey: string): void {
    const removed = this.issuesRepo.removeSyncedIssue(issueKey);
    if (!removed) {
      throw new NotFoundException(`"${issueKey}" is not a synced issue`);
    }
  }

  /**
   * POST /api/jira/issues/add — the "Add Issue" modal's manual entry path.
   * Accepts a Jira issue key ("CORE-123"/"REQ-456") or a full issue URL,
   * validates/normalizes it (parseJiraIssueInput), then syncs it exactly
   * like the per-row Sync button (syncIssue already fetches by key alone —
   * it never required the issue to appear in the live JQL-filtered list —
   * so this works for any project, not just JIRA_PROJECT/"CORE").
   */
  async addIssue({
    input,
    group,
  }: {
    input: string;
    group: string;
  }): Promise<IssueDto> {
    const allowedHosts = new Set([
      new URL(this.config.mr.jiraBaseUrl).hostname,
    ]);
    let issueKey: string;
    try {
      issueKey = parseJiraIssueInput(input, allowedHosts);
    } catch (err: any) {
      throw new BadRequestException(err.message);
    }
    return this.syncIssue(issueKey, { group });
  }

  private mapReview(row: JiraReviewRunRow): ReviewRunDto {
    let findings: Array<{ severity: string; text: string }> = [];
    try {
      findings = row.findingsJson ? JSON.parse(row.findingsJson) : [];
    } catch {
      findings = [];
    }
    return {
      id: String(row.id),
      status: row.status,
      verdict: row.verdict,
      summary: row.summary,
      findings,
      execBy: row.execBy,
      consoleLog: row.consoleLog,
      errorMessage: row.errorMessage,
      createdAt: row.createdAt,
      completedAt: row.completedAt,
    };
  }

  /**
   * The live, in-memory transcript of the review currently running for this
   * mrId — null if none is in flight. Backs MrGateway's jira.review.subscribe
   * handler: a client that opens the Console tab for an MR mid-review asks
   * for this over the WebSocket (see docblock on liveConsoleLogs) rather
   * than trusting a REST snapshot that could be one write behind the live
   * stream it's about to start receiving.
   */
  getLiveConsoleLog(mrId: string): string | null {
    return this.liveConsoleLogs.has(mrId)
      ? this.liveConsoleLogs.get(mrId)!
      : null;
  }

  /** GET /api/merge-requests/:mrId/reviews (BACKEND_SPEC.md §6/§9/§10). */
  getMrReviews(mrId: string): {
    latest: ReviewRunDto | null;
    history: ReviewRunDto[];
  } {
    const gitlabUrl = decodeMrId(mrId);
    if (!gitlabUrl) throw new NotFoundException('Merge request not found');
    const rows = this.issuesRepo.listReviewsForUrl(gitlabUrl);
    const latestCompletedReview =
      this.issuesRepo.getLatestCompletedReviewForUrl(gitlabUrl);
    return {
      latest: latestCompletedReview
        ? this.mapReview(latestCompletedReview)
        : null,
      history: rows.map((row) => this.mapReview(row)),
    };
  }

  /**
   * POST /api/merge-requests/:mrId/review (BACKEND_SPEC.md §7) — real,
   * asynchronous Claude Code review (stage 5). The caller picks which
   * configured WORKSPACE_<NAME> to run in (see GET /api/workspaces); this
   * returns immediately with the `queued` row, and the review itself runs
   * in the background, emitting `jira.review.started/console/completed/failed`
   * (forwarded over the existing `/ws` connection by MrGateway) so the
   * frontend can watch it live. Guards against double-submitting a review
   * for the same MR while one is already in flight.
   *
   * Since MR status is never persisted (always resolved live from GitLab),
   * a completed review has no stored status to update — it only ever
   * affects jira_review_runs, which getLiveMrs picks up on its next call to
   * derive lastRun/actionLabel.
   */
  async triggerReview(
    mrId: string,
    workspaceName: string,
    jiraKey: string,
    devFeedback?: string,
  ): Promise<ReviewRunDto> {
    const gitlabUrl = decodeMrId(mrId);
    if (!gitlabUrl) throw new NotFoundException('Merge request not found');

    let parsed: ParsedGitlabMrUrl;
    try {
      parsed = parseGitlabMrUrl(gitlabUrl, this.config.mr.gitlabAllowedHosts);
    } catch {
      throw new NotFoundException('Merge request not found');
    }

    const validation = this.workspaceService.validate(workspaceName);
    if (!validation.ok) {
      throw new BadRequestException(
        validation.reason === 'unknown_project'
          ? `Unknown workspace "${workspaceName}"`
          : `Workspace "${workspaceName}" is configured but its directory does not exist on disk`,
      );
    }

    if (this.activeReviews.has(mrId)) {
      throw new ConflictException(
        'A review for this merge request is already in progress',
      );
    }

    const queued = this.issuesRepo.createReviewQueued(
      gitlabUrl,
      'Claude Review Agent',
    );
    this.activeReviews.add(mrId);
    this.liveConsoleLogs.set(mrId, '');

    this._runReview(
      mrId,
      parsed,
      validation.dir,
      queued.id,
      workspaceName,
      jiraKey,
      devFeedback,
    )
      .catch((err: any) =>
        logger.error('Unhandled error running Jira MR review job', {
          mrId,
          error: err.stack || err.message,
        }),
      )
      .finally(() => this.activeReviews.delete(mrId));

    return this.mapReview(queued);
  }

  getMeta(): JiraMeta {
    return {
      groups: this.config.jiraIssuesPage.jiraGroups,
    };
  }

  /**
   * Appends one formatted console chunk both to the in-memory live buffer
   * (liveConsoleLogs) and to jira_review_runs.console_log, so the two stay
   * in lockstep — whatever a WebSocket subscriber is handed as a snapshot is
   * exactly what's durably persisted at that instant.
   */
  private appendLiveConsole(
    mrId: string,
    reviewId: number,
    chunk: string,
  ): void {
    this.liveConsoleLogs.set(
      mrId,
      (this.liveConsoleLogs.get(mrId) || '') + chunk,
    );
    this.issuesRepo.appendConsoleLog(reviewId, chunk);
  }

  private async _runReview(
    mrId: string,
    parsedMr: ParsedGitlabMrUrl,
    cwd: string,
    reviewId: number,
    workspaceName: string,
    jiraKey: string,
    devFeedback?: string,
  ): Promise<void> {
    this.issuesRepo.setReviewRunning(reviewId);
    this.emit('jira.review.started', {
      mrId,
      jiraKey,
      reviewId: String(reviewId),
    });

    if (!this.config.app.isProduction) {
      await this._simulateReview(mrId, reviewId, jiraKey);
      return;
    }

    const onEvent = (evt: any) => {
      const chunk = formatConsoleChunk(evt);
      if (!chunk) return;
      this.appendLiveConsole(mrId, reviewId, chunk);
      logger.info('Claude code-review console output', { mrId, chunk });
      this.emit('jira.review.console', {
        mrId,
        reviewId: String(reviewId),
        chunk,
      });
    };

    try {
      const reviewSkill =
        this.config.mr.reviewSkills.get(workspaceName.toLowerCase()) ||
        this.config.mr.defaultReviewSkill;
      const prompt = buildJiraReviewPrompt({
        mrUrl: parsedMr.canonicalUrl,
        gitlabProject: parsedMr.projectPath,
        reviewSkill,
        gitlabToken: this.gitlabClient.token,
        devFeedback: devFeedback?.trim() || undefined,
      });

      logger.info('Claude code-review prompt', { mrId, reviewSkill, prompt });

      const result = await this.claudeClient.run(
        `jira-mr:${mrId}`,
        { cwd, prompt },
        { onEvent },
      );
      if (result.isError) {
        throw new Error(result.text || 'Claude returned an error');
      }

      logger.info('Claude code-review result', { mrId, result });

      const parsedResult = parseJiraReviewResult(result.text);
      if (!parsedResult.ok) {
        throw new Error(
          `Claude did not return a valid structured review: ${parsedResult.error}`,
        );
      }

      const completed = this.issuesRepo.completeReview(reviewId, {
        status: parsedResult.value.status,
        verdict: parsedResult.value.verdict,
        summary: parsedResult.value.summary,
        findings: [],
        consoleLog: this.liveConsoleLogs.get(mrId) || '',
      });
      this.liveConsoleLogs.delete(mrId);
      this.emit('jira.review.completed', {
        mrId,
        jiraKey,
        reviewId: String(reviewId),
        review: this.mapReview(completed),
      });
    } catch (err: any) {
      logger.error('Jira MR review failed', { mrId, error: err.message });
      this.issuesRepo.failReview(
        reviewId,
        err.message,
        this.liveConsoleLogs.get(mrId) || '',
      );
      this.liveConsoleLogs.delete(mrId);
      this.emit('jira.review.failed', {
        mrId,
        reviewId: String(reviewId),
        error: err.message,
      });
    }
  }

  /**
   * Non-production stand-in for _runReview's real Claude invocation — lets
   * the Jira Issues page's review flow (console streaming, 2-minute-ish
   * turnaround) be exercised end-to-end in dev/staging without spending a
   * real Claude Code run. Gated by config.app.isProduction (NODE_ENV).
   */
  private async _simulateReview(
    mrId: string,
    reviewId: number,
    jiraKey: string,
  ): Promise<void> {
    const totalMs = 90_000;
    const steps = [
      '▸ Claude session started\n',
      '▸ Loading review configuration…\n',
      '▸ Fetching Jira issue…\n',
      '✓ Jira issue loaded.\n',
      '▸ Fetching GitLab merge request…\n',
      '✓ Merge request found.\n',
      '▸ Reading merge request description…\n',
      '▸ Reading linked Jira requirements…\n',
      '▸ Checking changed files…\n',
      '▸ Found 8 changed files.\n',
      '▸ Reading source changes…\n',
      '▸ Analyzing backend changes…\n',
      '▸ Analyzing frontend changes…\n',
      '▸ Checking API changes…\n',
      '▸ Checking database changes…\n',
      '▸ Checking error handling…\n',
      '▸ Checking logging and monitoring…\n',
      '▸ Searching for TODO comments…\n',
      '✓ No TODO issues found.\n',
      '▸ Checking potential edge cases…\n',
      '▸ Reviewing code style…\n',
      '▸ Reviewing naming and structure…\n',
      '▸ Checking test coverage…\n',
      '▸ Running relevant tests…\n',
      '✓ All relevant tests passed.\n',
      '▸ Comparing implementation with requirements…\n',
      '▸ Checking for missing requirements…\n',
      '▸ Preparing review findings…\n',
      '▸ Generating review summary…\n',
      '✓ Review completed. No blocking issues found.\n',
    ];
    const stepDelayMs = Math.floor(totalMs / (steps.length + 1));

    try {
      for (const chunk of steps) {
        await sleep(stepDelayMs);
        this.appendLiveConsole(mrId, reviewId, chunk);
        this.emit('jira.review.console', {
          mrId,
          reviewId: String(reviewId),
          chunk,
        });
      }
      await sleep(totalMs - stepDelayMs * steps.length);

      const completed = this.issuesRepo.completeReview(reviewId, {
        status: 'completed',
        verdict: 'Approved',
        summary:
          '[SIMULATED] Non-production environment — this review did not run Claude Code.',
        findings: [],
        consoleLog: this.liveConsoleLogs.get(mrId) || '',
      });
      this.liveConsoleLogs.delete(mrId);
      this.emit('jira.review.completed', {
        mrId,
        jiraKey,
        reviewId: String(reviewId),
        review: this.mapReview(completed),
      });
    } catch (err: any) {
      logger.error('Simulated Jira MR review failed', {
        mrId,
        error: err.message,
      });
      this.issuesRepo.failReview(
        reviewId,
        err.message,
        this.liveConsoleLogs.get(mrId) || '',
      );
      this.liveConsoleLogs.delete(mrId);
      this.emit('jira.review.failed', {
        mrId,
        reviewId: String(reviewId),
        error: err.message,
      });
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
