import { Body, Controller, Get, HttpException, HttpStatus, Inject, Param, Post } from '@nestjs/common';
import { JiraIssuesService } from './jira-issues.service';

/**
 * BACKEND_SPEC.md §6/§7/§9/§10 — the ReviewFlyout's Detail/Console/History
 * tabs. Named `api/merge-requests` (spec's path), distinct from the
 * pre-existing `api/mrs` (MR Management feature). `:mrId` is not a DB row
 * id — MR data is never persisted — it's the MR's canonical GitLab URL,
 * base64url-encoded (see jira-mapping.ts's encodeMrId/decodeMrId).
 */
@Controller('api/merge-requests')
export class JiraMrController {
  constructor(@Inject(JiraIssuesService) private readonly service: JiraIssuesService) {}

  @Get(':mrId/reviews')
  reviews(@Param('mrId') mrId: string) {
    return this.service.getMrReviews(mrId);
  }

  /** Body: { workspace: string } — one of GET /api/workspaces' `name` values, chosen via the "choose workspace" modal. */
  @Post(':mrId/review')
  async review(@Param('mrId') mrId: string, @Body() body: { workspace?: string }) {
    if (!body?.workspace) {
      throw new HttpException({ error: 'A workspace is required to start a review' }, HttpStatus.BAD_REQUEST);
    }
    try {
      return await this.service.triggerReview(mrId, body.workspace);
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      throw new HttpException({ error: err.message }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
