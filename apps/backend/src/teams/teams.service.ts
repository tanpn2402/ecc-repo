import { APP_CONFIG } from '@/config/config.module';
import type { AppConfig } from '@/config/configuration';
import {
  JiraIssuesRepository,
  JiraReviewRunRow,
} from '@/jira-issues/jira-issues.repository';
import { decodeMrId } from '@/jira-issues/jira-mapping';
import GitlabClient, { GitlabMrInfo } from '@/mr/gitlab-client';
import parseGitlabMrUrl, { ParsedGitlabMrUrl } from '@/mr/gitlab-url';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

export interface JiraReviewEvent {
  mrId: string;
  mrUrl?: string | null;
  mrTitle?: string | null;

  jiraId?: string | null;

  reviewId?: string | null;

  status?: string | null;
  verdict?: string | null;
  summary?: string | null;

  errorMessage?: string | null;

  createdAt?: string | Date | null;
  completedAt?: string | Date | null;
}

interface TeamsWebhookPayload {
  type: 'message';
  attachments: Array<{
    contentType: 'application/vnd.microsoft.card.adaptive';
    contentUrl: null;
    content: AdaptiveCard;
  }>;
}

interface AdaptiveCard {
  $schema: string;
  type: 'AdaptiveCard';
  version: '1.5';
  msteams: {
    width: 'full';
  };
  body: Record<string, unknown>[];
  actions?: Record<string, unknown>[];
}

@Injectable()
export class TeamsService {
  private readonly logger = new Logger(TeamsService.name);

  private readonly enabled: boolean;
  private readonly webhookUrl: string | null;

  constructor(
    @Inject(APP_CONFIG) readonly config: AppConfig,
    @Inject(GitlabClient) private readonly gitlabClient: GitlabClient,
    @Inject(JiraIssuesRepository) private readonly repo: JiraIssuesRepository,
  ) {
    this.enabled = config.teams.enabled;
    this.webhookUrl = config.teams.webhookUrl;
  }

  async sendReviewNotification(reviewId: number) {
    const review = this.repo.getReviewById(reviewId);
    if (!review) {
      throw new NotFoundException(`Review ID "${reviewId}" not found`);
    }

    try {
      const parsed = parseGitlabMrUrl(
        review.gitlabUrl,
        this.config.mr.gitlabAllowedHosts,
      );

      const mrInfo = await this.gitlabClient.fetchMr({
        gitlabUrl: parsed.canonicalUrl,
        gitlabProject: parsed.projectPath,
        gitlabMrIid: parsed.iid,
      });

      const data = {
        mrId: '!' + parsed?.iid,
        mrUrl: parsed?.canonicalUrl,
        mrTitle: this.optionalString(mrInfo?.title),
        // jiraId: '',
        reviewId: this.optionalString(review.id),
        status: this.optionalString(review.status),
        verdict: this.optionalString(review.verdict),
        summary: this.optionalString(review.summary),
        errorMessage: this.optionalString(review.errorMessage),
        createdAt: this.optionalDate(review.createdAt),
        completedAt: this.optionalDate(review.completedAt),
      };

      await this.send(this.buildReviewCompletedCard(data));
    } catch {
      this.logger.error('Failed to parse mrId: ' + review.gitlabUrl);
      throw new BadRequestException(
        'Failed to parse mrId: ' + review.gitlabUrl,
      );
    }

    return {
      ok: 1,
    };
  }

  /**
   * Send an Adaptive Card to the configured Teams channel.
   */
  private async send(payload: TeamsWebhookPayload): Promise<void> {
    if (!this.enabled) {
      this.logger.debug('Teams notifications are disabled');
      return;
    }

    if (!this.webhookUrl) {
      this.logger.warn(
        'Teams notifications are enabled but TEAMS_WEBHOOK_URL is not configured',
      );
      return;
    }

    try {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const responseBody = await response.text();

        throw new Error(
          `Teams webhook returned HTTP ${response.status}: ${responseBody}`,
        );
      }

      this.logger.debug('Teams notification sent successfully');
    } catch (error) {
      this.logger.error(
        'Failed to send Teams notification',
        error instanceof Error ? error.stack : String(error),
      );

      throw error;
    }
  }

  /**
   * Adaptive Card for a successfully completed review.
   */
  private buildReviewCompletedCard(
    review: JiraReviewEvent,
  ): TeamsWebhookPayload {
    const jiraId = review.jiraId || 'Unknown Jira issue';

    const title = review.mrTitle || `Merge Request !${review.mrId}`;

    const verdict = this.formatVerdict(review.verdict);

    const summary = review.summary || 'No review summary was provided.';

    const facts: Record<string, unknown>[] = [
      {
        title: 'Verdict',
        value: verdict,
      },
      {
        title: 'Status',
        value: this.formatStatus(review.status),
      },
    ];

    if (review.jiraId) {
      facts.push({
        title: 'Jira',
        value: jiraId,
      });
    }

    if (review.reviewId) {
      facts.push({
        title: 'Review',
        value: review.reviewId,
      });
    }

    return {
      type: 'message',
      attachments: [
        {
          contentType: 'application/vnd.microsoft.card.adaptive',

          contentUrl: null,

          content: {
            $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',

            type: 'AdaptiveCard',

            version: '1.5',

            msteams: {
              width: 'full',
            },

            body: [
              {
                type: 'TextBlock',
                text: `Code Review — ${title}`,
                weight: 'Bolder',
                size: 'Medium',
                wrap: true,
              },

              {
                type: 'FactSet',
                facts,
              },

              {
                type: 'TextBlock',
                text: 'Summary',
                weight: 'Bolder',
                spacing: 'Medium',
              },

              {
                type: 'TextBlock',
                text: summary,
                wrap: true,
              },

              ...(review.completedAt
                ? [
                    {
                      type: 'TextBlock',
                      text: `Completed: ${this.formatDate(review.completedAt)}`,
                      isSubtle: true,
                      spacing: 'Medium',
                      wrap: true,
                    },
                  ]
                : []),
            ],

            actions: review.mrUrl
              ? [
                  {
                    type: 'Action.OpenUrl',
                    title: 'Open Merge Request',
                    url: review.mrUrl,
                  },
                ]
              : undefined,
          },
        },
      ],
    };
  }

  private optionalString(value: unknown): string | null {
    if (value === null || value === undefined) {
      return null;
    }

    const stringValue = String(value).trim();

    return stringValue.length > 0 ? stringValue : null;
  }

  private optionalDate(value: unknown): string | Date | null {
    if (value === null || value === undefined) {
      return null;
    }

    if (value instanceof Date) {
      return value;
    }

    return String(value);
  }

  private formatVerdict(verdict?: string | null): string {
    switch (verdict?.toUpperCase()) {
      case 'READY_TO_MERGE':
        return '✅ READY TO MERGE';

      case 'APPROVED':
        return '✅ APPROVED';

      case 'PASS':
        return '✅ PASS';

      case 'PASSED':
        return '✅ PASSED';

      case 'CHANGES_REQUESTED':
        return '⚠️ CHANGES REQUESTED';

      case 'COMMENT':
        return '⚠️ COMMENT';

      case 'BLOCKED':
        return '🚫 BLOCKED';

      case 'FAIL':
        return '🚫 FAIL';

      case 'FAILED':
        return '🚫 FAILED';

      default:
        return verdict || 'UNKNOWN';
    }
  }

  private formatStatus(status?: string | null): string {
    if (!status) {
      return 'UNKNOWN';
    }

    return status.replace(/_/g, ' ').toUpperCase();
  }

  private formatDate(value: string | Date): string {
    const date = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return date.toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  }
}
