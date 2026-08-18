// Builds the dedicated MR review prompt. The MR URL is validated (host
// allow-list, well-formed path) before this function ever sees it, and is
// only ever embedded as a clearly delimited data value — never concatenated
// into the instruction text itself.
//
// GitLab MR title/author are fetched by the backend directly via the GitLab
// REST API (src/mr/gitlab-client.js) and passed in as MR_TITLE/MR_AUTHOR
// data below — Claude is explicitly told not to re-fetch them itself. This
// avoids a real double-call: the specified REVIEW skill may already talk to
// GitLab (and/or Jira) as part of its own review workflow, so this prompt no
// longer issues its own separate "go fetch GitLab/Jira" instructions on top
// of that — which used to mean the GitLab token could effectively be used
// twice per review (once by this prompt's own steps, once inside the
// skill). Jira/"Responsible" is deliberately left untouched by a review for
// the same reason; it is still refreshed via the separate "Auto update
// details" action (src/mr/metadata-prompt.js), which never invokes a Skill
// and so has no such double-call risk.

const SCHEMA_EXAMPLE = `{
  "review": {
    "status": "READY_TO_MERGE" | "BLOCKED",
    "summary": "...",
    "businessUnderstanding": "...",
    "technicalAnalysis": "...",
    "testAnalysis": "...",
    "findings": ["..."],
    "recommendations": ["..."]
  }
}`;

export interface BuildReviewPromptParams {
  mrUrl: string;
  gitlabProject: string;
  reviewSkill?: string;
  mrTitle?: string;
  mrAuthor?: string;
}

// Note: `mrTitle`/`mrAuthor` are intentionally accepted but not referenced
// anywhere in the returned template below — this is a known, pre-existing
// quirk of the original implementation, preserved as-is.
export function buildReviewPrompt({ mrUrl, gitlabProject, reviewSkill = 'reviewcsbfo', mrTitle, mrAuthor }: BuildReviewPromptParams): string {
  return `You are reviewing a GitLab Merge Request.
1. Use SKILL '${reviewSkill}' to review the code changes for this merge
   request ${mrUrl}.
2. Decide "READY_TO_MERGE" or "BLOCKED". Use "BLOCKED" for any requirement
   mismatch, serious bug, regression, missing critical test, or other
   blocking issue. Do not decide this from words like "LGTM" — make your
   own determination from the evidence above.

Respond with your reasoning followed by EXACTLY ONE fenced JSON code block
(\`\`\`json ... \`\`\`) as the very last thing in your message, matching this
shape exactly (no extra top-level keys, use null literally where noted):

\`\`\`json
${SCHEMA_EXAMPLE}
\`\`\`

Every string field must be plain text or Markdown — do not include raw HTML.
Do not fabricate information you could not verify.`;
}

export default buildReviewPrompt;
