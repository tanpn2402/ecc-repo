import { Controller, Get } from '@nestjs/common';
import { ClaudeService } from './claude.service';

@Controller('api/claude')
export class ClaudeController {
  constructor(
    private readonly claudeService: ClaudeService,
  ) {}

  @Get('usage')
  getUsage() {
    return this.claudeService.getUsage();
  }
}