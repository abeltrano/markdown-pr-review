// SPDX-License-Identifier: MIT
// File tree provider per design.md §4.1.3.
//
// Shows the list of changed files in the active PR, grouped by directory
// (REQ-CORE-002 AC-2). Markdown files are active (click → open rendered
// view); non-markdown files are dimmed and clicking them shows an
// informational notification recommending the regular ADO web UI.
//
// Each markdown file carries a badge of unresolved-thread count when
// threads are available (REQ-CORE-006 AC-3).

import * as vscode from 'vscode';
import type { ChangedFile, Thread } from '../types';
import { buildAdoprUri } from '../adopr-uri';
import type { SessionManager } from '../session-manager';

const NON_MARKDOWN_INFO_COMMAND = 'adoMdReview.showNonMarkdownInfo';

export class FileTreeProvider implements vscode.TreeDataProvider<FileNode> {
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<
        FileNode | undefined | void
    >();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    private readonly infoCommand: vscode.Disposable;

    constructor(private readonly sessionManager: SessionManager) {
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
        this._onDidChangeTreeData.fire();
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
        item.description = threadCount > 0 ? `${threadCount} 💬` : undefined;
        item.tooltip = `${file.filePath} (${file.changeType})`;
        item.resourceUri = vscode.Uri.from({
            scheme: 'file',
            path: '/' + file.filePath.replace(/^\/+/, '')
        });
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

    getChildren(node?: FileNode): FileNode[] {
        const session = this.sessionManager.getActiveSession();
        if (!session) {
            return [
                {
                    kind: 'message',
                    label: 'No active PR. Run "Markdown PR Review: Open Pull Request…" to start.',
                    tooltip: 'Press Ctrl+Shift+P and run the command.'
                }
            ];
        }
        if (!node) {
            return groupFilesByDirectory(session.files, session.threads);
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
    threads: Thread[]
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
        return makeFileNodes(buckets.get(sortedDirs[0]!) ?? [], threads);
    }

    return sortedDirs.map((dir): FileNode => {
        const filesInDir = buckets.get(dir) ?? [];
        const children = makeFileNodes(filesInDir, threads);
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

function makeFileNodes(files: ChangedFile[], threads: Thread[]): FileNode[] {
    const sorted = [...files].sort((a, b) =>
        a.filePath.localeCompare(b.filePath)
    );
    return sorted.map((file): FileNode => ({
        kind: 'file',
        label: basename(file.filePath),
        file,
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

export type FileNode =
    | {
          kind: 'file';
          label: string;
          file: ChangedFile;
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
