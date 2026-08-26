// Builds the review prompt for the Jira Issues page's "Review"/"Re-review"
// action. Distinct from mr/review-prompt.ts (that one's schema/status enum
// belongs to the separate MR Management feature) — see jira-review-schema.ts.
//
// The MR URL is validated (host allow-list, well-formed path) before this
// function ever sees it, and is only ever embedded as a clearly delimited
// data value — never concatenated into the instruction text itself.

const SCHEMA_EXAMPLE = `{
  "review": {
    "status": "COMPLETED",
    "verdict": "REQUEST_CHANGES",
    "summary": "..."
  }
}`;

export interface BuildJiraReviewPromptParams {
  mrUrl: string;
  gitlabProject: string;
  reviewSkill?: string;
  mrTitle?: string | null;
  mrAuthor?: string | null;
  gitlabToken?: string;
}

export function buildJiraReviewPrompt({ mrUrl, gitlabProject, reviewSkill = 'reviewcsbfo', mrAuthor, mrTitle, gitlabToken }: BuildJiraReviewPromptParams): string {
  return `You are performing a senior-level code review of a GitLab Merge Request.

Use SKILL '${reviewSkill}' to review the code changes for this merge request.

Merge request:
- URL: ${mrUrl}
- GitLab project: ${gitlabProject}
- Title: ${mrTitle || '(unknown)'}
- Author: ${mrAuthor || '(unknown)'}
- GITLAB_TOKEN: ${gitlabToken}

Review the actual changes and surrounding code carefully. Do not fabricate information that you could not verify.

Your review must:

1. Identify correctness, security, authorization, data exposure, regression, performance, testing, and maintainability issues.
2. Prioritize findings by severity:
   - Critical: severe security, data-loss, authentication/authorization bypass, or production-impacting issue.
   - High: serious bug, security issue, regression, incorrect business behavior, or missing critical validation.
   - Medium: meaningful defect or risk that should normally be addressed.
   - Low: minor issue or improvement.
3. Only report findings that are supported by evidence from the code, diff, tests, or review context.
4. For every finding include:
   - Severity
   - Clear action-oriented fix
   - File path and line when available
   - Problem
   - Expected behavior
   - Impact
5. Deduplicate overlapping findings from different reviewer passes.
6. Clearly distinguish blocking findings from informational verification items.
7. Determine the final verdict:
   - APPROVE: no blocking Critical/High issues.
   - REQUEST_CHANGES: one or more Critical/High issues.
   - COMMENT: useful observations only, with no blocking issues, when the review should not be treated as an approval.
8. Include risk level in the final verdict: Low, Medium, or High.
9. Include review scope and validation/build information when available.
10. If multiple independent reviewer passes were performed, summarize that fact at the end.

The final summary MUST be a complete, self-contained Markdown review suitable for directly displaying in a web UI.

Use this general structure:

**Code Review — <JIRA_KEY>**: <one or two sentence overall assessment>

- **Critical/High/Medium/Low** — Fix: <action>
  (<file path>:<line>)
  Problem: <what is wrong>.
  Expected: <what should happen>.
  Impact: <why it matters>.

Verdict: **<Approve | Request Changes | Comment>** · Risk: **<Low | Medium | High>** — <concise reason>

Scope: <reviewed commits, branches, paths, or other relevant scope>

Build: <validation/build result>

*<review pass information, if available>*

Jira: <Jira tracking information, if available>
Processing time: <duration, if available>

Rules for the Markdown:
- Return valid Markdown.
- Do not use raw HTML.
- Do not put the Markdown inside a fenced code block.
- Do not omit important findings merely to make the summary shorter.
- Keep the opening assessment concise.
- Keep individual findings concise but actionable.
- If there are no findings, explicitly say so.
- Do not invent a Jira key. If none is available, use the MR identifier instead.

Respond with EXACTLY ONE fenced JSON code block as the very last thing in your message.

The JSON must match this shape exactly:

\`\`\`json
${SCHEMA_EXAMPLE}
\`\`\`

Do not add any other JSON fields.

The value of \`review.summary\` must contain the complete Markdown review described above.
`;
}

export default buildJiraReviewPrompt;