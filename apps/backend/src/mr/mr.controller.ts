import { Body, Controller, Get, HttpCode, HttpException, HttpStatus, Inject, Param, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { parseGitlabMrUrl, MrUrlError } from './gitlab-url';
import { serializeMr, serializeReview, serializeReviewList } from './serializers';
import { MrRepository, MR_STATUSES } from './mr.repository';
import { MrService } from './mr.service';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/configuration';

/**
 * Port of http/app.js's MR routes as NestJS controller methods — same
 * paths, same methods, same status codes, same `{error}` response shape on
 * failure (via HttpException, normalized by HttpExceptionFilter). No global
 * `/api` prefix is applied anywhere in this app; this controller's own path
 * includes `api/mrs` directly, exactly like the pre-migration Express
 * routes did.
 */
@Controller('api/mrs')
export class MrController {
  constructor(
    @Inject(MrRepository) private readonly mrRepository: MrRepository,
    @Inject(MrService) private readonly mrService: MrService,
    @Inject(APP_CONFIG) private readonly config: AppConfig
  ) {}

  @Get()
  list(@Query('search') search = '', @Query('status') status = '', @Query('sort') sort = 'updated_at', @Query('order') order = 'desc') {
    if (status && !MR_STATUSES.includes(status as any)) {
      throw new HttpException({ error: `Invalid status filter. Must be one of: ${MR_STATUSES.join(', ')}` }, HttpStatus.BAD_REQUEST);
    }
    const rows = this.mrRepository.list({ search: String(search), status: String(status), sort: sort as any, order: order as any });
    return rows.map(serializeMr);
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    const mr = this.mrRepository.getById(Number(id));
    if (!mr) throw new HttpException({ error: 'Merge request not found' }, HttpStatus.NOT_FOUND);
    const currentReview = mr.currentReviewId ? this.mrRepository.getReview(mr.currentReviewId) : null;
    return { ...serializeMr(mr), currentReview: currentReview ? serializeReview(currentReview) : null };
  }

  @Get(':id/reviews')
  reviews(@Param('id') id: string) {
    const mr = this.mrRepository.getById(Number(id));
    if (!mr) throw new HttpException({ error: 'Merge request not found' }, HttpStatus.NOT_FOUND);
    return serializeReviewList(this.mrRepository.listReviews(mr.id));
  }

  /**
   * Manual override for title/author/responsible — e.g. correcting a value
   * Claude got wrong, or filling one in before a review has completed. Only
   * keys actually present in the body are touched; an explicit "" clears
   * that field to null. Never touches status, jira linkage, or review data.
   */
  @Patch(':id')
  patch(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    const mr = this.mrRepository.getById(Number(id));
    if (!mr) throw new HttpException({ error: 'Merge request not found' }, HttpStatus.NOT_FOUND);

    const fields: Record<string, unknown> = {};
    for (const key of MrRepository.EDITABLE_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(body || {}, key)) continue;
      const value = (body as any)[key];
      if (value !== null && typeof value !== 'string') {
        throw new HttpException({ error: `"${key}" must be a string or null` }, HttpStatus.BAD_REQUEST);
      }
      if (typeof value === 'string' && value.length > 500) {
        throw new HttpException({ error: `"${key}" is too long (max 500 characters)` }, HttpStatus.BAD_REQUEST);
      }
      fields[key] = value;
    }
    if (Object.keys(fields).length === 0) {
      throw new HttpException(
        { error: `No editable fields provided. Allowed: ${MrRepository.EDITABLE_FIELDS.join(', ')}` },
        HttpStatus.BAD_REQUEST
      );
    }

    const updated = this.mrRepository.updateDetails(mr.id, fields)!;
    this.mrService.emit('mr.updated', { mr: serializeMr(updated) });
    return serializeMr(updated);
  }

  /**
   * Submits a new MR: creates the row, then synchronously fetches GitLab
   * (title/author) + Jira (Sprint/"Responsible") intake metadata directly
   * via REST — see MrService.fetchAndApplyIntakeMetadata — so the response
   * already carries it. Whether a Claude review also starts right away is
   * controlled by MR_AUTO_REVIEW (config.mr.autoReviewOnCreate); if
   * disabled, the MR is left PENDING for a manual POST /:id/review.
   */
  @Post()
  async create(@Body() body: { url?: string }, @Res({ passthrough: true }) res: Response) {
    let parsed;
    try {
      parsed = parseGitlabMrUrl(body?.url as string, this.config.mr.gitlabAllowedHosts);
    } catch (err) {
      if (err instanceof MrUrlError) {
        throw new HttpException({ error: err.message, code: err.code }, HttpStatus.BAD_REQUEST);
      }
      throw err;
    }

    const { mr, existed } = this.mrRepository.createOrGetMr({
      gitlabUrl: parsed.canonicalUrl,
      gitlabProject: parsed.projectPath,
      gitlabMrIid: parsed.iid,
    });

    if (existed) {
      res.status(HttpStatus.OK);
      return { ...serializeMr(mr), existed: true, message: 'This merge request already exists.' };
    }

    // Never throws internally (see MrService docblock) except for genuinely
    // unexpected errors, which propagate to HttpExceptionFilter as a 500 —
    // matching app.js's `catch (err) { return next(err); }`.
    const enriched = (await this.mrService.fetchAndApplyIntakeMetadata(mr.id)) || mr;

    this.mrService.emit('mr.created', { mr: serializeMr(enriched) });
    if (this.config.mr.autoReviewOnCreate) {
      this.mrService.submit(enriched.id);
    }
    res.status(HttpStatus.CREATED);
    return { ...serializeMr(enriched), existed: false };
  }

  @Post(':id/review')
  @HttpCode(HttpStatus.ACCEPTED)
  review(@Param('id') id: string) {
    const mr = this.mrRepository.getById(Number(id));
    if (!mr) throw new HttpException({ error: 'Merge request not found' }, HttpStatus.NOT_FOUND);
    const started = this.mrService.submit(mr.id);
    if (!started) {
      throw new HttpException({ error: 'A review for this merge request is already in progress' }, HttpStatus.CONFLICT);
    }
    return serializeMr(this.mrRepository.getById(mr.id));
  }

  /**
   * "Auto update details": a quick, no-review metadata refresh — GitLab
   * title/author, and Jira's "Responsible" custom field when a linked issue
   * can be identified — via direct REST calls (same intake path as MR
   * creation). See MrService docblock for why this does NOT go through
   * Claude despite README §16.6/the pre-migration class docblock describing
   * it that way: that was already dead code before this migration.
   */
  @Post(':id/auto-update')
  @HttpCode(HttpStatus.CREATED)
  async autoUpdate(@Param('id') id: string) {
    const mr = this.mrRepository.getById(Number(id));
    if (!mr) throw new HttpException({ error: 'Merge request not found' }, HttpStatus.NOT_FOUND);
    const enriched = (await this.mrService.fetchAndApplyIntakeMetadata(mr.id)) || mr;
    return { ...serializeMr(enriched) };
  }
}
