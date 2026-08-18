import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { TelegramApi } from './telegram-api';
import { UpdateHandler } from './update-handler';
import { MessageHandlerService } from './message-handler';
import logger from '../common/logger';

/**
 * Owns the Telegram long-polling lifecycle. Port of index.js's Telegram
 * wiring (`new UpdateHandler(api, handleUpdate); await updateHandler.start()`)
 * as a Nest lifecycle-hook-driven service.
 *
 * Note: `start()` runs an infinite poll loop that only resolves once
 * `stop()` is called, so it's deliberately NOT awaited here — awaiting it in
 * onModuleInit would hang Nest's bootstrap forever (onModuleInit hooks must
 * resolve before the app finishes initializing). This mirrors the original
 * ordering intent (start polling once the rest of the app is wired) without
 * blocking startup — main.ts still validates config synchronously before
 * NestFactory.create() ever runs, so polling never starts before required
 * configuration is validated.
 */
@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private updateHandler!: UpdateHandler;

  constructor(
    @Inject(TelegramApi) private readonly api: TelegramApi,
    @Inject(MessageHandlerService) private readonly messageHandler: MessageHandlerService
  ) {}

  onModuleInit(): void {
    this.updateHandler = new UpdateHandler(this.api, (update) => this.messageHandler.handleUpdate(update));
    this.updateHandler.start().catch((err: any) => {
      logger.error('Telegram polling loop crashed', { error: err.stack || err.message });
    });
  }

  onModuleDestroy(): void {
    this.updateHandler?.stop();
  }
}
