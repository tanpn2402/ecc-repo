import { Module } from '@nestjs/common';
import { JiraCacheService } from './jira-cache.service';

/** JiraClient comes from the global module in app.module.ts. */
@Module({
  providers: [JiraCacheService],
  exports: [JiraCacheService],
})
export class JiraCacheModule {}
