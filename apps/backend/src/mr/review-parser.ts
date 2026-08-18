import { parseStructuredJson } from './json-extract';
import { validateReviewResult } from './review-schema';

/**
 * Parses Claude's final result text for the MR review, looking for a JSON
 * payload matching the application's schema. Never trusts prose ("LGTM",
 * etc.) — only a structured object that passes validateReviewResult.
 *
 * Returns { ok: true, value } or { ok: false, error }.
 */
export function parseReviewResult(text: string) {
  return parseStructuredJson(text, validateReviewResult);
}

export default parseReviewResult;
