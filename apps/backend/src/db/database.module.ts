import { Global, Module, OnModuleDestroy, Inject } from '@nestjs/common';
import type Database from 'better-sqlite3';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/configuration';
import { DATABASE_CONNECTION, DRIZZLE_DB, createDatabaseConnection, createDrizzleClient } from './database.provider';

@Global()
@Module({
  providers: [
    {
      provide: DATABASE_CONNECTION,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => createDatabaseConnection(config.storage.databasePath),
    },
    {
      provide: DRIZZLE_DB,
      inject: [DATABASE_CONNECTION],
      useFactory: (connection: Database.Database) => createDrizzleClient(connection),
    },
  ],
  exports: [DATABASE_CONNECTION, DRIZZLE_DB],
})
export class DatabaseModule implements OnModuleDestroy {
  constructor(@Inject(DATABASE_CONNECTION) private readonly connection: Database.Database) {}

  onModuleDestroy() {
    this.connection.close();
  }
}
