// SPDX-License-Identifier: MIT
// Status Bar Controller per design.md §3.2 (TASK-033 / REQ-UX-001).
//
// Shows the current PR + active rendered-view file in the bottom-left
// status bar. Clicking the item focuses the rendered view. The item is
// hidden whenever no session is active or no rendered view is focused.

import * as vscode from 'vscode';
import type { Session } from './types';

const FOCUS_RENDERED_VIEW_COMMAND = 'markdownPrReview.focusRenderedView';

export class StatusBarController implements vscode.Disposable {
    private readonly item: vscode.StatusBarItem;
    private readonly disposables: vscode.Disposable[] = [];
    private currentSession: Session | null = null;

    constructor() {
        this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this.item.command = FOCUS_RENDERED_VIEW_COMMAND;
        this.item.tooltip = 'Click to focus the Markdown PR Review rendered editor';
        this.item.hide();

        this.disposables.push(
            vscode.commands.registerCommand(FOCUS_RENDERED_VIEW_COMMAND, () => this.focusActiveRenderedView())
        );
    }

    show(session: Session, fileName: string | null): void {
        this.currentSession = session;
        const filePart = fileName ? ` — ${fileName}` : '';
        const threadCount = session.threads.length;
        const threadPart = threadCount > 0 ? ` (${threadCount} thread${threadCount === 1 ? '' : 's'})` : '';
        this.item.text = `$(comment-discussion) MD Review: PR ${session.pr.ref.pullRequestId}${filePart}${threadPart}`;
        this.item.show();
    }

    update(session: Session, fileName: string | null): void {
        // Convenience alias used by callers that don't distinguish initial show vs update.
        this.show(session, fileName);
    }

    hide(): void {
        this.currentSession = null;
        this.item.hide();
    }

    private focusActiveRenderedView(): void {
        if (!this.currentSession) return;
        const firstOpenedUri = this.currentSession.openedEditors.keys().next().value;
        if (!firstOpenedUri) {
            void vscode.window.showInformationMessage('No Markdown PR Review editor is currently open.');
            return;
        }
        const uri = vscode.Uri.parse(firstOpenedUri);
        void vscode.commands.executeCommand('vscode.open', uri);
    }

    dispose(): void {
        this.item.dispose();
        for (const d of this.disposables) {
            try { d.dispose(); } catch { /* ignore */ }
        }
    }
}
