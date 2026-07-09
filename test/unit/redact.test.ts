// SPDX-License-Identifier: MIT
// Unit tests for the redactAuthHeaders helper (TC-145).
// Targets the pure src/redact.ts module (no vscode dependency).

import { expect } from 'chai';
import {
  JWT_LIKE_REGEX,
  REDACTED,
  redactAuthHeaders,
  redactJwtsAndUrlTokens,
} from '../../src/redact';

const SAMPLE_JWT =
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIiwibmFtZSI6IkpvaG4ifQ.SflKxwRJSMeKKF2QT4f';

describe('TC-145 — log redaction', () => {
  afterEach(() => {
    // JWT_LIKE_REGEX is global; reset its lastIndex so independent
    // .test() callers don't leak state across cases.
    JWT_LIKE_REGEX.lastIndex = 0;
  });

  describe('redactJwtsAndUrlTokens', () => {
    it('replaces JWT-shaped tokens', () => {
      const out = redactJwtsAndUrlTokens(`Bearer ${SAMPLE_JWT}`);
      expect(out).to.equal(`Bearer ${REDACTED}`);
      expect(out).to.not.contain('eyJ');
    });

    it('replaces multiple JWTs in a single string', () => {
      const out = redactJwtsAndUrlTokens(`${SAMPLE_JWT} and ${SAMPLE_JWT}`);
      expect(out).to.equal(`${REDACTED} and ${REDACTED}`);
    });

    it('replaces access_token URL parameters', () => {
      const out = redactJwtsAndUrlTokens(
        'https://login/?access_token=abc123def&foo=bar',
      );
      expect(out).to.equal(`https://login/?access_token=${REDACTED}&foo=bar`);
    });

    it('replaces multiple sensitive query parameters', () => {
      const out = redactJwtsAndUrlTokens(
        'https://x/?code=abc&id_token=ZYX&refresh_token=foo&keep=public',
      );
      expect(out).to.contain('keep=public');
      expect(out).to.not.contain('abc');
      expect(out).to.not.contain('ZYX');
      expect(out).to.not.contain('foo');
    });

    it('is a no-op on payloads with no sensitive content', () => {
      const out = redactJwtsAndUrlTokens('just a plain message');
      expect(out).to.equal('just a plain message');
    });

    it('completes in bounded time on pathological "eyJ"-repeated input (ReDoS regression)', function () {
      // Guards against CodeQL js/polynomial-redos regression on JWT_LIKE_REGEX.
      // The original `[A-Za-z0-9_-]+` quantifier exhibited polynomial-time
      // backtracking on inputs like "eyJeyJeyJ..." (~90s for 160K repetitions).
      // The bounded-atomic rewrite makes scanning linear in input length, but
      // with a large per-position constant (the {1,8192} lookahead re-match at
      // every "eyJ"), so the legitimate run of this 150K-char input takes on the
      // order of ~1.5s on CI hardware. The budget therefore must sit comfortably
      // ABOVE that real runtime (so ordinary scheduling jitter can't trip it)
      // while staying far below a catastrophic-backtracking regression, which is
      // ~90s here — two orders of magnitude away. 6s gives ~4x headroom over the
      // linear runtime and ~15x margin below a regression; the local timeout is
      // set above the budget so the elapsed assertion (not a mocha timeout)
      // reports a genuine regression.
      this.timeout(8000);
      const input = 'eyJ'.repeat(50_000);
      const start = Date.now();
      const out = redactJwtsAndUrlTokens(input);
      const elapsed = Date.now() - start;
      expect(out).to.equal(input);
      expect(elapsed).to.be.lessThan(6000);
    });
  });

  describe('redactAuthHeaders', () => {
    it('redacts Authorization header values regardless of case', () => {
      const out = redactAuthHeaders({
        Authorization: `Bearer ${SAMPLE_JWT}`,
        'X-Other': 'safe',
      }) as Record<string, unknown>;
      expect(out.Authorization).to.equal(REDACTED);
      expect(out['X-Other']).to.equal('safe');
    });

    it('redacts Cookie / Set-Cookie / X-Tfs-FedAuthRedirect headers', () => {
      const out = redactAuthHeaders({
        Cookie: 'sessionid=xyz',
        'Set-Cookie': 'auth=zzz',
        'X-Tfs-FedAuthRedirect': 'https://login?...',
        normal: 'visible',
      }) as Record<string, unknown>;
      expect(out.Cookie).to.equal(REDACTED);
      expect(out['Set-Cookie']).to.equal(REDACTED);
      expect(out['X-Tfs-FedAuthRedirect']).to.equal(REDACTED);
      expect(out.normal).to.equal('visible');
    });

    it('recursively redacts nested JWTs inside values', () => {
      const out = redactAuthHeaders({
        body: { token: SAMPLE_JWT, list: [SAMPLE_JWT, 'safe'] },
      }) as { body: { token: string; list: string[] } };
      expect(out.body.token).to.equal(REDACTED);
      expect(out.body.list[0]).to.equal(REDACTED);
      expect(out.body.list[1]).to.equal('safe');
    });

    it('handles arrays at the root', () => {
      const out = redactAuthHeaders([SAMPLE_JWT, 'safe']) as unknown[];
      expect(out).to.deep.equal([REDACTED, 'safe']);
    });

    it('passes through primitives unchanged', () => {
      expect(redactAuthHeaders(42)).to.equal(42);
      expect(redactAuthHeaders(true)).to.equal(true);
      expect(redactAuthHeaders(null)).to.equal(null);
      expect(redactAuthHeaders(undefined)).to.equal(undefined);
    });

    it('does not mutate its input', () => {
      const input = {
        Authorization: `Bearer ${SAMPLE_JWT}`,
        nested: { k: SAMPLE_JWT },
      };
      const copy = JSON.parse(JSON.stringify(input));
      redactAuthHeaders(input);
      expect(input).to.deep.equal(copy);
    });
  });
});
