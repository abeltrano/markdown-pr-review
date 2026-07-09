// SPDX-License-Identifier: MIT
// Pure (no vscode dependency) redaction helpers.
// Extracted from logger.ts so unit tests can exercise them without a
// vscode runtime stub (TC-145).

// Matches a JWT or similarly structured access token: three dot-separated
// base64url segments, the first beginning with "eyJ" (the base64url prefix
// of `{"`).
//
// Defends against the polynomial-time backtracking pattern (CodeQL
// js/polynomial-redos) on inputs containing many "eyJ" prefixes by
// combining two techniques:
//
//   1. Bounded quantifier {1,8192}. JWT segments are base64url-encoded;
//      realistic tokens fit well under 8 KiB per segment. The bound
//      converts the worst-case per-position work from O(remaining input)
//      into a constant, giving overall O(N) scanning.
//   2. Lookahead-then-backreference `(?=(X+))\1`, functionally equivalent
//      to `X+` but treated atomically -- the captured run cannot be
//      given back during backtracking. Since `.` is excluded from the
//      character class the match would never re-distribute characters
//      across segments anyway, so this preserves the original semantics.
export const JWT_LIKE_REGEX =
  /eyJ(?=([A-Za-z0-9_-]{1,8192}))\1\.(?=([A-Za-z0-9_-]{1,8192}))\2\.(?=([A-Za-z0-9_-]{1,8192}))\3/g;

// Header names recognized as auth carriers.
export const AUTH_HEADER_NAMES = new Set<string>([
  'authorization',
  'x-tfs-fedauthredirect',
  'cookie',
  'set-cookie',
]);

// Sentinel inserted for redacted values.
export const REDACTED = '[REDACTED]';

/**
 * Recursively walks an arbitrary JSON-shaped value and returns a copy with
 * any auth-header values or JWT-shaped strings replaced by `[REDACTED]`.
 * Pure function — does not mutate the input.
 *
 * Exported for unit testing (TC-145).
 */
export function redactAuthHeaders(input: unknown): unknown {
  if (typeof input === 'string') {
    return redactJwtsAndUrlTokens(input);
  }
  if (Array.isArray(input)) {
    return input.map(redactAuthHeaders);
  }
  if (input && typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(
      input as Record<string, unknown>,
    )) {
      if (AUTH_HEADER_NAMES.has(key.toLowerCase())) {
        out[key] = REDACTED;
      } else if (typeof value === 'string') {
        out[key] = redactJwtsAndUrlTokens(value);
      } else {
        out[key] = redactAuthHeaders(value);
      }
    }
    return out;
  }
  return input;
}

/**
 * Redacts JWT-shaped substrings and `access_token` / `code` URL query
 * parameter values from a string.
 */
export function redactJwtsAndUrlTokens(s: string): string {
  let out = s.replace(JWT_LIKE_REGEX, REDACTED);
  // Sensitive query-string values. Match both raw and percent-encoded "=".
  out = out.replace(
    /\b(access_token|code|id_token|refresh_token|client_secret|api-key|api_key)=([^&\s"'>]+)/gi,
    (_match, name) => `${name}=${REDACTED}`,
  );
  return out;
}
