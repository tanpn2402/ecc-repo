import { sqliteTable, integer, text, index } from 'drizzle-orm/sqlite-core';
import { mergeRequests } from './merge-requests';

export const mrReviews = sqliteTable(
  'mr_reviews',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    mergeRequestId: integer('merge_request_id')
      .notNull()
      .references(() => mergeRequests.id, { onDelete: 'cascade' }),
    status: text('status').notNull(),
    summary: text('summary'),
    businessUnderstanding: text('business_understanding'),
    technicalAnalysis: text('technical_analysis'),
    testAnalysis: text('test_analysis'),
    findingsJson: text('findings_json'),
    recommendationsJson: text('recommendations_json'),
    rawResult: text('raw_result'),
    errorMessage: text('error_message'),
    createdAt: text('created_at').notNull(),
    completedAt: text('completed_at'),
  },
  (table) => ({
    mrIdIdx: index('idx_mr_reviews_mr_id').on(table.mergeRequestId),
  })
);
