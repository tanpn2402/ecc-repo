import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { JiraIssuesService } from '../jira-issues/jira-issues.service';
import { TeamsService } from './teams.service';
import logger from '../common/logger';
import { JiraReviewRunRow } from '@/jira-issues/jira-issues.repository';

type JiraReviewPayload = {
  mrId: string;
  jiraKey: string;
  reviewId: string;
  review: JiraReviewRunRow;
};

@Injectable()
export class TeamsGateway implements OnModuleInit, OnModuleDestroy {
  private readonly handlers = new Map<
    string,
    (payload: JiraReviewPayload) => void
  >();

  constructor(
    private readonly jiraIssuesService: JiraIssuesService,
    private readonly teamsService: TeamsService,
  ) {}

  onModuleInit(): void {
    this.listen('jira.review.completed', (payload) =>
      this.handleReviewCompleted(payload),
    );

    this.listen('jira.review.failed', (payload) =>
      this.handleReviewFailed(payload),
    );

    logger.debug('Teams review event forwarding wired up');
  }

  private listen(
    event: string,
    handler: (payload: JiraReviewPayload) => void,
  ): void {
    this.handlers.set(event, handler);
    this.jiraIssuesService.on(event, handler);
  }

  private async handleReviewCompleted(
    payload: JiraReviewPayload,
  ): Promise<void> {
    try {
      await this.teamsService.sendReviewNotification(+payload.reviewId);
    } catch (error) {
      logger.error(`Failed to send completed review to Teams`, {
        error: (error as Error).stack || (error as Error).message,
      });
    }
  }

  private async handleReviewFailed(payload: JiraReviewPayload): Promise<void> {
    try {
      await this.teamsService.sendReviewNotification(+payload.reviewId);
    } catch (error) {
      logger.error(`Failed to send failed review to Teams`, {
        error: (error as Error).stack || (error as Error).message,
      });
    }
  }

  onModuleDestroy(): void {
    for (const [event, handler] of this.handlers) {
      this.jiraIssuesService.off(event, handler);
    }

    this.handlers.clear();
  }
}
