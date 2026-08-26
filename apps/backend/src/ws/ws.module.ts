import { Module } from '@nestjs/common';
import { JiraIssuesModule } from '../jira-issues/jira-issues.module';
import { MrGateway } from './mr.gateway';

/**
 * Only imported by AppModule when config.websocket.enabled is true (see
 * app.module.ts) — matches the pre-migration `if (config.websocket.enabled)`
 * gate in index.js, which left `wss = null` (no listener at all on /ws)
 * rather than accepting-then-ignoring connections.
 */
@Module({
  imports: [JiraIssuesModule],
  providers: [MrGateway],
})
export class WsModule {}
