import { parseStructuredJson } from '../mr/json-extract';
import { validateJiraReviewResult } from './jira-review-schema';

/**
 * Parses Claude's final result text for a Jira Issues page MR review,
 * looking for a JSON payload matching validateJiraReviewResult. Never
 * trusts prose ("LGTM", etc.) — only a structured object that passes
 * validation is accepted.
 */
export function parseJiraReviewResult(text: string) {
  return parseStructuredJson(text, validateJiraReviewResult);
}

export default parseJiraReviewResult;
