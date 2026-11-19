import { Module } from '@nestjs/common';
import { JiraIssuesModule } from '../jira-issues/jira-issues.module';
import { MrModule } from '@/mr/mr.module';
import { RealtimeGateway } from './realtime.gateway';

/**
 * Only imported by AppModule when config.websocket.enabled is true (see
 * app.module.ts): a disabled websocket means no app-wide event listener.
 */
@Module({
  imports: [JiraIssuesModule, MrModule],
  providers: [RealtimeGateway],
})
export class RealtimeModule {}
