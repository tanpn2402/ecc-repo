import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/configuration';
import { GitlabClient } from '../mr/gitlab-client';
import logger from '../common/logger';
import { toActivityDto, type GitlabActivityDto } from './gitlab-activities-mapper';

export interface ListActivitiesParams {
  userIds: number[];
  types: string[];
  from: string;
  to: string;
}

export interface GitlabActivitiesMeta {
  users: { id: number; name: string }[];
  activityTypes: { key: string; label: string }[];
}

@Injectable()
export class GitlabActivitiesService {
  constructor(
    @Inject(GitlabClient) private readonly gitlabClient: GitlabClient,
    @Inject(APP_CONFIG) private readonly config: AppConfig
  ) {}

  getMeta(): GitlabActivitiesMeta {
    return {
      users: this.config.gitlabActivities.users,
      activityTypes: this.config.gitlabActivities.activityTypes,
    };
  }

  /**
   * Fetches every configured user's events for the given date range directly
   * from GitLab (no DB caching — see gitlab-activities.module.ts docblock),
   * normalizes them into a flat, sortable shape, and filters by the
   * requested types. One user's fetch failing (bad id, GitLab hiccup)
   * doesn't drop the others' events — it's logged and skipped.
   */
  async listActivities({ userIds, types, from, to }: ListActivitiesParams): Promise<GitlabActivityDto[]> {
    const configuredUsers = this.config.gitlabActivities.users;
    const targetUsers = userIds.length ? configuredUsers.filter((u) => userIds.includes(u.id)) : configuredUsers;

    const allowedTypeKeys = new Set(this.config.gitlabActivities.activityTypes.map((t) => t.key));
    const requestedTypes = new Set(types.length ? types.filter((t) => allowedTypeKeys.has(t)) : allowedTypeKeys);
    const typeLabels = new Map(this.config.gitlabActivities.activityTypes.map((t) => [t.key, t.label]));

    const perUser = await Promise.allSettled(
      targetUsers.map((user) =>
        this.gitlabClient
          .fetchUserEvents({ baseUrl: this.config.gitlabActivities.baseUrl, userId: user.id, after: from, before: to })
          .then((events) => events.map((event) => toActivityDto(event, user.id, user.name, typeLabels)))
      )
    );

    const activities: GitlabActivityDto[] = [];
    perUser.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        activities.push(...result.value);
      } else {
        logger.warn('Failed to fetch GitLab activities for user', {
          user: targetUsers[index],
          error: result.reason instanceof Error ? result.reason.message : result.reason,
        });
      }
    });

    return activities
      .filter((activity) => requestedTypes.has(activity.type))
      .sort((a, b) => (a.datetime < b.datetime ? 1 : a.datetime > b.datetime ? -1 : 0));
  }
}
