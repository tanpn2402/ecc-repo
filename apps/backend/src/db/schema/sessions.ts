import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';

export const sessions = sqliteTable('sessions', {
  chatId: integer('chat_id').primaryKey(),
  telegramUserId: integer('telegram_user_id').notNull(),
  project: text('project'),
  workspace: text('workspace'),
  claudeSessionId: text('claude_session_id'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});
