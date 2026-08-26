import { APP_CONFIG } from '@/config/config.module';
import type { AppConfig } from '@/config/configuration';
import { Controller, Get, Inject } from '@nestjs/common';

export type OpsProject = AppConfig['ops']['projects'][number];

@Controller('api/ops')
export class OpsController {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  @Get('projects')
  getProjects(): OpsProject[] {
    return this.config.ops.projects;
  }
}
