// SPDX-License-Identifier: MIT
// Command Registry per design.md §4.1.3.
// Registers the 5 contributed commands and binds them to SessionManager.

import * as vscode from 'vscode';
import { getLogger } from './logger';
import { parsePullRequestInput } from './pr-url-parser';
import type { SessionManager } from './session-manager';
import type { AdoSettings } from './types';
import type { CommentInputViewProvider } from './comment-input-view-provider';
import { ERROR_CODES, surfaceError } from './error-utils';

const COMMAND_IDS = {
 openPR: 'markdownPrReview.openPullRequest',
 refreshThreads: 'markdownPrReview.refreshThreads',
 addComment: 'markdownPrReview.addComment',
 refreshToHead: 'markdownPrReview.refreshToHead',
 closeSession: 'markdownPrReview.closeSession'
} as const;

export function registerCommands(
 context: vscode.ExtensionContext,
 sessionManager: SessionManager,
 inputView: CommentInputViewProvider
): void {
 const log = getLogger('CommandRegistry');

 context.subscriptions.push(
  vscode.commands.registerCommand(COMMAND_IDS.openPR, async () => {
   try {
    const settings = getSettings();
    let initialValue: string | undefined;
    if (settings.defaultOrganization && settings.defaultProject) {
     initialValue = '';
    }
    const input = await vscode.window.showInputBox({
     prompt: 'Enter the ADO PR URL or pull request ID',
     placeHolder: 'https://dev.azure.com/{org}/{project}/_git/{repo}/pullrequest/{id}',
     value: initialValue,
     ignoreFocusOut: true
    });
    if (!input) return;
    const parsed = parsePullRequestInput(input, settings);
    if (!parsed.ok) {
     void vscode.window.showErrorMessage(
      `Open PR failed (${ERROR_CODES.PR_PARSE}/${parsed.error.code}): ${parsed.error.message}`,
      'Open Output'
     ).then((choice) => {
      if (choice === 'Open Output') log.channel.show(true);
     });
     return;
    }
    await sessionManager.openPullRequest(parsed.value);
    void vscode.window.showInformationMessage(
     `Loaded PR #${parsed.value.pullRequestId} from ${parsed.value.organization}/${parsed.value.project}.`
    );
   } catch (err) {
    await surfaceError(err, 'Open PR');
   }
  }),

  vscode.commands.registerCommand(COMMAND_IDS.refreshThreads, async () => {
   try {
    await sessionManager.refreshThreads();
    void vscode.window.showInformationMessage('Threads refreshed.');
   } catch (err) {
    await surfaceError(err, 'Refresh threads');
   }
  }),

  vscode.commands.registerCommand(COMMAND_IDS.addComment, async () => {
   // The user invoked Ctrl+Alt+C without selecting text first; tell
   // them to select. In v0.2 we can attempt to fetch the active
   // editor's selection here.
   void vscode.window.showInformationMessage(
    'Select text in the rendered view and the comment input panel will activate.'
   );
   await vscode.commands.executeCommand('workbench.view.extension.markdownPrReview');
  }),

  vscode.commands.registerCommand(COMMAND_IDS.refreshToHead, async () => {
   try {
    const session = sessionManager.getActiveSession();
    if (!session) {
     void vscode.window.showInformationMessage('No active PR session to refresh.');
     return;
    }
    await sessionManager.openPullRequest(session.pr.ref);
    void vscode.window.showInformationMessage('Reopened at latest head.');
   } catch (err) {
    await surfaceError(err, 'Refresh to head');
   }
  }),

  vscode.commands.registerCommand(COMMAND_IDS.closeSession, async () => {
   await sessionManager.disposeSession();
   inputView.clearDraft();
   void vscode.window.showInformationMessage('PR session closed.');
  })
 );
}

function getSettings(): AdoSettings {
 const cfg = vscode.workspace.getConfiguration('markdownPrReview');
 const org = cfg.get<string>('defaultOrganization', '').trim();
 const project = cfg.get<string>('defaultProject', '').trim();
 return {
  defaultOrganization: org || undefined,
  defaultProject: project || undefined
 };
}
