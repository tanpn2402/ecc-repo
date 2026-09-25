import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { MrRepository } from './mr.repository';
import { encodeMrId } from '@/jira-issues/jira-mapping';
import type { AppConfig } from '@/config/configuration';
import { APP_CONFIG } from '@/config/config.module';
import GitlabClient, { GitlabMrInfo } from './gitlab-client';
import logger from '@/common/logger';

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

  private reviewToMarkdown(review: string): string {
    const lines = review
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((line) => line.trimEnd());

    const result: string[] = [];

    let section: string | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (!line) {
        result.push('');
        continue;
      }

      // Main title
      if (line.startsWith('Code Review')) {
        result.push(`# ${line}`);
        result.push('');
        continue;
      }

      // Sections
      if (
        line === 'Summary' ||
        line === 'Findings' ||
        line === 'Verdict' ||
        line === 'Reminder'
      ) {
        section = line;

        result.push(`## ${line}`);
        result.push('');

        continue;
      }

      // Finding
      if (
        section === 'Findings' &&
        /^(High|Medium|Low|Critical)\s*[—-]\s*Fix:/i.test(line)
      ) {
        const match = line.match(
          /^(High|Medium|Low|Critical)\s*[—-]\s*Fix:\s*(.*)$/i,
        );

        if (match) {
          result.push(`### ${match[1]} — Fix`);
          result.push('');
          result.push(match[2]);
          result.push('');
        }

        continue;
      }

      // Finding metadata
      if (section === 'Findings' && /^(Problem|Expected|Impact):/i.test(line)) {
        const match = line.match(/^(Problem|Expected|Impact):\s*(.*)$/i);

        if (match) {
          result.push(`**${match[1]}:** ${match[2]}`);
          result.push('');
        }

        continue;
      }

      // Verdict
      if (section === 'Verdict') {
        const match = line.match(
          /^([^·]+?)\s*·\s*(Risk:\s*[^—]+?)\s*—\s*(.*)$/i,
        );

        if (match) {
          result.push(`**${match[1].trim()}** · **${match[2].trim()}**`);
          result.push('');
          result.push(match[3].trim());
          result.push('');
        } else {
          result.push(line);
          result.push('');
        }

        continue;
      }

      result.push(line);
    }

    return result
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  async createReview(gitlabUrl: string, review: string) {
    const match = review.match(/^Verdict\s*\n\s*([^·\n]+?)(?:\s*·|\s*$)/im);

    const parsedVerdict = match?.[1]?.trim() ?? null;
    logger.info('Parsed verdict: ' + parsedVerdict);
    let verdict = 'COMMENT';
    if (parsedVerdict) {
      verdict = ['REQUEST CHANGES'].includes(parsedVerdict.toUpperCase())
        ? 'REQUEST_CHANGES'
        : ['PASS'].includes(parsedVerdict.toUpperCase())
          ? 'APPROVED'
          : 'COMMENT';
    }

    return this.mrRepository.createReviewRun({
      gitlabUrl,
      createdAt: new Date().toISOString().toString(),
      summary: this.reviewToMarkdown(review),
      consoleLog: '',
      execBy: 'Kreis',
      verdict,
      status: 'COMPLETED',
      findingsJson: null,
      errorMessage: '',
      completedAt: new Date().toISOString().toString(),
    });
  }
}
