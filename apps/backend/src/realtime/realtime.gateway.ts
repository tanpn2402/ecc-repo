import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import {
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server } from 'socket.io';
import { JiraIssuesService } from '../jira-issues/jira-issues.service';
import { MRService } from '@/mr/mr.service';
import logger from '../common/logger';

/**
 * App-wide realtime events on the default Socket.IO namespace.
 *
 * Server -> client: each forwarded service event is emitted under its own
 * name (`jira.review.started`, `mr.data.updated`, ...) with the payload as the
 * only argument.
 *
 * Client -> server: `jira.review.subscribe` ({ mrId }) returns, through the
 * ack, the in-memory console transcript of a review that is still running
 * (or null), so a Console tab opened mid-review can seed its live view from
 * the same buffer the `jira.review.console` events keep appending to.
 */
@Injectable()
@WebSocketGateway()
export class RealtimeGateway implements OnModuleInit {
  @WebSocketServer() server!: Server;

  constructor(
    @Inject(JiraIssuesService) private readonly jiraIssuesService: JiraIssuesService,
    @Inject(MRService) private readonly mrService: MRService,
  ) {}

  @SubscribeMessage('jira.review.subscribe')
  subscribeReview(@MessageBody() body: { mrId?: unknown }) {
    if (typeof body?.mrId !== 'string') return { mrId: null, consoleLog: null };
    return {
      mrId: body.mrId,
      consoleLog: this.jiraIssuesService.getLiveConsoleLog(body.mrId),
    };
  }

  onModuleInit(): void {
    const forward = (type: string) => (payload: unknown) => this.broadcast(type, payload);

    this.jiraIssuesService.on('jira.review.started', forward('jira.review.started'));
    this.jiraIssuesService.on('jira.review.console', forward('jira.review.console'));
    this.jiraIssuesService.on('jira.review.completed', forward('jira.review.completed'));
    this.jiraIssuesService.on('jira.review.failed', forward('jira.review.failed'));
    this.jiraIssuesService.on('jira.data.updated', forward('jira.data.updated'));
    this.mrService.on('mr.data.updated', forward('mr.data.updated'));

    logger.debug('Realtime event forwarding wired up');
  }

  broadcast(type: string, payload: unknown): void {
    this.server?.emit(type, payload);
  }
}
