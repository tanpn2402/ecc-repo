// Strict validator for the JSON contract Claude must return for an MR review.
// The Node app never infers status from free-form text — only this shape is
// trusted, and everything else about Claude's output is discarded.
//
// Deliberately does NOT include "jira" or "mergeRequest" fields: MR
// title/author are fetched by the backend directly from the GitLab REST API
// (src/mr/gitlab-client.js), and Jira/"Responsible" is refreshed separately
// via the "Auto update details" action — never as part of a review — so
// Claude is never asked to report either here (see review-prompt.js).
import { isNonEmptyString } from './jira-validate';
import { ValidationResult } from './jira-validate';

export const REVIEW_STATUSES = ['READY_TO_MERGE', 'BLOCKED'];

export interface ReviewResultValue {
  review: {
    status: string;
    summary: string;
    findings: string[];
    recommendations: string[];
    businessUnderstanding: string;
    technicalAnalysis: string;
    testAnalysis: string;
  };
}

function isStringArray(v: any): v is string[] {
  return Array.isArray(v) && v.every((item) => typeof item === 'string');
}

/**
 * Validates a parsed JSON object against the MR review contract.
 * Returns { ok: true, value } or { ok: false, error }.
 */
export function validateReviewResult(obj: any): ValidationResult<ReviewResultValue> {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { ok: false, error: 'Result is not a JSON object' };
  }

  const review = obj.review;
  if (!review || typeof review !== 'object') {
    return { ok: false, error: 'Missing "review" object' };
  }
  if (!REVIEW_STATUSES.includes(review.status)) {
    return { ok: false, error: `"review.status" must be one of ${REVIEW_STATUSES.join(', ')}` };
  }
  if (!isNonEmptyString(review.summary)) {
    return { ok: false, error: 'Missing "review.summary"' };
  }
  const findings = review.findings ?? [];
  const recommendations = review.recommendations ?? [];
  if (!isStringArray(findings)) {
    return { ok: false, error: '"review.findings" must be an array of strings' };
  }
  if (!isStringArray(recommendations)) {
    return { ok: false, error: '"review.recommendations" must be an array of strings' };
  }

  return {
    ok: true,
    value: {
      review: {
        status: review.status,
        summary: review.summary.trim(),
        findings: findings.map((f: string) => f.trim()).filter(Boolean),
        recommendations: recommendations.map((r: string) => r.trim()).filter(Boolean),
        businessUnderstanding: isNonEmptyString(review.businessUnderstanding) ? review.businessUnderstanding.trim() : '',
        technicalAnalysis: isNonEmptyString(review.technicalAnalysis) ? review.technicalAnalysis.trim() : '',
        testAnalysis: isNonEmptyString(review.testAnalysis) ? review.testAnalysis.trim() : '',
      },
    },
  };
}

export default validateReviewResult;
