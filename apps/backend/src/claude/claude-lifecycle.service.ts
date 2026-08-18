import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ClaudeClient } from './claude-client';
import logger from '../common/logger';

/**
 * Port of index.js's shutdown() loop:
 *   for (const chatId of [...claudeClient.activeProcesses.keys()]) {
 *     claudeClient.stop(chatId);
 *   }
 * ClaudeClient is a single shared instance across TelegramModule and
 * MrModule, so this lives alongside it (not inside TelegramModule) — a
 * Telegram-only shutdown hook would miss in-flight MR review processes and
 * vice versa.
 */
@Injectable()
export class ClaudeLifecycleService implements OnModuleDestroy {
  constructor(@Inject(ClaudeClient) private readonly claudeClient: ClaudeClient) {}

  onModuleDestroy(): void {
    for (const key of [...this.claudeClient.activeProcesses.keys()]) {
      logger.info('Killing active Claude process on shutdown', { key });
      this.claudeClient.stop(key);
    }
  }
}
