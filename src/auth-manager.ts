// SPDX-License-Identifier: MIT
// Auth Manager per design.md §3.2.
//
// Obtains and silently refreshes an ADO-scoped access token via
// `vscode.authentication.getSession('microsoft', ...)`. Emits
// `onTokenInvalid` so the ADO Client can react to 401s; the actual
// silent-retry path is wired in v0.4.
//
// Scope is the ADO resource GUID's `.default` scope per ASM-006.
// If the Microsoft auth provider rejects that scope at runtime we
// fall back to PAT-via-SecretStorage. The fallback path is implemented
// here, not deferred — RISK-003 demanded a real escape hatch.

import * as vscode from 'vscode';
import { getLogger, type Logger } from './logger';

// ADO resource ID per ASM-006.
const ADO_RESOURCE_ID = '499b84ac-1321-427f-aa17-267ca6975798';
const ADO_DEFAULT_SCOPE = `${ADO_RESOURCE_ID}/.default`;

// Secret storage key for PAT fallback (RISK-003 mitigation).
const PAT_SECRET_KEY = 'markdownPrReview.pat';

export interface AuthManager {
 getToken(options?: { silent?: boolean }): Promise<string>;
 /** Fired when an ADO REST call sees a 401; wired up in v0.4. */
 readonly onTokenInvalid: vscode.Event<void>;
 /** Manually trigger PAT entry (used by an explicit command in v0.4). */
 promptForPat(): Promise<void>;
 dispose(): void;
}

type AuthMode = 'msal' | 'pat';

export class VsCodeAuthManager implements AuthManager {
 private readonly log: Logger;
 private readonly emitter = new vscode.EventEmitter<void>();
 private mode: AuthMode = 'msal';

 readonly onTokenInvalid = this.emitter.event;

 constructor(private readonly context: vscode.ExtensionContext, log?: Logger) {
  this.log = log ?? getLogger('AuthManager');
 }

 async getToken(options: { silent?: boolean } = {}): Promise<string> {
  const silent = options.silent !== false;
  // If a PAT has been stored, prefer it (RISK-003 fallback once
  // chosen, sticky for the session — avoids re-prompting users
  // who already opted into PAT mode).
  const storedPat = await this.context.secrets.get(PAT_SECRET_KEY);
  if (storedPat) {
   this.mode = 'pat';
   return storedPat;
  }
  try {
   const session = await vscode.authentication.getSession(
    'microsoft',
    [ADO_DEFAULT_SCOPE],
    silent ? { silent: true } : { createIfNone: true }
   );
   if (session) {
    this.mode = 'msal';
    return session.accessToken;
   }
   if (silent) {
    // Silent acquire failed — caller should retry with silent=false
    throw new AuthAcquisitionError('silent', 'No cached session; silent auth not allowed to prompt.');
   }
   throw new AuthAcquisitionError('no-session', 'getSession returned undefined despite createIfNone.');
  } catch (err) {
   const friendly = err instanceof Error ? err.message : String(err);
   this.log.warn('Microsoft auth getSession failed; offering PAT fallback.', { error: friendly });
   if (silent) {
    throw err;
   }
   // Non-silent failure: offer PAT fallback per RISK-003.
   const choice = await vscode.window.showWarningMessage(
    `Azure DevOps sign-in via the Microsoft account provider failed: ${friendly}. Use a Personal Access Token instead?`,
    'Enter PAT',
    'Cancel'
   );
   if (choice === 'Enter PAT') {
    await this.promptForPat();
    const pat = await this.context.secrets.get(PAT_SECRET_KEY);
    if (pat) {
     this.mode = 'pat';
     return pat;
    }
   }
   throw err;
  }
 }

 async promptForPat(): Promise<void> {
  const pat = await vscode.window.showInputBox({
   prompt: 'Enter an Azure DevOps Personal Access Token (vso.code + vso.code_write scopes)',
   password: true,
   ignoreFocusOut: true,
   placeHolder: 'PAT value (not stored to disk — uses VS Code Secret Storage)'
  });
  if (!pat) {
   this.log.info('PAT prompt cancelled.');
   return;
  }
  await this.context.secrets.store(PAT_SECRET_KEY, pat.trim());
  this.log.info('PAT stored in secret storage.');
 }

 /**
  * Called by the ADO Client when a 401 indicates the cached token has
  * expired. Clears any stored PAT (only if it's the source of failure)
  * and emits onTokenInvalid so future callers can decide whether to
  * re-prompt.
  */
 invalidateToken(): void {
  this.emitter.fire();
 }

 /** Indicates which token source is currently active. Useful for diagnostics. */
 get currentMode(): AuthMode {
  return this.mode;
 }

 dispose(): void {
  this.emitter.dispose();
 }

 /**
  * Build the Authorization header value for the current mode.
  * MSAL → "Bearer {token}". PAT → "Basic {base64(:{token})}".
  */
 static buildAuthHeader(token: string, mode: AuthMode): string {
  if (mode === 'pat') {
   const encoded = Buffer.from(`:${token}`, 'utf8').toString('base64');
   return `Basic ${encoded}`;
  }
  return `Bearer ${token}`;
 }
}

export class AuthAcquisitionError extends Error {
 constructor(public readonly kind: 'silent' | 'no-session', message: string) {
  super(message);
  this.name = 'AuthAcquisitionError';
 }
}
