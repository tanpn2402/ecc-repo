import { DynamicModule, Global, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import type { AppConfig } from './config/configuration';
import { APP_CONFIG, AppConfigModule } from './config/config.module';
import { DatabaseModule } from './db/database.module';
import { WorkspaceModule } from './workspace/workspace.module';
import { ClaudeModule } from './claude/claude.module';
import { TelegramModule } from './telegram/telegram.module';
import { JiraIssuesModule } from './jira-issues/jira-issues.module';
import { GitlabActivitiesModule } from './gitlab-activities/gitlab-activities.module';
import { WsModule } from './ws/ws.module';
import { HealthController } from './common/health.controller';
import { HttpExceptionFilter } from './common/http-exception.filter';
import logger from './common/logger';
import GitlabClient from './mr/gitlab-client';
import JiraClient from './mr/jira-client';

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
      JiraIssuesModule,
      GitlabActivitiesModule,
      GlobalModule,
    ];
    if (config.telegram.enabled) {
      imports.push(TelegramModule);
    } else {
      logger.info('TelegramModule has been disabled');
    }
    if (config.websocket.enabled) {
      imports.push(WsModule);
    } else {
      logger.info('WsModule has been disabled');
    }

    return {
      module: AppModule,
      imports,
      controllers: [HealthController],
      providers: [{ provide: APP_FILTER, useClass: HttpExceptionFilter }],
    };
  }
}

@Global()
@Module({
  imports: [],
  controllers: [],
  providers: [
    {
      provide: GitlabClient,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        new GitlabClient(config.mr.gitlabToken),
    },
    {
      provide: JiraClient,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        config.mr.jiraEmail && config.mr.jiraApiToken
          ? new JiraClient({
              baseUrl: config.mr.jiraBaseUrl,
              email: config.mr.jiraEmail,
              apiToken: config.mr.jiraApiToken,
            })
          : null,
    },
  ],
  exports: [GitlabClient, JiraClient],
})
class GlobalModule {}
