// SPDX-License-Identifier: MIT
// CustomReadonlyEditorProvider for mdpr:// URIs.
//
// Per design.md §4.1.2:
//   - VS Code calls openCustomDocument when the user opens an mdpr:// URI.
//   - We register the URI with the SessionManager and resolve the editor by
//     building a WebviewPanel hosting the rendered-view bundle.
//   - The provider hands off message routing to SessionManager.

import * as vscode from 'vscode';
import { getLogger } from '../logger';
import type { SessionManager } from '../session-manager';

interface AdoMdDocument extends vscode.CustomDocument {
 readonly uri: vscode.Uri;
 dispose(): void;
}

export class RenderedViewEditorProvider implements vscode.CustomReadonlyEditorProvider<AdoMdDocument> {
 public static readonly viewType = 'markdownPrReview.renderedView';

 private readonly log = getLogger('CustomEditorProvider');

 constructor(
  private readonly context: vscode.ExtensionContext,
  private readonly sessionManager: SessionManager
 ) {}

 openCustomDocument(uri: vscode.Uri): AdoMdDocument {
  this.log.info('openCustomDocument', { uri: uri.toString() });
  return {
   uri,
   dispose: () => {}
  };
 }

 async resolveCustomEditor(
  document: AdoMdDocument,
  webviewPanel: vscode.WebviewPanel,
  _token: vscode.CancellationToken
 ): Promise<void> {
  this.log.info('resolveCustomEditor', { uri: document.uri.toString() });

  const distRoot = vscode.Uri.joinPath(this.context.extensionUri, 'out');
  webviewPanel.webview.options = {
   enableScripts: true,
   localResourceRoots: [distRoot]
  };

  await this.sessionManager.attachRenderedView(document.uri, webviewPanel);
 }
}
