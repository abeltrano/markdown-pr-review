// SPDX-License-Identifier: MIT
// Extension entry point. Real wiring is added in TASK-020;
// for now (TASK-001 scaffold) this is a no-op activate/deactivate
// that proves the extension loads.

import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
    const channel = vscode.window.createOutputChannel('ADO Markdown PR Reviewer');
    context.subscriptions.push(channel);
    channel.appendLine(`[${new Date().toISOString()}] ADO Markdown PR Reviewer activated (scaffold).`);

    for (const cmd of [
        'adoMdReview.openPullRequest',
        'adoMdReview.focusRenderedView',
        'adoMdReview.focusCommentInput',
        'adoMdReview.refreshThreads',
        'adoMdReview.commentOnSelection'
    ]) {
        context.subscriptions.push(
            vscode.commands.registerCommand(cmd, () => {
                void vscode.window.showInformationMessage(
                    `${cmd} not yet implemented (scaffold stage).`
                );
            })
        );
    }
}

export function deactivate(): void {
    // Nothing to clean up at the scaffold stage.
}
