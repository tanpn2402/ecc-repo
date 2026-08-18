import { Module } from '@nestjs/common';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/configuration';
import { ClaudeClient } from './claude-client';
import { ClaudeLifecycleService } from './claude-lifecycle.service';

@Module({
  providers: [
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
  exports: [ClaudeClient],
})
export class ClaudeModule {}
