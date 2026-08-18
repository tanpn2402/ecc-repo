import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';

const sqlite = new Database('./data/app.db');

export const db = drizzle(sqlite);

export type Database = typeof db;
