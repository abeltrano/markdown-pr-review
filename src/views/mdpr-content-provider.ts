// SPDX-License-Identifier: MIT
// TextDocumentContentProvider for the mdpr:// URI scheme.
//
// VS Code's built-in commands (e.g. "Markdown: Toggle Preview") attempt to
// resolve the active editor's URI as a text document model. Without a
// registered provider for mdpr://, that resolution fails with "Unable to
// resolve resource …", crashing the host. This provider satisfies the model
// request by returning cached raw markdown from the active Session so VS Code
// can produce a document handle — the built-in preview then renders the raw
// source, which is a reasonable fallback.
//
// If no session is active or the content has not been cached yet (unlikely
// at the point the user can invoke Toggle Preview), the provider returns an
// empty string so VS Code can still produce a valid, empty document instead
// of throwing.

import type * as vscode from 'vscode';
import { parseMdprUri } from '../mdpr-uri';
import { getLogger } from '../logger';
import type { SessionManager } from '../session-manager';

export class MdprContentProvider implements vscode.TextDocumentContentProvider {
  private readonly log = getLogger('MdprContentProvider');

  constructor(private readonly sessionManager: SessionManager) {}

  provideTextDocumentContent(uri: vscode.Uri): string {
    const session = this.sessionManager.getSessionForUri(uri.toString());
    if (!session) {
      this.log.warn('provideTextDocumentContent: no session for uri', {
        uri: uri.toString(),
      });
      return '';
    }
    try {
      const { filePath } = parseMdprUri(uri);
      return session.fileContentCache.get(filePath) ?? '';
    } catch (err) {
      this.log.warn('provideTextDocumentContent: failed to parse URI', {
        uri: uri.toString(),
        error: err instanceof Error ? err.message : String(err),
      });
      return '';
    }
  }
}
