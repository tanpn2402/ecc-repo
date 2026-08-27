import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer, OnGatewayConnection } from '@nestjs/websockets';
import type { Server as WsServerType, WebSocket as WsClientType } from 'ws';
import { JiraIssuesService } from '../jira-issues/jira-issues.service';
import logger from '../common/logger';

/**
 * Port of ws/ws-server.js's MrWebSocketServer as a NestJS WebSocketGateway.
 *
 * Uses @nestjs/platform-ws (the WsAdapter is set in main.ts), which keeps
 * the wire protocol as plain `ws` — NOT Socket.IO — mounted on the same
 * HTTP server/port at `/ws`, exactly matching the pre-migration server and
 * apps/webapps's `useWebSocket.ts` client (`new WebSocket(".../ws")`).
 *
 * Only forwards the event types MrService can actually emit today.
 * `mr.metadata.started/completed/failed` (mentioned in the pre-migration
 * class docblock and README §16.7) are NOT forwarded here because the only
 * code path that ever emitted them (`ReviewJobManager._runMetadataUpdate`,
 * the Claude-driven "auto update" path) was confirmed dead/unreachable
 * before this migration — see MrService's docblock. The frontend never
 * received these events in the live system either, so this is not an
 * observable behavior change.
 */
@Injectable()
@WebSocketGateway({ path: '/ws' })
export class MrGateway implements OnModuleInit, OnModuleDestroy, OnGatewayConnection {
  @WebSocketServer() server!: WsServerType;

  constructor(
    @Inject(JiraIssuesService) private readonly jiraIssuesService: JiraIssuesService
  ) {}

  /**
   * Handles the one client -> server message this app supports:
   * `{type: 'jira.review.subscribe', mrId}`, sent by the Jira Issues page's
   * Console tab when it opens for an MR that's mid-review but this browser
   * session never saw its `jira.review.started` broadcast (e.g. the review
   * was already running when the page loaded). Rather than falling back to
   * a REST read of jira_review_runs — which can be one write behind the
   * live buffer this same message loop is about to keep streaming from —
   * this replies directly to the requesting client with the current
   * in-memory transcript (jiraIssuesService.getLiveConsoleLog), so the
   * client can seed its live view from the exact same source of truth the
   * subsequent `jira.review.console` broadcasts come from. No reply is sent
   * if the review isn't actually active (e.g. it just completed).
   */
  handleConnection(client: WsClientType): void {
    client.on('message', (raw: unknown) => {
      let parsed: any;
      try {
        parsed = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (parsed?.type !== 'jira.review.subscribe' || typeof parsed.mrId !== 'string') return;

      const consoleLog = this.jiraIssuesService.getLiveConsoleLog(parsed.mrId);
      if (consoleLog === null) return;
      if (client.readyState === client.OPEN) {
        client.send(JSON.stringify({ type: 'jira.review.snapshot', payload: { mrId: parsed.mrId, consoleLog } }));
      }
    });
  }

  onModuleInit(): void {
    const forward = (type: string) => (payload: unknown) => this.broadcast(type, payload);

    // "Jira Issues" page's real review job (stage 5, see jira-issues.service.ts).
    this.jiraIssuesService.on('jira.review.started', forward('jira.review.started'));
    this.jiraIssuesService.on('jira.review.console', forward('jira.review.console'));
    this.jiraIssuesService.on('jira.review.completed', forward('jira.review.completed'));
    this.jiraIssuesService.on('jira.review.failed', forward('jira.review.failed'));
    this.jiraIssuesService.on('jira.data.updated', forward('jira.data.updated'));
    logger.debug('WebSocket MR event forwarding wired up');
  }

  broadcast(type: string, payload: unknown): void {
    const message = JSON.stringify({ type, payload });
    for (const client of this.server.clients) {
      if (client.readyState === client.OPEN) {
        client.send(message);
      }
    }
  }

  onModuleDestroy(): void {
    for (const client of this.server.clients) client.terminate();
    this.server.close();
  }
}
