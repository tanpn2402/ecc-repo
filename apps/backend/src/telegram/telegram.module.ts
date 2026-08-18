import { Module } from '@nestjs/common';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/configuration';
import { TelegramApi } from './telegram-api';
import { SessionsRepository } from './sessions.repository';
import { SessionManager } from './session-manager';
import { MessageHandlerService } from './message-handler';
import { TelegramService } from './telegram.service';
import { WorkspaceModule } from '../workspace/workspace.module';
import { ClaudeModule } from '../claude/claude.module';

@Module({
  imports: [WorkspaceModule, ClaudeModule],
  providers: [
    {
      provide: TelegramApi,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => new TelegramApi(config.telegram.botToken),
    },
    SessionsRepository,
    SessionManager,
    MessageHandlerService,
    TelegramService,
  ],
  exports: [SessionManager],
})
export class TelegramModule {}
