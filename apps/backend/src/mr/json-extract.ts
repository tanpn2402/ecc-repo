// Shared JSON-extraction/validation glue for parsing Claude's free-form
// final message text into a structured result. Used by both the full
// review contract (review-parser.js) and the lightweight metadata-only
// contract (metadata-parser.js). Never trusts prose — only a JSON payload
// that passes the caller-supplied validator is accepted.

export type ValidateResult = { ok: true; value: any } | { ok: false; error: string };
export type Validate = (parsed: any) => ValidateResult;

/** Extracts the first fenced ```json ... ``` block from text, if present. */
export function extractFencedJson(text: string): string | null {
  const match = text.match(/```json\s*([\s\S]*?)```/i);
  return match ? match[1].trim() : null;
}

/**
 * Extracts the first balanced top-level {...} object from text by brace
 * counting (handles nested braces/strings well enough for this use case).
 */
export function extractBalancedJson(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === '\\') {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return null;
}

function extractJsonCandidates(text: string): string[] {
  const candidates: string[] = [];
  const fenced = extractFencedJson(text);
  if (fenced) candidates.push(fenced);
  const balanced = extractBalancedJson(text);
  if (balanced) candidates.push(balanced);
  return candidates;
}

/**
 * Parses `text` for a JSON payload matching `validate` (a function
 * `(parsed) => { ok, value | error }`, e.g. validateReviewResult or
 * validateMetadataResult). Returns { ok: true, value } or { ok: false, error }.
 */
export function parseStructuredJson(text: string, validate: Validate): ValidateResult {
  if (!text || typeof text !== 'string') {
    return { ok: false, error: 'Claude returned no output' };
  }

  const candidates = extractJsonCandidates(text);
  if (candidates.length === 0) {
    return { ok: false, error: 'No JSON object found in Claude output' };
  }

  let lastError = 'Could not parse JSON from Claude output';
  for (const candidate of candidates) {
    let parsed: any;
    try {
      parsed = JSON.parse(candidate);
    } catch (err: any) {
      lastError = `Invalid JSON: ${err.message}`;
      continue;
    }
    const result = validate(parsed);
    if (result.ok) return result;
    lastError = result.error;
  }

  return { ok: false, error: lastError };
}

export default parseStructuredJson;
