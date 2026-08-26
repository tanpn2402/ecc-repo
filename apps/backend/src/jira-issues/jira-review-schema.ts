// Strict validator for the JSON contract Claude must return for a Jira
// Issues page MR review. Deliberately a different, simpler shape than
// mr/review-schema.ts's contract (status/businessUnderstanding/technicalAnalysis/
// testAnalysis/recommendations) — that one belongs to the separate MR
// Management feature. This page's review_runs only ever stores
// verdict/summary/findings (see jira-issues.repository.ts).

export const JIRA_REVIEW_STATUSES = ['COMPLETED', 'FAILED'] as const;

export const JIRA_REVIEW_VERDICTS = [
  'APPROVE',
  'REQUEST_CHANGES',
  'COMMENT',
] as const;

export type JiraReviewStatus = (typeof JIRA_REVIEW_STATUSES)[number];
export type JiraReviewVerdict = (typeof JIRA_REVIEW_VERDICTS)[number];

export interface JiraReviewResultValue {
  status: JiraReviewStatus;
  verdict: JiraReviewVerdict;
  summary: string;
}

export type JiraReviewValidation =
  { ok: true; value: JiraReviewResultValue } | { ok: false; error: string };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Validates a parsed JSON object against the Jira Issues page's review contract. */
export function validateJiraReviewResult(obj: any): JiraReviewValidation {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { ok: false, error: 'Result is not a JSON object' };
  }

  const review = obj.review;

  if (!review || typeof review !== 'object' || Array.isArray(review)) {
    return { ok: false, error: 'Missing "review" object' };
  }

  if (!JIRA_REVIEW_STATUSES.includes(review.status)) {
    return {
      ok: false,
      error: `"review.status" must be one of ${JIRA_REVIEW_STATUSES.join(', ')}`,
    };
  }

  if (!JIRA_REVIEW_VERDICTS.includes(review.verdict)) {
    return {
      ok: false,
      error: `"review.verdict" must be one of ${JIRA_REVIEW_VERDICTS.join(', ')}`,
    };
  }

  if (!isNonEmptyString(review.summary)) {
    return {
      ok: false,
      error: 'Missing "review.summary"',
    };
  }

  return {
    ok: true,
    value: {
      status: review.status,
      verdict: review.verdict,
      summary: review.summary.trim(),
    },
  };
}

export default validateJiraReviewResult;
