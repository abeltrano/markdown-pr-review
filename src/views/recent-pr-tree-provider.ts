// SPDX-License-Identifier: MIT
// Tree provider for recently opened pull requests.

import * as vscode from 'vscode';
import type { SessionManager } from '../session-manager';
import type { PullRequestRef } from '../types';
import {
 MAX_RECENT_PULL_REQUESTS,
 RECENT_PULL_REQUESTS_STATE_KEY,
 parseStoredRecentPullRequests,
 recentPullRequestKey,
 type RecentPullRequest
} from '../recent-prs';

export class RecentPullRequestTreeProvider
 implements vscode.TreeDataProvider<RecentPullRequestNode> {
 private readonly _onDidChangeTreeData = new vscode.EventEmitter<
  RecentPullRequestNode | undefined | void
 >();
 readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

 constructor(
  private readonly context: vscode.ExtensionContext,
  private readonly sessionManager: SessionManager
 ) {
  sessionManager.onSessionChanged(() => this.refresh());
 }

 refresh(): void {
  this._onDidChangeTreeData.fire();
 }

 getTreeItem(node: RecentPullRequestNode): vscode.TreeItem {
  if (node.kind === 'message') {
   const item = new vscode.TreeItem(
    node.label,
    vscode.TreeItemCollapsibleState.None
   );
   item.tooltip = node.tooltip;
   return item;
  }

  const pr = node.pullRequest;
  const ref = pr.ref;
  const item = new vscode.TreeItem(
   `PR #${ref.pullRequestId}`,
   vscode.TreeItemCollapsibleState.None
  );
  item.iconPath = new vscode.ThemeIcon('git-pull-request');
  item.description = `${ref.repositoryName || ref.repositoryId} — ${pr.title}`;
  item.tooltip = [
   pr.title,
   `${ref.organization}/${ref.project}/${ref.repositoryName || ref.repositoryId}`,
   `${shortRef(pr.sourceRefName)} → ${shortRef(pr.targetRefName)}`,
   `Opened ${formatOpenedAt(pr.openedAt)}`
  ].join('\n');
  item.command = {
   command: 'markdownPrReview.openPullRequest',
   title: 'Open Pull Request',
   arguments: [ref]
  };
  if (this.isActive(ref)) {
   item.description = `${item.description} (current)`;
  }
  return item;
 }

 getChildren(node?: RecentPullRequestNode): RecentPullRequestNode[] {
  if (node) return [];
  const recent = this.getRecentPullRequests();
  if (recent.length === 0) {
   return [
    {
     kind: 'message',
     label: 'No recent PRs yet.',
     tooltip: 'Open a pull request to add it to this list.'
    }
   ];
  }
  return recent.map((pullRequest): RecentPullRequestNode => ({
   kind: 'pullRequest',
   pullRequest
  }));
 }

 private getRecentPullRequests(): RecentPullRequest[] {
  return parseStoredRecentPullRequests(
   this.context.globalState.get<unknown>(RECENT_PULL_REQUESTS_STATE_KEY)
  ).slice(0, MAX_RECENT_PULL_REQUESTS);
 }

 private isActive(ref: PullRequestRef): boolean {
  const session = this.sessionManager.getActiveSession();
  return session != null &&
   recentPullRequestKey(session.pr.ref) === recentPullRequestKey(ref);
 }
}

function shortRef(refName: string): string {
 return refName.replace(/^refs\/heads\//, '');
}

function formatOpenedAt(value: string): string {
 const date = new Date(value);
 if (Number.isNaN(date.getTime())) return value;
 return date.toLocaleString();
}

export type RecentPullRequestNode =
 | { kind: 'pullRequest'; pullRequest: RecentPullRequest }
 | { kind: 'message'; label: string; tooltip: string };
