import { Module } from '@nestjs/common';
import { GitlabActivitiesController } from './gitlab-activities.controller';
import { GitlabActivitiesService } from './gitlab-activities.service';

/**
 * GitLab Activities page: live per-request read of each configured user's
 * GitLab Events API feed (GET /api/v4/users/:id/events), never persisted —
 * unlike the MR/Jira Issues features, there's no repository/DB table here.
 * Imports MrModule purely to reuse its already-exported GitlabClient
 * (same PRIVATE-TOKEN auth, same REST client) rather than instantiate a
 * second one.
 */
@Module({
  imports: [],
  controllers: [GitlabActivitiesController],
  providers: [GitlabActivitiesService],
})
export class GitlabActivitiesModule {}
