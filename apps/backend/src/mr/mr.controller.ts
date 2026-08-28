import { Controller, Get } from '@nestjs/common';

import { MRService } from './mr.service';

@Controller('api/mrs')
export class MrController {
  constructor(private readonly mrService: MRService) {}

  @Get()
  async getMrs() {
    return this.mrService.listMrs();
  }
}
