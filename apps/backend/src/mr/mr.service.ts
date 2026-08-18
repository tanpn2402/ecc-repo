import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { ClaudeClient } from '../claude/claude-client';
import { MrRepository, MrRow } from './mr.repository';
import { MrWorkspaceResolver } from './workspace-resolver';
import { GitlabClient } from './gitlab-client';
import { JiraClient } from './jira-client';
import { buildReviewPrompt } from './review-prompt';
import { parseReviewResult } from './review-parser';
import { extractJiraId } from './jira-id-extract';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/configuration';
import logger from '../common/logger';

interface QueueJob {
  mrId: number;
}

/**
 * Dedicated MR job manager. Runs a full code review under a Claude Code
 * invocation keyed by `mr:<id>` — a namespace that can never collide with a
 * Telegram numeric chat id, so MR jobs share the underlying
 * ClaudeClient/ClaudeProcess plumbing without ever sharing a queue, an
 * active-process slot, or a `--resume` session with a Telegram conversation.
 * No resumeSessionId is ever passed, so every run starts a fresh, isolated
 * Claude session. Port of mr/review-job-manager.js's ReviewJobManager.
 *
 * NOTE (confirmed during migration): the pre-migration class also defined a
 * `kind: 'metadata'`/`_runMetadataUpdate` job path implying a
 * `submitMetadataUpdate()` method described in its own docblock and in
 * README §16.6 ("Auto update details" going through Claude) — but no such
 * public method actually existed anywhere in the codebase, and
 * `POST /api/mrs/:id/auto-update` (http/app.js) only ever called
 * `fetchAndApplyIntakeMetadata` (the plain GitLab/Jira REST intake path,
 * below). That job kind was therefore unreachable dead code and has been
 * dropped here — this is a straight port of what actually executes, not a
 * behavior change. "Auto update details" remains the REST-only intake path.
 */
@Injectable()
export class MrService extends EventEmitter {
  private readonly maxConcurrent: number;
  private readonly reviewSkills: Map<string, string>;
  private readonly defaultReviewSkill: string;
  private readonly jiraBaseUrl: string;

  private readonly queue: QueueJob[] = [];
  private readonly active = new Set<number>();
  private readonly pending = new Set<number>();

  constructor(
    @Inject(ClaudeClient) private readonly claudeClient: ClaudeClient,
    @Inject(MrRepository) private readonly mrRepository: MrRepository,
    @Inject(MrWorkspaceResolver) private readonly workspaceResolver: MrWorkspaceResolver,
    @Inject(GitlabClient) private readonly gitlabClient: GitlabClient,
    @Inject(JiraClient) private readonly jiraClient: JiraClient | null,
    @Inject(APP_CONFIG) config: AppConfig
  ) {
    super();
    this.jiraBaseUrl = config.mr.jiraBaseUrl;
    this.maxConcurrent = config.mr.maxConcurrentReviews;
    this.reviewSkills = config.mr.reviewSkills;
    this.defaultReviewSkill = config.mr.defaultReviewSkill;
  }

  /** Returns true if a review or auto-update for this MR is already queued or running. */
  isBusy(mrId: number): boolean {
    return this.pending.has(mrId);
  }

  /** Enqueues a full review for the given MR id. No-op if one is already in flight. */
  submit(mrId: number): boolean {
    if (this.isBusy(mrId)) {
      return false;
    }
    this.pending.add(mrId);
    this.queue.push({ mrId });
    this._pump();
    return true;
  }

  /**
   * Fetches GitLab MR detail (title/author/description/branch) and, if a
   * Jira issue key can be found in that text, its Jira detail (title,
   * Sprint, "Responsible" custom field) — entirely via direct REST calls,
   * never via Claude — and applies whatever was found onto the MR row via
   * the same conservative applyMetadata() used by "Auto update details".
   * Called once for a brand-new MR (see POST /api/mrs), before deciding
   * whether to also kick off a Claude review, and directly by
   * POST /api/mrs/:id/auto-update. Never throws: a failed GitLab or Jira
   * fetch is logged and simply leaves those fields unset.
   */
  async fetchAndApplyIntakeMetadata(mrId: number): Promise<MrRow | null> {
    const mr = this.mrRepository.getById(mrId);
    if (!mr) return null;

    let gitlabMeta: Awaited<ReturnType<GitlabClient['fetchMr']>> | null = null;
    try {
      gitlabMeta = await this.gitlabClient.fetchMr({
        gitlabUrl: mr.gitlabUrl,
        gitlabProject: mr.gitlabProject,
        gitlabMrIid: mr.gitlabMrIid,
      });
    } catch (err: any) {
      logger.warn('MR intake: GitLab fetch failed', { mrId, error: err.message });
    }

    let jira: Awaited<ReturnType<JiraClient['fetchIssue']>> | null = null;
    if (gitlabMeta && this.jiraClient) {
      const jiraId = extractJiraId(gitlabMeta.title, gitlabMeta.description, gitlabMeta.sourceBranch);
      if (jiraId) {
        try {
          jira = await this.jiraClient.fetchIssue(jiraId);
        } catch (err: any) {
          logger.warn('MR intake: Jira fetch failed', { mrId, jiraId, error: err.message });
        }
      }
    }

    return this.mrRepository.applyMetadata(mrId, {
      title: gitlabMeta?.title || null,
      author: gitlabMeta?.author || null,
      jira,
    });
  }

  /**
   * ClaudeClient handlers that forward every streamed event (text_delta,
   * tool_use, init, permission_denied, ...) as an `mr.console` event, tagged
   * with this MR's id, for the "live Claude console" panel in the web UI.
   * Purely a live pass-through — nothing here is persisted.
   */
  private _streamToConsole(mrId: number) {
    return { onEvent: (evt: any) => this.emit('mr.console', { id: mrId, event: evt }) };
  }

  private _pump(): void {
    while (this.active.size < this.maxConcurrent && this.queue.length > 0) {
      const job = this.queue.shift()!;
      this.active.add(job.mrId);
      this._runReview(job.mrId)
        .catch((err: any) => {
          logger.error('Unhandled error running MR review job', { mrId: job.mrId, error: err.stack || err.message });
        })
        .finally(() => {
          this.active.delete(job.mrId);
          this.pending.delete(job.mrId);
          this._pump();
        });
    }
  }

  private async _runReview(mrId: number): Promise<void> {
    const mr = this.mrRepository.getById(mrId);
    if (!mr) {
      logger.warn('MR disappeared before review could start', { mrId });
      return;
    }

    const reviewId = this.mrRepository.createReviewRunning(mrId);
    this.mrRepository.setStatus(mrId, 'REVIEWING');
    this.emit('mr.review.started', { id: mrId, reviewId });
    this.emit('mr.updated', { mr: this.mrRepository.getById(mrId) });

    try {
      const cwd = this.workspaceResolver.resolve(mr.gitlabProject);
      if (!cwd) {
        throw new Error(
          'No workspace is configured for this GitLab project. Set MR_REVIEW_WORKSPACE or add a matching WORKSPACE_<NAME>.'
        );
      }

      const workspaceName = this.workspaceResolver.resolveName?.(mr.gitlabProject) ?? null;
      const reviewSkill = (workspaceName && this.reviewSkills.get(workspaceName)) || this.defaultReviewSkill;

      const mrMeta = await this.gitlabClient.fetchMr({
        gitlabUrl: mr.gitlabUrl,
        gitlabProject: mr.gitlabProject,
        gitlabMrIid: mr.gitlabMrIid,
      });

      const prompt = buildReviewPrompt({
        mrUrl: mr.gitlabUrl,
        gitlabProject: mr.gitlabProject,
        reviewSkill,
        mrTitle: mrMeta.title,
        mrAuthor: mrMeta.author,
      });
      const result = await this.claudeClient.run(`mr:${mrId}`, { cwd, prompt }, this._streamToConsole(mrId));

      if (result.isError) {
        throw new Error(result.text || 'Claude returned an error');
      }

      const parsed = parseReviewResult(result.text);
      if (!parsed.ok) {
        throw new Error(`Claude did not return a valid structured review: ${parsed.error}`);
      }
      (parsed.value as any).mergeRequestTitle = mrMeta.title;
      (parsed.value as any).mergeRequestAuthor = mrMeta.author;

      this.mrRepository.completeReview(reviewId, parsed.value as any, result.text);
      const updatedMr = this.mrRepository.applyReviewToMr(mrId, reviewId, parsed.value as any);

      this.emit('mr.review.completed', { id: mrId, reviewId, review: this.mrRepository.getReview(reviewId) });
      this.emit('mr.updated', { mr: updatedMr });
    } catch (err: any) {
      logger.error('MR review failed', { mrId, error: err.message });
      this.mrRepository.failReview(reviewId, err.message);
      const updatedMr = this.mrRepository.setStatus(mrId, 'ERROR', err.message);
      this.emit('mr.review.failed', { id: mrId, reviewId, error: err.message });
      this.emit('mr.updated', { mr: updatedMr });
    }
  }
}
