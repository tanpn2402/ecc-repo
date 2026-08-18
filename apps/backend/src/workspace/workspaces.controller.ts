import { Controller, Get, Inject } from '@nestjs/common';
import { WorkspaceService } from './workspace.service';

export interface WorkspaceDto {
  name: string;
  /** Human-friendly label derived from the WORKSPACE_<NAME> env var, e.g. "CSB FO". */
  label: string;
  path: string;
}

/**
 * GET /api/workspaces — lists every configured WORKSPACE_<NAME> for the
 * "choose a workspace to review in" modal (Jira Issues page). Only exposes
 * name/label/path; never accepts a workspace from the client beyond
 * selecting one of these names (see WorkspaceService's docblock).
 */
@Controller('api/workspaces')
export class WorkspacesController {
  constructor(@Inject(WorkspaceService) private readonly workspaceService: WorkspaceService) {}

  @Get()
  list(): WorkspaceDto[] {
    return this.workspaceService.list().map((name) => ({
      name,
      label: name.toUpperCase().replace(/_/g, ' '),
      path: this.workspaceService.getPath(name)!,
    }));
  }
}
