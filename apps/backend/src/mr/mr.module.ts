import { Module } from '@nestjs/common';

import { MrRepository } from './mr.repository';
import { MrController } from './mr.controller';
import { MRService } from './mr.service';

@Module({
  controllers: [MrController],
  providers: [MrRepository, MRService],
  exports: [MrRepository],
})
export class MrModule {}
