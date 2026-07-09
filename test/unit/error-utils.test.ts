// SPDX-License-Identifier: MIT
// Error classification tests (TC-130..133 / REQ-ERR-001).
//
// surfaceError is not tested because it requires a vscode runtime
// (vscode.window.showErrorMessage). classifyError + toErrorPayload are
// pure and fully unit-testable.

import { expect } from 'chai';

// We need to avoid pulling vscode into the test runtime. error-utils
// imports vscode at the top level, so we proxy classifyError through
// a fresh module instance with a vscode shim. tsx happily resolves the
// `vscode` import even without a real VS Code runtime, but
// vscode.window.* methods throw. Since we don't call surfaceError, only
// classifyError + toErrorPayload, this is fine.
import {
  classifyError,
  toErrorPayload,
  ERROR_CODES,
} from '../../src/error-classification';
import { AdoNetworkError, AdoRestError } from '../../src/ado-errors';

describe('classifyError', () => {
  it('TC-130 — maps 401 to E_ADO_AUTH (recoverable)', () => {
    const err = new AdoRestError(401, 'https://x', '', 'Unauthorized');
    const cls = classifyError(err);
    expect(cls.code).to.equal(ERROR_CODES.ADO_UNAUTHORIZED);
    expect(cls.recoverable).to.equal(true);
  });

  it('maps 403 to E_ADO_PERM (not recoverable)', () => {
    const err = new AdoRestError(403, 'https://x', '', 'Forbidden');
    const cls = classifyError(err);
    expect(cls.code).to.equal(ERROR_CODES.ADO_FORBIDDEN);
    expect(cls.recoverable).to.equal(false);
  });

  it('TC-131 — maps 404 to E_ADO_NOT_FOUND', () => {
    const err = new AdoRestError(404, 'https://x', '', 'Not found');
    const cls = classifyError(err);
    expect(cls.code).to.equal(ERROR_CODES.ADO_NOT_FOUND);
  });

  it('TC-132 — maps 500-class to E_ADO_REST (recoverable)', () => {
    const err = new AdoRestError(503, 'https://x', '', 'Service Unavailable');
    const cls = classifyError(err);
    expect(cls.code).to.equal(ERROR_CODES.ADO_REST);
    expect(cls.recoverable).to.equal(true);
  });

  it('TC-133 — maps network errors to E_ADO_NETWORK (recoverable)', () => {
    const err = new AdoNetworkError('https://x', new Error('ECONNREFUSED'));
    const cls = classifyError(err);
    expect(cls.code).to.equal(ERROR_CODES.ADO_NETWORK);
    expect(cls.recoverable).to.equal(true);
  });

  it('falls back to E_UNEXPECTED for unknown errors', () => {
    const cls = classifyError(new Error('something broke'));
    expect(cls.code).to.equal(ERROR_CODES.UNEXPECTED);
    expect(cls.message).to.equal('something broke');
  });

  it('handles non-Error throwables', () => {
    const cls = classifyError('a string was thrown');
    expect(cls.code).to.equal(ERROR_CODES.UNEXPECTED);
    expect(cls.message).to.equal('a string was thrown');
  });
});

describe('toErrorPayload', () => {
  it('produces a serializable payload with code/message/recoverable', () => {
    const payload = toErrorPayload(
      new AdoRestError(401, 'https://x', '', 'Unauthorized'),
    );
    expect(payload).to.have.property('code', ERROR_CODES.ADO_UNAUTHORIZED);
    expect(payload).to.have.property('message');
    expect(payload).to.have.property('recoverable', true);
    // Verify it's JSON-serializable for postMessage.
    expect(() => JSON.stringify(payload)).to.not.throw();
  });
});
