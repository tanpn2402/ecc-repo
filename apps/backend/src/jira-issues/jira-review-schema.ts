// Strict validator for the JSON contract Claude must return for a Jira
// Issues page MR review. Deliberately a different, simpler shape than
// mr/review-schema.ts's contract (status/businessUnderstanding/technicalAnalysis/
// testAnalysis/recommendations) — that one belongs to the separate MR
// Management feature. This page's review_runs only ever stores
// verdict/summary/findings (see jira-issues.repository.ts).

export interface JiraReviewFinding {
  severity: string;
  text: string;
}

export interface JiraReviewResultValue {
  verdict: string;
  summary: string;
  findings: JiraReviewFinding[];
}

export const JIRA_REVIEW_VERDICTS = ['Approved', 'Changes Requested', 'Blocked'];

export type JiraReviewValidation = { ok: true; value: JiraReviewResultValue } | { ok: false; error: string };

function isFindingsArray(value: any): value is JiraReviewFinding[] {
  return Array.isArray(value) && value.every((f) => f && typeof f === 'object' && typeof f.severity === 'string' && typeof f.text === 'string');
}

/** Validates a parsed JSON object against the Jira Issues page's review contract. */
export function validateJiraReviewResult(obj: any): JiraReviewValidation {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { ok: false, error: 'Result is not a JSON object' };
  }
  if (typeof obj.verdict !== 'string' || !JIRA_REVIEW_VERDICTS.includes(obj.verdict)) {
    return { ok: false, error: `"verdict" must be one of ${JIRA_REVIEW_VERDICTS.join(', ')}` };
  }
  if (typeof obj.summary !== 'string' || !obj.summary.trim()) {
    return { ok: false, error: 'Missing "summary"' };
  }
  const findings = obj.findings ?? [];
  if (!isFindingsArray(findings)) {
    return { ok: false, error: '"findings" must be an array of { severity, text }' };
  }

  return {
    ok: true,
    value: {
      verdict: obj.verdict,
      summary: obj.summary.trim(),
      findings: findings.map((f) => ({ severity: f.severity.trim(), text: f.text.trim() })).filter((f) => f.text),
    },
  };
}

export default validateJiraReviewResult;
