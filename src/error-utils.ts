// SPDX-License-Identifier: MIT
// VS Code-side error surfacing (REQ-ERR-001, REQ-ERR-003).
//
// Every user-facing error has a stable error code so users can grep the
// Output channel. Surfacing always offers the "Open Output" action so the
// reviewer can dig into the diagnostic log without hunting for the right
// channel.
//
// Pure classification logic lives in error-classification.ts (no vscode
// dependency) so it can be unit-tested in plain mocha.

import * as vscode from 'vscode';
import { getLogger } from './logger';
import {
  classifyError,
  ERROR_CODES,
  toErrorPayload,
  type ClassifiedError,
  type ErrorCode,
} from './error-classification';

export { classifyError, toErrorPayload, ERROR_CODES };
export type { ClassifiedError, ErrorCode };

const log = getLogger('ErrorUtils');
const OUTPUT_ACTION = 'Open Output';

export async function surfaceError(
  err: unknown,
  context: string,
): Promise<ClassifiedError> {
  const cls = classifyError(err);
  log.error(`${context} failed [${cls.code}]: ${cls.message}`, {
    error: err instanceof Error ? (err.stack ?? err.message) : String(err),
  });
  const choice = await vscode.window.showErrorMessage(
    `${context} (${cls.code}): ${cls.message}`,
    OUTPUT_ACTION,
  );
  if (choice === OUTPUT_ACTION) {
    log.channel.show(true);
  }
  return cls;
}
