import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE_DB, type DrizzleDb } from "@/db/database.provider";
import { sessions } from '@/db/schema';

export interface SessionRow {
  chatId: number;
  telegramUserId: number;
  project: string | null;
  workspace: string | null;
  claudeSessionId: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Drizzle port of storage/database.js's SessionStore. Same table
 * (`sessions`), same semantics — only the query layer changed from raw
 * better-sqlite3 SQL to Drizzle's query builder.
 */
@Injectable()
export class SessionsRepository {
  constructor(@Inject(DRIZZLE_DB) private readonly db: DrizzleDb) {}

  getSession(chatId: number): SessionRow | undefined {
    return this.db.select().from(sessions).where(eq(sessions.chatId, chatId)).get();
  }

  /** Ensures a session row exists for this chat, without touching an existing one. */
  ensureSession(chatId: number, telegramUserId: number): SessionRow | undefined {
    const now = new Date().toISOString();
    this.db
      .insert(sessions)
      .values({
        chatId,
        telegramUserId,
        project: null,
        workspace: null,
        claudeSessionId: null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: sessions.chatId })
      .run();
    return this.getSession(chatId);
  }

  /** Switches the active project/workspace for a chat and drops any prior Claude session. */
  setProject(chatId: number, telegramUserId: number, project: string, workspace: string): SessionRow | undefined {
    const now = new Date().toISOString();
    this.ensureSession(chatId, telegramUserId);
    this.db
      .update(sessions)
      .set({ project, workspace, claudeSessionId: null, updatedAt: now })
      .where(eq(sessions.chatId, chatId))
      .run();
    return this.getSession(chatId);
  }

  /** Persists the Claude Code session id returned after a successful turn. */
  setClaudeSessionId(chatId: number, claudeSessionId: string): void {
    const now = new Date().toISOString();
    this.db.update(sessions).set({ claudeSessionId, updatedAt: now }).where(eq(sessions.chatId, chatId)).run();
  }

  /** Clears the Claude session id only (used by /reset and /new), keeping the project selection. */
  clearClaudeSession(chatId: number): void {
    const now = new Date().toISOString();
    this.db.update(sessions).set({ claudeSessionId: null, updatedAt: now }).where(eq(sessions.chatId, chatId)).run();
  }
}
