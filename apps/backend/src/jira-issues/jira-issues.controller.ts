import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { JiraIssuesService } from './jira-issues.service';

/** BACKEND_SPEC.md §3/§4 — the "Jira Issues from Atlassian" live table. */
@Controller('api/jira/issues')
export class JiraIssuesController {
  constructor(
    @Inject(JiraIssuesService) private readonly service: JiraIssuesService,
  ) {}

  @Get()
  async list() {
    try {
      return await this.service.listAtlassianIssues();
    } catch (err: any) {
      throw new HttpException({ error: err.message }, HttpStatus.BAD_GATEWAY);
    }
  }

  /**
   * "Add Issue" modal — manual entry by key ("CORE-123"/"REQ-456") or full
   * issue URL, for issues outside JIRA_PROJECT's live-view JQL filter.
   * Declared before `:key/mrs`/`:key/sync` only for readability; there's no
   * routing ambiguity since "add" is a literal one-segment path and those
   * two require a second literal segment.
   */
  @Post('add')
  async add(@Body() body: { input?: string; group?: string }) {
    try {
      return await this.service.addIssue({
        input: body?.input ?? '',
        group: body?.group ?? '',
      });
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      throw new HttpException({ error: err.message }, HttpStatus.BAD_GATEWAY);
    }
  }

  @Get(':key/mrs')
  async liveMrs(@Param('key') key: string) {
    try {
      return this.service.getLiveMrs(key);
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      throw new HttpException({ error: err.message }, HttpStatus.BAD_GATEWAY);
    }
  }

  @Post(':key/sync')
  async sync(@Param('key') key: string, @Body() body: { group?: string }) {
    try {
      return await this.service.syncIssue(key, body);
    } catch (err: any) {
      if (err instanceof HttpException) throw err; // e.g. NotFoundException from the service
      throw new HttpException({ error: err.message }, HttpStatus.BAD_GATEWAY);
    }
  }

  @Put(':key')
  async update(@Param('key') key: string, @Body() body: { group?: string }) {
    try {
      return await this.service.updateIssue(key, body);
    } catch (err: any) {
      if (err instanceof HttpException) throw err; // e.g. NotFoundException from the service
      throw new HttpException({ error: err.message }, HttpStatus.BAD_GATEWAY);
    }
  }
}
