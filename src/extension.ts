// SPDX-License-Identifier: MIT
// Extension entry point. Wires together:
//   - VsCodeAuthManager
//   - SessionManager
//   - CommentInputViewProvider (sidebar)
//   - RenderedViewEditorProvider (custom editor for mdpr://)
//   - MdprContentProvider (TextDocumentContentProvider for mdpr://)
//   - FileTreeProvider (sidebar tree of changed files)
//   - Command registry (5 commands)

import * as vscode from 'vscode';
import { getLogger } from './logger';
import { VsCodeAuthManager } from './auth-manager';
import { SessionManager } from './session-manager';
import { CommentInputViewProvider } from './comment-input-view-provider';
import { RenderedViewEditorProvider } from './views/custom-editor-provider';
import { MdprContentProvider } from './views/mdpr-content-provider';
import { FileTreeProvider } from './views/file-tree-provider';
import { RecentPullRequestTreeProvider } from './views/recent-pr-tree-provider';
import { CommentThreadDecorationProvider } from './views/file-decoration-provider';
import { registerCommands } from './command-registry';
import { StatusBarController } from './status-bar';
import { StalePRWatcher } from './stale-pr-watcher';
import { MDPR_SCHEME, parseMdprUri } from './mdpr-uri';
import type { PullRequestRef } from './types';

interface ClosePullRequestTreeNode {
 session?: { pr: { ref: PullRequestRef } };
}

export function activate(context: vscode.ExtensionContext): void {
 const log = getLogger('Extension');
 const version =
  (context.extension?.packageJSON?.version as string | undefined) ?? 'unknown';
 log.info(`Activating Markdown PR Review v${version}.`);

 const auth = new VsCodeAuthManager(context);
 const sessionManager = new SessionManager(context, auth);
 const inputView = new CommentInputViewProvider(context, sessionManager);
 sessionManager.setInputView(inputView);

 const statusBar = new StatusBarController();
 const staleWatcher = new StalePRWatcher(sessionManager.getAdoClient());

 // Custom editor for mdpr:// URIs.
 context.subscriptions.push(
  vscode.window.registerCustomEditorProvider(
   RenderedViewEditorProvider.viewType,
   new RenderedViewEditorProvider(context, sessionManager),
   { supportsMultipleEditorsPerDocument: false, webviewOptions: { retainContextWhenHidden: true } }
  )
 );

 // TextDocumentContentProvider for mdpr:// so VS Code can resolve mdpr://
 // URIs as text documents. Without this, built-in commands that open the
 // active editor URI (e.g. "Markdown: Toggle Preview") crash with
 // "Unable to resolve resource mdpr://…" (see issue #54).
 context.subscriptions.push(
  vscode.workspace.registerTextDocumentContentProvider(
   MDPR_SCHEME,
   new MdprContentProvider(sessionManager)
  )
 );

 // Comment input sidebar.
 context.subscriptions.push(
  vscode.window.registerWebviewViewProvider(CommentInputViewProvider.viewId, inputView)
 );

 // Changed-files tree + trailing comment-count decoration.
 const decorationProvider = new CommentThreadDecorationProvider();
 context.subscriptions.push(
  decorationProvider,
  vscode.window.registerFileDecorationProvider(decorationProvider)
 );
 const treeProvider = new FileTreeProvider(context, sessionManager, decorationProvider);
 context.subscriptions.push(
  treeProvider,
  vscode.window.registerTreeDataProvider('markdownPrReview.fileTree', treeProvider)
 );
 const recentPrProvider = new RecentPullRequestTreeProvider(context, sessionManager);
 context.subscriptions.push(
  vscode.window.registerTreeDataProvider('markdownPrReview.recentPullRequests', recentPrProvider)
 );

 // Commands.
 registerCommands(context, sessionManager, inputView);
 context.subscriptions.push(
  vscode.commands.registerCommand('markdownPrReview.showMarkdownOnly', () =>
   treeProvider.setMarkdownOnly(true)
  ),
  vscode.commands.registerCommand('markdownPrReview.showAllFiles', () =>
   treeProvider.setMarkdownOnly(false)
  ),
  vscode.commands.registerCommand(
   'markdownPrReview.closePullRequest',
   async (node?: ClosePullRequestTreeNode) => {
    if (node?.session) {
     await sessionManager.closePullRequestByRef(node.session.pr.ref);
    }
   }
  ),
  vscode.commands.registerCommand(
   'markdownPrReview.closeAllPullRequests',
   () => sessionManager.disposeAll()
  )
 );

 // Status bar + stale watcher wired to session + editor-focus events.
 const activeRenderedViewUri = (): string | null => {
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
  if (
   input instanceof vscode.TabInputCustom &&
   input.viewType === RenderedViewEditorProvider.viewType
  ) {
   return input.uri.toString();
  }
  return null;
 };

 const refreshStatusBar = (): void => {
  const session = sessionManager.getActiveSession();
  if (!session) {
   statusBar.hide();
   return;
  }
  let fileName: string | null = null;
  const uri = activeRenderedViewUri();
  if (uri) {
   try {
    fileName = parseMdprUri(uri).filePath.split('/').pop() ?? null;
   } catch {
    fileName = null;
   }
  }
  statusBar.update(session, fileName);
 };

 // The active PR follows the focused rendered-view editor tab.
 const syncActiveToFocusedEditor = (): void => {
  const uri = activeRenderedViewUri();
  if (uri) {
   sessionManager.setActiveByUri(uri);
  }
  refreshStatusBar();
 };

 context.subscriptions.push(
  sessionManager.onSessionChanged(() => {
   staleWatcher.setSessions(sessionManager.getOpenSessions());
   refreshStatusBar();
  }),
  sessionManager.onThreadsChanged(refreshStatusBar),
  vscode.window.tabGroups.onDidChangeTabGroups(syncActiveToFocusedEditor),
  vscode.window.tabGroups.onDidChangeTabs(syncActiveToFocusedEditor),
  statusBar,
  staleWatcher
 );

 context.subscriptions.push({ dispose: () => sessionManager.dispose() });

 log.info('Activation complete.');
}

export function deactivate(): void {
 // Cleanup handled by context.subscriptions disposers.
}
