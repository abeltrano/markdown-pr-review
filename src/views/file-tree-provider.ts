// SPDX-License-Identifier: MIT
// File tree provider per design.md §4.1.3.
//
// Shows the list of changed files in open PRs, grouped by PR and directory
// (REQ-CORE-002 AC-2). Markdown files are active (click → open rendered
// view); non-markdown files are dimmed and clicking them shows an
// informational notification recommending the regular ADO web UI.
//
// Each markdown file carries a badge of unresolved-thread count when
// threads are available (REQ-CORE-006 AC-3).

import * as vscode from 'vscode';
import type { ChangedFile, PullRequestRef, Session, Thread } from '../types';
import { getLogger } from '../logger';
import { buildMdprUri } from '../mdpr-uri';
import type { SessionManager } from '../session-manager';
import type { CommentThreadDecorationProvider } from './file-decoration-provider';

const MARKDOWN_ONLY_KEY = 'markdownPrReview.markdownOnly';
const NON_MARKDOWN_INFO_COMMAND = 'markdownPrReview.showNonMarkdownInfo';
const NO_MARKDOWN_FILES_LABEL = 'No markdown files in this PR.';

export class FileTreeProvider implements vscode.TreeDataProvider<FileNode> {
 private readonly _onDidChangeTreeData = new vscode.EventEmitter<
  FileNode | undefined | void
 >();
 readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
 private readonly infoCommand: vscode.Disposable;
 private markdownOnly: boolean;

 constructor(
  private readonly context: vscode.ExtensionContext,
  private readonly sessionManager: SessionManager,
  private readonly decorationProvider: CommentThreadDecorationProvider
 ) {
  const log = getLogger('FileTreeProvider');
  this.markdownOnly = context.globalState.get<boolean>(MARKDOWN_ONLY_KEY, false);
  this.updateMarkdownOnlyContext().then(undefined, () => {
   log.warn('Failed to initialize markdown-only tree context.');
  });
  sessionManager.onSessionChanged(() => this.refresh());
  sessionManager.onThreadsChanged(() => this.refresh());
  this.infoCommand = vscode.commands.registerCommand(
   NON_MARKDOWN_INFO_COMMAND,
   (filePath: string) => {
    void vscode.window.showInformationMessage(
     `"${filePath}" is not a markdown file. Open it in the ADO web UI instead.`
    );
   }
  );
 }

 dispose(): void {
  this.infoCommand.dispose();
 }

 refresh(): void {
  this.updateDecorations();
  this._onDidChangeTreeData.fire();
 }

 async setMarkdownOnly(value: boolean): Promise<void> {
  this.markdownOnly = value;
  await this.context.globalState.update(MARKDOWN_ONLY_KEY, value);
  await this.updateMarkdownOnlyContext();
  this.refresh();
 }

 private async updateMarkdownOnlyContext(): Promise<void> {
  await vscode.commands.executeCommand('setContext', MARKDOWN_ONLY_KEY, this.markdownOnly);
 }

 private updateDecorations(): void {
  const next = new Map<string, { count: number; tooltip: string }>();
  for (const session of this.sessionManager.getOpenSessions()) {
   for (const f of session.files) {
    if (!f.isMarkdown) continue;
    const count = countUnresolvedThreads(session.threads, f.filePath);
    if (count <= 0) continue;
    const key = buildResourceUri(session.pr.ref, f.filePath).toString();
    next.set(key, {
     count,
     tooltip: `${count} unresolved comment thread${count === 1 ? '' : 's'}`
    });
   }
  }
  this.decorationProvider.setDecorations(next);
 }

 getTreeItem(node: FileNode): vscode.TreeItem {
  if (node.kind === 'message') {
   const item = new vscode.TreeItem(
    node.label,
    vscode.TreeItemCollapsibleState.None
   );
   item.tooltip = node.tooltip;
   return item;
  }
  if (node.kind === 'pullRequest') {
   const { session } = node;
   const ref = session.pr.ref;
   const expanded = node.active || this.sessionManager.getOpenSessions().length === 1
    ? vscode.TreeItemCollapsibleState.Expanded
    : vscode.TreeItemCollapsibleState.Collapsed;
   const item = new vscode.TreeItem(`PR #${ref.pullRequestId}`, expanded);
   item.description = `${ref.repositoryName ? ref.repositoryName + ' — ' : ''}${session.pr.title}${node.active ? ' (active)' : ''}`;
   item.iconPath = new vscode.ThemeIcon('git-pull-request');
   item.contextValue = 'markdownPrReviewPullRequest';
   const refs = `${shortRef(session.pr.sourceRefName)} → ${shortRef(session.pr.targetRefName)}`;
   item.tooltip = `${ref.organization}/${ref.project}/${ref.repositoryName || 'repository'}\n${session.pr.title}\n${refs}`;
   return item;
  }
  if (node.kind === 'directory') {
   const collapsed = node.startExpanded
    ? vscode.TreeItemCollapsibleState.Expanded
    : vscode.TreeItemCollapsibleState.Collapsed;
   const item = new vscode.TreeItem(node.label, collapsed);
   item.iconPath = new vscode.ThemeIcon('folder');
   item.description = `${node.markdownCount} md, ${node.totalCount} total`;
   item.tooltip = node.label;
   return item;
  }
  const item = new vscode.TreeItem(
   node.label,
   vscode.TreeItemCollapsibleState.None
  );
  const file = node.file;
  const threadCount = node.unresolvedThreads;
  item.tooltip = `${file.filePath} (${file.changeType})`;
  if (threadCount > 0) {
   item.tooltip += `\n${threadCount} unresolved comment thread${threadCount === 1 ? '' : 's'}`;
  }
  item.resourceUri = buildResourceUri(node.session.pr.ref, file.filePath);
  if (!file.isMarkdown) {
   item.iconPath = new vscode.ThemeIcon('circle-slash');
   item.tooltip += '\n(not a markdown file — click for info)';
   item.command = {
    command: NON_MARKDOWN_INFO_COMMAND,
    title: 'Show file info',
    arguments: [file.filePath]
   };
   return item;
  }
  // Files with unresolved threads use the same comment-discussion
  // codicon shown on each in-document thread marker; this keeps the
  // visual language consistent between the tree and the rendered
  // view. The unresolved count is rendered as a trailing badge by
  // CommentThreadDecorationProvider.
  item.iconPath = new vscode.ThemeIcon(
   threadCount > 0 ? 'comment-discussion' : 'markdown'
  );
  const uri = buildMdprUri(
   { ...node.session.pr.ref, repositoryId: node.session.pr.ref.repositoryId },
   file.filePath
  );
  item.command = {
   command: 'vscode.openWith',
   title: 'Open in Rendered View',
   arguments: [uri, 'markdownPrReview.renderedView']
  };
  return item;
 }

 getChildren(node?: FileNode): FileNode[] {
  if (!node) {
   const sessions = this.sessionManager.getOpenSessions();
   if (sessions.length === 0) {
    return [
     {
      kind: 'message',
      label: 'No active PR. Run "Markdown PR Review: Open Pull Request…" to start.',
      tooltip: 'Press Ctrl+Shift+P and run the command.'
     }
    ];
   }
   return sessions.map((session): FileNode => ({
    kind: 'pullRequest',
    session,
    active: this.sessionManager.isActiveSession(session)
   }));
  }
  if (node.kind === 'pullRequest') {
   const files = this.markdownOnly
    ? node.session.files.filter(file => file.isMarkdown)
    : node.session.files;
   if (this.markdownOnly && files.length === 0) {
    return [
     {
      kind: 'message',
      label: NO_MARKDOWN_FILES_LABEL,
      tooltip: 'Turn off the markdown-only filter to show all changed files.'
     }
    ];
   }
   return groupFilesByDirectory(files, node.session.threads, node.session);
  }
  if (node.kind === 'directory') {
   return node.children;
  }
  return [];
 }
}

function countUnresolvedThreads(threads: Thread[], filePath: string): number {
 return threads.filter(
  t =>
   t.threadContext?.filePath === filePath &&
   t.status !== 'fixed' &&
   t.status !== 'closed' &&
   t.status !== 'byDesign' &&
   t.status !== 'wontFix'
 ).length;
}

function groupFilesByDirectory(
 files: ChangedFile[],
 threads: Thread[],
 session: Session
): FileNode[] {
 // Group by parent directory. Files at the repo root land in "/".
 const buckets = new Map<string, ChangedFile[]>();
 for (const f of files) {
  const dir = parentDir(f.filePath);
  const arr = buckets.get(dir) ?? [];
  arr.push(f);
  buckets.set(dir, arr);
 }

 // Sort directories alphabetically; "/" (root) first.
 const sortedDirs = Array.from(buckets.keys()).sort((a, b) => {
  if (a === '/') return -1;
  if (b === '/') return 1;
  return a.localeCompare(b);
 });

 // If only one directory contains everything, skip the directory wrapper.
 if (sortedDirs.length === 1) {
  return makeFileNodes(buckets.get(sortedDirs[0]!) ?? [], threads, session);
 }

 return sortedDirs.map((dir): FileNode => {
  const filesInDir = buckets.get(dir) ?? [];
  const children = makeFileNodes(filesInDir, threads, session);
  const markdownCount = filesInDir.filter(f => f.isMarkdown).length;
  return {
   kind: 'directory',
   label: dir,
   children,
   markdownCount,
   totalCount: filesInDir.length,
   startExpanded: markdownCount > 0
  };
 });
}

function makeFileNodes(
 files: ChangedFile[],
 threads: Thread[],
 session: Session
): FileNode[] {
 const sorted = [...files].sort((a, b) =>
  a.filePath.localeCompare(b.filePath)
 );
 return sorted.map((file): FileNode => ({
  kind: 'file',
  label: basename(file.filePath),
  file,
  session,
  unresolvedThreads: countUnresolvedThreads(threads, file.filePath)
 }));
}

function parentDir(filePath: string): string {
 const idx = filePath.lastIndexOf('/');
 if (idx <= 0) return '/';
 return filePath.slice(0, idx);
}

function basename(filePath: string): string {
 const idx = filePath.lastIndexOf('/');
 return idx < 0 ? filePath : filePath.slice(idx + 1);
}

function shortRef(refName: string): string {
 return refName.replace(/^refs\/heads\//, '').replace(/^refs\/pull\//, 'PR ');
}

// Build the resourceUri used both as the TreeItem's resourceUri and as
// the key the FileDecorationProvider looks up. The synthetic path includes
// PR identity so same-path files in different PRs keep distinct badges.
function buildResourceUri(ref: PullRequestRef, filePath: string): vscode.Uri {
 return vscode.Uri.from({
  scheme: 'file',
  path: `/${ref.pullRequestId}/${ref.repositoryId}/${filePath.replace(/^\/+/, '')}`
 });
}

export type FileNode =
 | {
  kind: 'pullRequest';
  session: Session;
  active: boolean;
 }
 | {
  kind: 'file';
  label: string;
  file: ChangedFile;
  session: Session;
  unresolvedThreads: number;
 }
 | {
  kind: 'directory';
  label: string;
  children: FileNode[];
  markdownCount: number;
  totalCount: number;
  startExpanded: boolean;
 }
 | { kind: 'message'; label: string; tooltip: string };
