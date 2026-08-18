// Strict validator for the lightweight "auto update details" contract:
// just the GitLab MR's title/author and the linked Jira issue's id/url/title
// plus its "Responsible" custom field — no review/decision content. Used by
// the "Auto update details" button, as opposed to a full code review.
import { isNonEmptyString, validateJiraField, JiraFieldValue, ValidationResult } from './jira-validate';

export interface MetadataResult {
  jira: JiraFieldValue | null;
  title: string;
  author: string;
}

/**
 * Validates a parsed JSON object against the metadata-only contract.
 * Returns { ok: true, value } or { ok: false, error }.
 */
export function validateMetadataResult(obj: any): ValidationResult<MetadataResult> {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { ok: false, error: 'Result is not a JSON object' };
  }

  const jiraResult = validateJiraField(obj.jira);
  if (!jiraResult.ok) return jiraResult;

  const mr = obj.mergeRequest;
  const title = mr && isNonEmptyString(mr.title) ? mr.title.trim() : '';
  const author = mr && isNonEmptyString(mr.author) ? mr.author.trim() : '';

  return {
    ok: true,
    value: { jira: jiraResult.value, title, author },
  };
}

export default validateMetadataResult;
