import { Module } from '@nestjs/common';
import { JiraCacheModule } from '../jira-cache/jira-cache.module';
import { AnalysisController, FsController } from './analysis.controller';
import { AnalysisGateway } from './analysis.gateway';
import { AnalysisRepository } from './analysis.repository';
import { AnalysisService } from './analysis.service';
import { FsDirsService } from './fs-dirs.service';
import { LocalOnlyGuard } from './local-only';

/**
 * Analysis tab (docs/epics/EPIC-001-analysis-tab.md). New agent tools are
 * registered in AnalysisService's constructor (ToolRegistry).
 */
@Module({
  imports: [JiraCacheModule],
  controllers: [AnalysisController, FsController],
  providers: [AnalysisRepository, FsDirsService, LocalOnlyGuard, AnalysisService, AnalysisGateway],
})
export class AnalysisModule {}
