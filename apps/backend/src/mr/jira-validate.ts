// Shared Jira-object validation, used by both the full review contract
// (review-schema.js) and the lightweight metadata-only contract
// (metadata-schema.js) — kept in one place so the "responsible comes from
// the Jira 'Responsible' custom field, never Assignee, and null means the
// field doesn't exist" rule can't drift between the two call sites.

export interface JiraFieldValue {
  id: string;
  url: string;
  title: string;
  responsible: string | null;
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function isNonEmptyString(v: any): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * Validates a `jira` field (an object or null). Returns { ok: true, value }
 * or { ok: false, error }. `value` is null, or
 * { id, url, title, responsible: string | null }.
 */
export function validateJiraField(j: any): ValidationResult<JiraFieldValue | null> {
  if (j === null || j === undefined) {
    return { ok: true, value: null };
  }
  if (typeof j !== 'object' || Array.isArray(j)) {
    return { ok: false, error: '"jira" must be an object or null' };
  }
  if (!isNonEmptyString(j.id) || !isNonEmptyString(j.url) || !isNonEmptyString(j.title)) {
    return { ok: false, error: 'Jira object must include non-empty "id", "url" and "title"' };
  }
  return {
    ok: true,
    value: {
      id: j.id.trim(),
      url: j.url.trim(),
      title: j.title.trim(),
      // Sourced from the Jira issue's "Responsible" custom field, never the
      // Assignee field — null means that custom field doesn't exist or is
      // empty on this issue, not "nobody is responsible".
      responsible: isNonEmptyString(j.responsible) ? j.responsible.trim() : null,
    },
  };
}

export default validateJiraField;
