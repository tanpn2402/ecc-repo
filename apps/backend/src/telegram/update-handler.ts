import logger from '../common/logger';
import type { TelegramApi } from './telegram-api';

/**
 * Long-polls Telegram's getUpdates endpoint and dispatches each update to
 * `onUpdate`. Update processing errors are caught per-update so a single bad
 * message never stops the polling loop; getUpdates errors trigger a bounded
 * backoff before retrying.
 */
export class UpdateHandler {
  private readonly api: TelegramApi;
  private readonly onUpdate: (update: any) => Promise<void>;
  private readonly pollTimeoutSec: number;
  private offset: number | undefined;
  private stopped = true;

  constructor(api: TelegramApi, onUpdate: (update: any) => Promise<void>, { pollTimeoutSec = 30 }: { pollTimeoutSec?: number } = {}) {
    this.api = api;
    this.onUpdate = onUpdate;
    this.pollTimeoutSec = pollTimeoutSec;
  }

  async start(): Promise<void> {
    this.stopped = false;
    let backoffMs = 1000;
    logger.info('Telegram long polling started');

    while (!this.stopped) {
      let updates: any[];
      try {
        updates = await this.api.getUpdates({ offset: this.offset, timeout: this.pollTimeoutSec });
        backoffMs = 1000;
      } catch (err: any) {
        logger.error('getUpdates failed, backing off', { error: err.message, backoffMs });
        await sleep(backoffMs);
        backoffMs = Math.min(backoffMs * 2, 30000);
        continue;
      }

      for (const update of updates) {
        this.offset = update.update_id + 1;
        try {
          await this.onUpdate(update);
        } catch (err: any) {
          logger.error('Error handling Telegram update', { updateId: update.update_id, error: err.message });
        }
      }
    }
    logger.info('Telegram long polling stopped');
  }

  stop(): void {
    this.stopped = true;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
