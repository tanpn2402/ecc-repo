import { parseStructuredJson } from './json-extract';
import { validateMetadataResult } from './metadata-schema';

/**
 * Parses Claude's final result text for an "auto update details" run,
 * looking for a JSON payload matching the metadata-only schema.
 * Returns { ok: true, value } or { ok: false, error }.
 */
export function parseMetadataResult(text: string) {
  return parseStructuredJson(text, validateMetadataResult);
}

export default parseMetadataResult;
