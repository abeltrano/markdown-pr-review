// SPDX-License-Identifier: MIT
// File tree provider per design.md §4.1.3.
//
// Shows the list of changed files in the active PR; markdown files are
// active (click → open rendered view); non-markdown files are dimmed and
// non-interactive.
//
// Each item carries a badge of unresolved-thread count when threads are
// available.

import * as vscode from 'vscode';
import type { ChangedFile, Thread } from '../types';
import { buildAdoprUri } from '../adopr-uri';
import type { SessionManager } from '../session-manager';

export class FileTreeProvider implements vscode.TreeDataProvider<FileNode> {
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<FileNode | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private readonly sessionManager: SessionManager) {
        sessionManager.onSessionChanged(() => this.refresh());
        sessionManager.onThreadsChanged(() => this.refresh());
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(node: FileNode): vscode.TreeItem {
        const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.None);
        if (node.kind === 'message') {
            item.tooltip = node.tooltip;
            return item;
        }
        const file = node.file;
        const threadCount = node.unresolvedThreads;
        item.description = threadCount > 0 ? `${threadCount} 💬` : undefined;
        item.tooltip = `${file.filePath} (${file.changeType})`;
        if (!file.isMarkdown) {
            item.iconPath = new vscode.ThemeIcon('circle-slash');
            item.tooltip += '\n(not a markdown file)';
            return item;
        }
        item.iconPath = new vscode.ThemeIcon('markdown');
        const session = this.sessionManager.getActiveSession();
        if (session) {
            const uri = buildAdoprUri(
                { ...session.pr.ref, repositoryId: session.pr.ref.repositoryId },
                file.filePath
            );
            item.command = {
                command: 'vscode.openWith',
                title: 'Open in Rendered View',
                arguments: [uri, 'adoMdReview.renderedView']
            };
        }
        return item;
    }

    getChildren(): FileNode[] {
        const session = this.sessionManager.getActiveSession();
        if (!session) {
            return [
                {
                    kind: 'message',
                    label: 'No active PR. Run "ADO MD Review: Open PR…" to start.',
                    tooltip: 'Press Ctrl+Shift+P and run the command.'
                }
            ];
        }
        return session.files.map((file: ChangedFile): FileNode => ({
            kind: 'file',
            label: file.filePath,
            file,
            unresolvedThreads: countUnresolvedThreads(session.threads, file.filePath)
        }));
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

export type FileNode =
    | {
          kind: 'file';
          label: string;
          file: ChangedFile;
          unresolvedThreads: number;
      }
    | { kind: 'message'; label: string; tooltip: string };
