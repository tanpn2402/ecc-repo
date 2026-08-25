import * as fs from 'node:fs';
import * as path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import logger from '@/common/logger';

export const DATABASE_CONNECTION = Symbol('DATABASE_CONNECTION');
export const DRIZZLE_DB = Symbol('DRIZZLE_DB');

export type DrizzleDb = BetterSQLite3Database<typeof schema>;

export function createDatabaseConnection(databasePath: string): Database.Database {
  logger.info(`DB location at ${databasePath}`);
  if (databasePath !== ':memory:') {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  }
  const db = new Database(databasePath);
  return db;
}

export function createDrizzleClient(connection: Database.Database): DrizzleDb {
  return drizzle(connection, { schema });
}
