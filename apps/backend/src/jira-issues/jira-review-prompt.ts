// Builds the review prompt for the Jira Issues page's "Review"/"Re-review"
// action. Distinct from mr/review-prompt.ts (that one's schema/status enum
// belongs to the separate MR Management feature) — see jira-review-schema.ts.
//
// The MR URL is validated (host allow-list, well-formed path) before this
// function ever sees it, and is only ever embedded as a clearly delimited
// data value — never concatenated into the instruction text itself.

const SCHEMA_EXAMPLE = `{
  "verdict": "Approved" | "Changes Requested" | "Blocked",
  "summary": "...",
  "findings": [{ "severity": "Info" | "Warning" | "Critical", "text": "..." }]
}`;

export interface BuildJiraReviewPromptParams {
  mrUrl: string;
  gitlabProject: string;
  reviewSkill?: string;
  mrTitle?: string | null;
  mrAuthor?: string | null;
}

export function buildJiraReviewPrompt({ mrUrl, gitlabProject, reviewSkill = 'reviewcsbfo' }: BuildJiraReviewPromptParams): string {
  return `You are reviewing a GitLab Merge Request in project ${gitlabProject}.
1. Use SKILL '${reviewSkill}' to review the code changes for this merge
   request ${mrUrl}.
2. Decide a verdict:
   - "Approved" — no blocking issues.
   - "Changes Requested" — non-blocking issues worth flagging.
   - "Blocked" — a requirement mismatch, serious bug, regression, missing
     critical test, or other blocking issue.
   Do not decide this from words like "LGTM" alone — make your own
   determination from the evidence.

Respond with your reasoning followed by EXACTLY ONE fenced JSON code block
(\`\`\`json ... \`\`\`) as the very last thing in your message, matching this
shape exactly (no extra top-level keys):

\`\`\`json
${SCHEMA_EXAMPLE}
\`\`\`

Every string field must be plain text or Markdown — do not include raw HTML.
Do not fabricate information you could not verify.`;
}

export default buildJiraReviewPrompt;
