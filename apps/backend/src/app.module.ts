import { DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import type { AppConfig } from './config/configuration';
import { AppConfigModule } from './config/config.module';
import { DatabaseModule } from './db/database.module';
import { WorkspaceModule } from './workspace/workspace.module';
import { ClaudeModule } from './claude/claude.module';
import { TelegramModule } from './telegram/telegram.module';
import { MrModule } from './mr/mr.module';
import { JiraIssuesModule } from './jira-issues/jira-issues.module';
import { GitlabActivitiesModule } from './gitlab-activities/gitlab-activities.module';
import { WsModule } from './ws/ws.module';
import { HealthController } from './common/health.controller';
import { HttpExceptionFilter } from './common/http-exception.filter';

/**
 * Root module. Built via forRoot(config) rather than a static @Module
 * decorator because WsModule must only be imported when
 * config.websocket.enabled is true (see ws/ws.module.ts) — matching
 * index.js's `if (config.websocket.enabled) { wss = new MrWebSocketServer(...) }`
 * gate, where a disabled websocket meant no listener at all, not an
 * always-created-but-ignored one.
 */
@Module({})
export class AppModule {
  static forRoot(config: AppConfig): DynamicModule {
    const imports = [
      AppConfigModule.forRoot(config),
      DatabaseModule,
      WorkspaceModule,
      ClaudeModule,
      TelegramModule,
      MrModule,
      JiraIssuesModule,
      GitlabActivitiesModule,
    ];
    if (config.websocket.enabled) {
      imports.push(WsModule);
    }

    return {
      module: AppModule,
      imports,
      controllers: [HealthController],
      providers: [{ provide: APP_FILTER, useClass: HttpExceptionFilter }],
    };
  }
}
