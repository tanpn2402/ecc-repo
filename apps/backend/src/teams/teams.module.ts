import { Module } from '@nestjs/common';
import { TeamsService } from './teams.service';
import { TeamsGateway } from './teams.gateway';
import { JiraIssuesModule } from '@/jira-issues/jira-issues.module';
import { JiraIssuesRepository } from '@/jira-issues/jira-issues.repository';
import { TeamsController } from './teams.controller';

@Module({
  controllers: [TeamsController],
  imports: [JiraIssuesModule],
  providers: [TeamsService, TeamsGateway, JiraIssuesRepository],
})
export class TeamsModule {}
