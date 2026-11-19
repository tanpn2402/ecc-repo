import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import type { ApproveMode } from '../agent/agent-events';
import { AnalysisService, toHttpError } from './analysis.service';
import { FsDirsService } from './fs-dirs.service';
import { LocalOnlyGuard } from './local-only';

/**
 * Paths are checked by the service; ECC_HOME is ~/.ecc by default, and
 * sendFile refuses any path through a dot folder unless told otherwise.
 */
const SEND_OPTS = { dotfiles: 'allow' as const };

async function run<T>(fn: () => T | Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw toHttpError(err);
  }
}

/** Folder picker: sub-folder names inside ANALYSIS_ROOTS. */
@Controller('api/fs')
@UseGuards(LocalOnlyGuard)
export class FsController {
  constructor(private readonly fsDirs: FsDirsService) {}

  @Get('dirs')
  dirs(@Query('path') path?: string, @Query('hidden') hidden?: string) {
    return run(() => this.fsDirs.list(path, hidden === '1' || hidden === 'true'));
  }
}

/** REST side of the Analysis tab; live chat goes over the /analysis socket (analysis.gateway.ts). */
@Controller('api/analysis')
@UseGuards(LocalOnlyGuard)
export class AnalysisController {
  constructor(private readonly analysis: AnalysisService) {}

  @Get('status')
  status() {
    return run(() => this.analysis.status());
  }

  @Get('workspaces')
  listWorkspaces() {
    return run(() => this.analysis.listWorkspaces());
  }

  @Post('workspaces')
  createWorkspace(@Body() body: { name?: string; path?: string; contextMd?: string }) {
    return run(() => this.analysis.createWorkspace(body ?? {}));
  }

  @Patch('workspaces/:id')
  updateWorkspace(@Param('id', ParseIntPipe) id: number, @Body() body: { name?: string; path?: string; contextMd?: string }) {
    return run(() => this.analysis.updateWorkspace(id, body ?? {}));
  }

  @Delete('workspaces/:id')
  deleteWorkspace(@Param('id', ParseIntPipe) id: number) {
    return run(() => this.analysis.deleteWorkspace(id));
  }

  @Get('workspaces/:id/threads')
  listThreads(@Param('id', ParseIntPipe) id: number) {
    return run(() => this.analysis.listThreads(id));
  }

  @Post('workspaces/:id/threads')
  createThread(@Param('id', ParseIntPipe) id: number, @Body() body: { cwd?: string; addDirs?: string[]; model?: string; approveMode?: ApproveMode }) {
    return run(() => this.analysis.createThread(id, body ?? {}));
  }

  @Get('threads/:sid')
  thread(@Param('sid') sid: string) {
    return run(() => this.analysis.threadDetail(sid));
  }

  @Patch('threads/:sid')
  updateThread(@Param('sid') sid: string, @Body() body: { title?: string; model?: string; addDirs?: string[]; cwd?: string; approveMode?: ApproveMode }) {
    return run(() => this.analysis.updateThread(sid, body ?? {}));
  }

  @Delete('threads/:sid/grants')
  clearGrants(@Param('sid') sid: string) {
    return run(() => this.analysis.clearGrants(sid));
  }

  @Delete('threads/:sid')
  deleteThread(@Param('sid') sid: string) {
    return run(() => this.analysis.deleteThread(sid));
  }

  @Get('threads/:sid/attachments')
  attachments(@Param('sid') sid: string) {
    return run(() => this.analysis.attachments(sid));
  }

  @Get('threads/:sid/files/:name')
  async file(@Param('sid') sid: string, @Param('name') name: string, @Res() res: Response) {
    const file = await run(() => this.analysis.filePath(sid, name));
    if (!file) throw new NotFoundException();
    res.sendFile(file, SEND_OPTS);
  }

  @Get('jira/:key')
  jira(@Param('key') key: string) {
    return run(() => this.analysis.jiraIssue(key));
  }

  @Get('jira/:key/preview')
  jiraPreview(@Param('key') key: string) {
    return run(() => this.analysis.jiraPreview(key));
  }

  @Post('jira/:key/refresh')
  refreshJira(@Param('key') key: string) {
    return run(() => this.analysis.refreshJira(key));
  }

  @Get('jira/:key/attachments/:file')
  async jiraAttachment(@Param('key') key: string, @Param('file') file: string, @Res() res: Response) {
    const full = await run(() => this.analysis.jiraAttachment(key, file));
    if (!full) throw new NotFoundException();
    res.sendFile(full, SEND_OPTS);
  }
}
