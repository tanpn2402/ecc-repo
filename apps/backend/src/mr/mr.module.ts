import { Module } from '@nestjs/common';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/configuration';
import { WorkspaceModule } from '../workspace/workspace.module';
import { WorkspaceService } from '../workspace/workspace.service';
import { ClaudeModule } from '../claude/claude.module';
import { MrRepository } from './mr.repository';
import { MrService } from './mr.service';
import { MrController } from './mr.controller';
import { MrWorkspaceResolver } from './workspace-resolver';
import { GitlabClient } from './gitlab-client';
import { JiraClient } from './jira-client';

@Module({
  imports: [WorkspaceModule, ClaudeModule],
  controllers: [MrController],
  providers: [
    MrRepository,
    MrService,
    {
      provide: MrWorkspaceResolver,
      inject: [WorkspaceService, APP_CONFIG],
      useFactory: (workspaceService: WorkspaceService, config: AppConfig) =>
        new MrWorkspaceResolver(
          {
            list: () => workspaceService.list(),
            getPath: (name: string) => workspaceService.getPath(name) as string,
          },
          config.mr.defaultReviewWorkspace
        ),
    },
    {
      provide: GitlabClient,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => new GitlabClient(config.mr.gitlabToken),
    },
    {
      provide: JiraClient,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) =>
        config.mr.jiraEmail && config.mr.jiraApiToken
          ? new JiraClient({ baseUrl: config.mr.jiraBaseUrl, email: config.mr.jiraEmail, apiToken: config.mr.jiraApiToken })
          : null,
    },
  ],
  exports: [MrRepository, MrService, GitlabClient, JiraClient],
})
export class MrModule {}
