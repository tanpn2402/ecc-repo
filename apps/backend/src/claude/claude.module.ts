import { Module } from '@nestjs/common';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/configuration';
import { ClaudeClient } from './claude-client';
import { ClaudeLifecycleService } from './claude-lifecycle.service';
import { ClaudeController } from './claude.controller';
import { ClaudeService } from './claude.service';

@Module({
  controllers: [ClaudeController],

  providers: [
    ClaudeService,
    
    {
      provide: ClaudeClient,
      inject: [APP_CONFIG],
      // sessionManager was already unused inside ClaudeClient before this
      // migration (confirmed by reading claude-client.js) — passing null
      // here also sidesteps a circular TelegramModule<->ClaudeModule
      // dependency that injecting the real SessionManager would create.
      useFactory: (config: AppConfig) => new ClaudeClient(config, null),
    },
    ClaudeLifecycleService,
  ],
  exports: [ClaudeClient, ClaudeService],
})
export class ClaudeModule {}
