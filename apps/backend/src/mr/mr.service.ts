import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { MrRepository } from './mr.repository';
import { encodeMrId } from '@/jira-issues/jira-mapping';
import type { AppConfig } from '@/config/configuration';
import { APP_CONFIG } from '@/config/config.module';
import GitlabClient, { GitlabMrInfo } from './gitlab-client';

@Injectable()
export class MRService extends EventEmitter {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(MrRepository) private readonly mrRepository: MrRepository,
    @Inject(GitlabClient) private readonly gitlabClient: GitlabClient,
  ) {
    super();
  }

  public async listMrs() {
    const result = await this.mrRepository.listMrs();

    if (result.length) {
      const gitlabProjectAndUrlSet = result.reduce(
        (result, mr) => {
          result.set(mr.gitlabProject, {
            gitlabUrl: mr.gitlabUrl,
            gitlabMrIids: (
              result.get(mr.gitlabProject)?.gitlabMrIids || []
            ).concat(mr.gitlabMrIid),
          });
          return result;
        },
        new Map<
          string,
          {
            gitlabUrl: string;
            gitlabMrIids: Array<number>;
          }
        >(),
      );

      const gitlabMrs = (
        await Promise.all(
          Array.from(gitlabProjectAndUrlSet.entries()).map(
            async ([gitlabProject, { gitlabUrl, gitlabMrIids }]) => {
              return this.gitlabClient.fetchMrs({
                gitlabUrl,
                gitlabProject,
                gitlabMrIids,
              });
            },
          ),
        )
      ).flat();

      const gitlabMrMap = gitlabMrs.reduce((result, mr) => {
        result.set(String(mr.iid), mr);
        return result;
      }, new Map<string, GitlabMrInfo>());

      const data = result.map((mr) => {
        const gitlabMr = gitlabMrMap.get(String(mr.gitlabMrIid));

        if (gitlabMr) {
          this.mrRepository.upsertMr({
            gitlabUrl: mr.gitlabUrl,
            gitlabProject: mr.gitlabProject,
            gitlabMrIid: mr.gitlabMrIid,
            status: gitlabMr.state,
            author: gitlabMr.author,
            jiraKey: mr.jiraKey,
            title: gitlabMr.title,
          });

          return {
            ...mr,
            mrId: encodeMrId(mr.gitlabUrl),
            status: gitlabMr.state,
            author: gitlabMr.authorName || 'Unknown',
            assignees: gitlabMr.assignees || [],
            reviewers: gitlabMr.reviewers || [],
            assignedToManager:
              (gitlabMr.assignees || []).some((assignee) =>
                this.config.gitlabActivities.assignedToManagerIds.includes(
                  assignee.id,
                ),
              ) &&
              (gitlabMr.reviewers || []).some((reviewer) =>
                this.config.gitlabActivities.assignedToManagerIds.includes(
                  reviewer.id,
                ),
              ),
          };
        }

        return {
          ...mr,
          mrId: encodeMrId(mr.gitlabUrl),
        };
      });

      this.emit('mr.data.updated', gitlabMrs);

      return data;
    }

    return result;
  }
}
