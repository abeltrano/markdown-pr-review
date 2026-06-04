// SPDX-License-Identifier: MIT
// Host-side view provider for the Comment Input sidebar webview.
// Per design.md §4.1.2 & §4.1.3 (views contribution `markdownPrReview.commentInput`).
//
// Receives postMessage events from the webview and forwards them to the
// CommentController via the SessionManager.

import * as vscode from 'vscode';
import { getLogger } from './logger';
import { buildCommentInputCsp, generateNonce } from './views/csp';
import type {
 HostToInputView,
 InputViewToHost,
 SelectionPostedPayload
} from './types';
import type { SessionManager } from './session-manager';

export class CommentInputViewProvider implements vscode.WebviewViewProvider {
 public static readonly viewId = 'markdownPrReview.commentInput';

 private readonly log = getLogger('CommentInputView');
 private view: vscode.WebviewView | null = null;
 private pendingSelection: SelectionPostedPayload | null = null;

 constructor(
  private readonly context: vscode.ExtensionContext,
  private readonly sessionManager: SessionManager
 ) {}

 resolveWebviewView(
  webviewView: vscode.WebviewView,
  _ctx: vscode.WebviewViewResolveContext,
  _token: vscode.CancellationToken
 ): void | Thenable<void> {
  this.view = webviewView;
  const distRoot = vscode.Uri.joinPath(this.context.extensionUri, 'out');
  webviewView.webview.options = {
   enableScripts: true,
   localResourceRoots: [distRoot]
  };
  webviewView.webview.html = this.buildHtml(webviewView.webview);
  webviewView.webview.onDidReceiveMessage((msg: InputViewToHost) => {
   this.handleMessage(msg);
  });
  webviewView.onDidDispose(() => {
   this.view = null;
  });
 }

 showSelection(payload: SelectionPostedPayload): void {
  if (!this.view) {
   this.pendingSelection = payload;
   void vscode.commands.executeCommand('markdownPrReview.commentInput.focus');
   return;
  }
  this.post({ type: 'selectionPosted', payload });
 }

 clearDraft(): void {
  this.pendingSelection = null;
  this.post({ type: 'draftCleared' });
 }

 showError(code: string, message: string, recoverable = true): void {
  this.post({ type: 'error', payload: { code, message, recoverable } });
 }

 private post(msg: HostToInputView): void {
  if (this.view) {
   void this.view.webview.postMessage(msg);
  }
 }

 private handleMessage(msg: InputViewToHost): void {
  switch (msg.type) {
   case 'ready':
    if (this.pendingSelection) {
     this.post({ type: 'selectionPosted', payload: this.pendingSelection });
     this.pendingSelection = null;
    }
    break;
   case 'requestPostThread':
    void this.sessionManager.handlePostThread(msg.payload);
    break;
   case 'cancelDraft':
    void this.sessionManager.handleCancelDraft();
    break;
   case 'log':
    this.log[msg.payload.level](msg.payload.message, msg.payload.context);
    break;
  }
 }

 private buildHtml(webview: vscode.Webview): string {
  const nonce = generateNonce();
  const csp = buildCommentInputCsp({ nonce, webview });
  const scriptUri = webview.asWebviewUri(
   vscode.Uri.joinPath(this.context.extensionUri, 'out', 'views', 'comment-input', 'main.js')
  );
  const styleUri = webview.asWebviewUri(
   vscode.Uri.joinPath(this.context.extensionUri, 'out', 'views', 'comment-input', 'styles.css')
  );
  return /* html */ `<!doctype html>
<html lang="en">
<head>
 <meta charset="utf-8">
 <meta http-equiv="Content-Security-Policy" content="${csp}">
 <title>Comment Input</title>
 <link rel="stylesheet" href="${styleUri}">
</head>
<body>
 <div id="root"></div>
 <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
 }
}
