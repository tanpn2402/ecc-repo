import { renderMarkdownSafe } from './render-markdown';

export function serializeMr(mr: any) {
  if (!mr) return null;
  return {
    id: String(mr.id),
    gitlabUrl: mr.gitlabUrl,
    gitlabProject: mr.gitlabProject,
    gitlabMrIid: mr.gitlabMrIid,
    jiraId: mr.jiraId,
    jiraUrl: mr.jiraUrl,
    jiraTitle: mr.jiraTitle,
    responsible: mr.responsible,
    sprint: mr.sprint,
    author: mr.author,
    title: mr.title,
    status: mr.status,
    errorMessage: mr.errorMessage,
    createdAt: mr.createdAt,
    updatedAt: mr.updatedAt,
  };
}

export function serializeReview(review: any, { reviewNumber }: { reviewNumber?: number } = {}) {
  if (!review) return null;
  return {
    id: String(review.id),
    reviewNumber,
    status: review.status,
    summary: review.summary,
    summaryHtml: renderMarkdownSafe(review.summary),
    businessUnderstanding: review.businessUnderstanding,
    businessUnderstandingHtml: renderMarkdownSafe(review.businessUnderstanding),
    technicalAnalysis: review.technicalAnalysis,
    technicalAnalysisHtml: renderMarkdownSafe(review.technicalAnalysis),
    testAnalysis: review.testAnalysis,
    testAnalysisHtml: renderMarkdownSafe(review.testAnalysis),
    findings: review.findings,
    recommendations: review.recommendations,
    // Claude's full, unedited final message for this run — rendered as
    // plain text client-side (never dangerouslySetInnerHTML), so no
    // sanitization is needed here the way the *Html fields above require.
    rawResult: review.rawResult,
    errorMessage: review.errorMessage,
    createdAt: review.createdAt,
    completedAt: review.completedAt,
  };
}

export function serializeReviewList(reviews: any[]) {
  const total = reviews.length;
  return reviews.map((review, index) => serializeReview(review, { reviewNumber: total - index }));
}

export default { serializeMr, serializeReview, serializeReviewList };
