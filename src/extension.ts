// SPDX-License-Identifier: MIT
// Extension entry point. Wires together:
//   - VsCodeAuthManager
//   - SessionManager
//   - CommentInputViewProvider (sidebar)
//   - RenderedViewEditorProvider (custom editor for adopr://)
//   - FileTreeProvider (sidebar tree of changed files)
//   - Command registry (5 commands)

import * as vscode from 'vscode';
import { getLogger } from './logger';
import { VsCodeAuthManager } from './auth-manager';
import { SessionManager } from './session-manager';
import { CommentInputViewProvider } from './comment-input-view-provider';
import { RenderedViewEditorProvider } from './views/custom-editor-provider';
import { FileTreeProvider } from './views/file-tree-provider';
import { registerCommands } from './command-registry';
import { StatusBarController } from './status-bar';
import { StalePRWatcher } from './stale-pr-watcher';
import { parseAdoprUri } from './adopr-uri';

export function activate(context: vscode.ExtensionContext): void {
    const log = getLogger('Extension');
    const version =
        (context.extension?.packageJSON?.version as string | undefined) ?? 'unknown';
    log.info(`Activating ADO Markdown PR Reviewer v${version}.`);

    const auth = new VsCodeAuthManager(context);
    const sessionManager = new SessionManager(context, auth);
    const inputView = new CommentInputViewProvider(context, sessionManager);
    sessionManager.setInputView(inputView);

    const statusBar = new StatusBarController();
    const staleWatcher = new StalePRWatcher(sessionManager.getAdoClient());

    // Custom editor for adopr:// URIs.
    context.subscriptions.push(
        vscode.window.registerCustomEditorProvider(
            RenderedViewEditorProvider.viewType,
            new RenderedViewEditorProvider(context, sessionManager),
            { supportsMultipleEditorsPerDocument: false, webviewOptions: { retainContextWhenHidden: true } }
        )
    );

    // Comment input sidebar.
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(CommentInputViewProvider.viewId, inputView)
    );

    // Changed-files tree.
    const treeProvider = new FileTreeProvider(sessionManager);
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('adoMdReview.fileTree', treeProvider)
    );

    // Commands.
    registerCommands(context, sessionManager, inputView);

    // Status bar + stale watcher wired to session events.
    const refreshStatusBar = (): void => {
        const session = sessionManager.getActiveSession();
        if (!session) {
            statusBar.hide();
            return;
        }
        const activeEditor = vscode.window.activeTextEditor;
        let fileName: string | null = null;
        if (activeEditor && activeEditor.document.uri.scheme === 'adopr') {
            try {
                fileName = parseAdoprUri(activeEditor.document.uri.toString()).filePath.split('/').pop() ?? null;
            } catch {
                fileName = null;
            }
        }
        statusBar.update(session, fileName);
    };

    context.subscriptions.push(
        sessionManager.onSessionChanged((session) => {
            if (session) {
                staleWatcher.start(session);
            } else {
                staleWatcher.stop();
            }
            refreshStatusBar();
        }),
        sessionManager.onThreadsChanged(refreshStatusBar),
        vscode.window.onDidChangeActiveTextEditor(refreshStatusBar),
        statusBar,
        staleWatcher
    );

    context.subscriptions.push({ dispose: () => sessionManager.dispose() });

    log.info('Activation complete.');
}

export function deactivate(): void {
    // Cleanup handled by context.subscriptions disposers.
}
