// SPDX-License-Identifier: MIT
// Pure error classification helpers (no vscode dependency, testable).
//
// Used by error-utils for surfacing and by tests directly.

import { AdoNetworkError, AdoRestError } from './ado-errors';
import type { ErrorPayload } from './types';

export const ERROR_CODES = {
  ADO_REST: 'E_ADO_REST',
  ADO_NETWORK: 'E_ADO_NETWORK',
  ADO_UNAUTHORIZED: 'E_ADO_AUTH',
  ADO_FORBIDDEN: 'E_ADO_PERM',
  ADO_NOT_FOUND: 'E_ADO_NOT_FOUND',
  AUTH: 'E_AUTH',
  PR_PARSE: 'E_PR_PARSE',
  UNEXPECTED: 'E_UNEXPECTED',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export interface ClassifiedError {
  code: ErrorCode;
  message: string;
  recoverable: boolean;
}

export function classifyError(err: unknown): ClassifiedError {
  if (err instanceof AdoRestError) {
    if (err.status === 401) {
      return {
        code: ERROR_CODES.ADO_UNAUTHORIZED,
        message:
          'Azure DevOps rejected your credentials. Sign in again and retry.',
        recoverable: true,
      };
    }
    if (err.status === 403) {
      return {
        code: ERROR_CODES.ADO_FORBIDDEN,
        message: 'Your account does not have permission to access this PR.',
        recoverable: false,
      };
    }
    if (err.status === 404) {
      return {
        code: ERROR_CODES.ADO_NOT_FOUND,
        message: 'Azure DevOps returned 404. Check the PR URL and your access.',
        recoverable: false,
      };
    }
    return {
      code: ERROR_CODES.ADO_REST,
      message: `Azure DevOps returned HTTP ${err.status}: ${err.message}`,
      recoverable: err.status >= 500,
    };
  }
  if (err instanceof AdoNetworkError) {
    return {
      code: ERROR_CODES.ADO_NETWORK,
      message: 'Cannot reach Azure DevOps. Check your network and try again.',
      recoverable: true,
    };
  }
  if (err instanceof Error && err.name === 'AuthAcquisitionError') {
    return {
      code: ERROR_CODES.AUTH,
      message: `Sign-in failed: ${err.message}`,
      recoverable: true,
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  return {
    code: ERROR_CODES.UNEXPECTED,
    message,
    recoverable: false,
  };
}

export function toErrorPayload(err: unknown): ErrorPayload {
  const cls = classifyError(err);
  return {
    code: cls.code,
    message: cls.message,
    recoverable: cls.recoverable,
  };
}
