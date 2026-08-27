import { APP_CONFIG } from '@/config/config.module';
import type { AppConfig } from '@/config/configuration';
import { Controller, Get, Inject, Param, Post } from '@nestjs/common';
import { TeamsService } from './teams.service';

@Controller('api/teams')
export class TeamsController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly teamsService: TeamsService,
  ) {}

  @Post('push/:reviewId')
  getProjects(@Param('reviewId') reviewId: string) {
    return this.teamsService.sendReviewNotification(+reviewId);
  }
}
