import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import { MRService } from './mr.service';

@Controller('api/mrs')
export class MrController {
  constructor(private readonly mrService: MRService) {}

  @Get()
  async getMrs() {
    return this.mrService.listMrs();
  }

  @Post('review')
  async createReview(@Body() body: { gitlabUrls: string[]; review: string }) {
    const result: any[] = [];
    for (const gitlabUrl of body.gitlabUrls) {
      result.push(await this.mrService.createReview(gitlabUrl, body.review));
    }
    return result;
  }
}
