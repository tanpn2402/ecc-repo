import { Controller, Get, HttpException, HttpStatus, Inject, Query } from '@nestjs/common';
import { GitlabActivitiesService } from './gitlab-activities.service';

function parseCsvNumbers(raw: string): number[] {
  return String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isInteger(n));
}

function parseCsvStrings(raw: string): string[] {
  return String(raw || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GitLab Activities page (see README). Everything here is a live pass-through
 * to GitLab's Events API for the configured users — no DB persistence — so
 * `list()` always hits the network on every call.
 */
@Controller('api/gitlab-activities')
export class GitlabActivitiesController {
  constructor(@Inject(GitlabActivitiesService) private readonly service: GitlabActivitiesService) {}

  @Get('meta')
  meta() {
    return this.service.getMeta();
  }

  @Get()
  async list(
    @Query('userIds') userIds = '',
    @Query('types') types = '',
    @Query('from') from = '',
    @Query('to') to = ''
  ) {
    if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
      throw new HttpException({ error: '"from" and "to" query params (YYYY-MM-DD) are required' }, HttpStatus.BAD_REQUEST);
    }

    return this.service.listActivities({
      userIds: parseCsvNumbers(userIds),
      types: parseCsvStrings(types),
      from,
      to,
    });
  }
}
