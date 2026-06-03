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
        return /* html */ `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <title>Comment Input</title>
    <style>
        body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); margin: 0; padding: 8px; }
        #root { display: block; }
        .empty { opacity: 0.7; font-size: 0.9em; }
        .draft header { font-size: 0.85em; margin-bottom: 4px; }
        .lines { margin-left: 4px; opacity: 0.7; }
        textarea {
            width: 100%;
            box-sizing: border-box;
            font-family: var(--vscode-editor-font-family);
            font-size: var(--vscode-editor-font-size);
            color: var(--vscode-input-foreground);
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border, transparent);
            padding: 4px 6px;
            resize: vertical;
        }
        textarea:focus {
            outline: 1px solid var(--vscode-focusBorder);
            outline-offset: -1px;
            border-color: var(--vscode-focusBorder);
        }
        textarea::placeholder { color: var(--vscode-input-placeholderForeground); }
        footer { margin-top: 6px; display: flex; gap: 6px; }
        button {
            font-family: inherit;
            font-size: inherit;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: 1px solid var(--vscode-button-border, transparent);
            padding: 4px 10px;
            cursor: pointer;
        }
        button:hover { background: var(--vscode-button-hoverBackground); }
        button:focus { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }
        button.secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
        .error { background: var(--vscode-inputValidation-errorBackground); color: var(--vscode-inputValidation-errorForeground); padding: 4px 6px; margin-bottom: 6px; }
    </style>
</head>
<body>
    <div id="root"></div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }
}
