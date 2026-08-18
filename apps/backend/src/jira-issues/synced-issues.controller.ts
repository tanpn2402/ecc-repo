import {
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  Query,
} from "@nestjs/common";
import { JiraIssuesService } from "./jira-issues.service";

/** BACKEND_SPEC.md §5 — the "Synced Issues" table (in-house DB, no Jira/GitLab calls). */
@Controller("api/synced-issues")
export class SyncedIssuesController {
  constructor(
    @Inject(JiraIssuesService) private readonly service: JiraIssuesService,
  ) {}

  @Get()
  list(@Query("group") group?: string) {
    return this.service.listSyncedIssues({ group });
  }

  /** "Done" button — stops tracking this issue in Synced Issues (see service docblock). */
  @Delete(":key")
  remove(@Param("key") key: string) {
    try {
      this.service.removeSyncedIssue(key);
      return { ok: true, key };
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      throw new HttpException({ error: err.message }, HttpStatus.BAD_GATEWAY);
    }
  }
}
