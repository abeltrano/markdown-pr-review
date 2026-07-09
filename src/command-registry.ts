// SPDX-License-Identifier: MIT
// Command Registry per design.md §4.1.3.
// Registers the contributed commands and binds them to SessionManager.

import * as vscode from 'vscode';
import { getLogger } from './logger';
import { parsePullRequestInput } from './pr-url-parser';
import { isPullRequestRef } from './recent-prs';
import type { SessionManager } from './session-manager';
import type { AdoSettings, PullRequestRef } from './types';
import type { CommentInputViewProvider } from './comment-input-view-provider';
import { ERROR_CODES, surfaceError } from './error-utils';
import { resolveActiveBranchContext, type BranchContext } from './git-context';
import {
  dedupeDiscoveredPullRequests,
  pullRequestRefFromDiscoveredPr,
  toBranchPrQuickPickItems,
  type DiscoveredPullRequestWithSource,
} from './branch-pr-picker';
import { buildMdprUri } from './mdpr-uri';

const COMMAND_IDS = {
  openPR: 'markdownPrReview.openPullRequest',
  refreshThreads: 'markdownPrReview.refreshThreads',
  addComment: 'markdownPrReview.addComment',
  refreshToHead: 'markdownPrReview.refreshToHead',
  closeSession: 'markdownPrReview.closeSession',
  openPRForBranch: 'markdownPrReview.openPullRequestForCurrentBranch',
} as const;

export function registerCommands(
  context: vscode.ExtensionContext,
  sessionManager: SessionManager,
  inputView: CommentInputViewProvider,
): void {
  const log = getLogger('CommandRegistry');

  context.subscriptions.push(
    vscode.commands.registerCommand(
      COMMAND_IDS.openPR,
      async (ref?: unknown) => {
        try {
          // VS Code invokes a view/title command with the currently selected
          // tree node as its first argument. When no PR is active the file
          // tree shows a placeholder node (kind:'message'), so `ref` can be an
          // arbitrary object rather than a PullRequestRef — accept it only when
          // it is a genuine ref, otherwise fall back to the input prompt.
          const targetRef = isPullRequestRef(ref)
            ? ref
            : await promptForPullRequestRef(log);
          if (!targetRef) return;
          await sessionManager.openPullRequest(targetRef);
          await revealReviewSurface(sessionManager);
          void vscode.window.showInformationMessage(
            `Loaded PR #${targetRef.pullRequestId} from ${targetRef.organization}/${targetRef.project}.`,
          );
        } catch (err) {
          await surfaceError(err, 'Open PR');
        }
      },
    ),

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
        'Select text in the rendered view and the comment input panel will activate.',
      );
      await vscode.commands.executeCommand(
        'workbench.view.extension.markdownPrReview',
      );
    }),

    vscode.commands.registerCommand(COMMAND_IDS.refreshToHead, async () => {
      try {
        const session = sessionManager.getActiveSession();
        if (!session) {
          void vscode.window.showInformationMessage(
            'No active PR session to refresh.',
          );
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
    }),

    vscode.commands.registerCommand(COMMAND_IDS.openPRForBranch, async () => {
      try {
        await openPullRequestForCurrentBranch(sessionManager, log);
      } catch (err) {
        await surfaceError(err, 'Open PR for current branch');
      }
    }),
  );
}

async function promptForPullRequestRef(
  log: ReturnType<typeof getLogger>,
): Promise<PullRequestRef | null> {
  const settings = getSettings();
  let initialValue: string | undefined;
  if (settings.defaultOrganization && settings.defaultProject) {
    initialValue = '';
  }
  const input = await vscode.window.showInputBox({
    prompt: 'Enter the ADO PR URL or pull request ID',
    placeHolder:
      'https://dev.azure.com/{org}/{project}/_git/{repo}/pullrequest/{id}',
    value: initialValue,
    ignoreFocusOut: true,
  });
  if (!input) return null;
  const parsed = parsePullRequestInput(input, settings);
  if (!parsed.ok) {
    void vscode.window
      .showErrorMessage(
        `Open PR failed (${ERROR_CODES.PR_PARSE}/${parsed.error.code}): ${parsed.error.message}`,
        'Open Output',
      )
      .then((choice) => {
        if (choice === 'Open Output') log.channel.show(true);
      });
    return null;
  }
  return parsed.value;
}

function getSettings(): AdoSettings {
  const cfg = vscode.workspace.getConfiguration('markdownPrReview');
  const org = cfg.get<string>('defaultOrganization', '').trim();
  const project = cfg.get<string>('defaultProject', '').trim();
  return {
    defaultOrganization: org || undefined,
    defaultProject: project || undefined,
  };
}

async function openPullRequestForCurrentBranch(
  sessionManager: SessionManager,
  log: ReturnType<typeof getLogger>,
): Promise<void> {
  let context = await resolveActiveBranchContext();
  if (context.kind === 'ambiguous-repository') {
    const chosenRoot = await vscode.window.showQuickPick(
      context.repositoryRoots,
      {
        title: 'Multiple git repositories are open',
        placeHolder: 'Select the repository whose current branch to use',
        ignoreFocusOut: true,
      },
    );
    if (!chosenRoot) return;
    context = await resolveActiveBranchContext(chosenRoot);
  }

  switch (context.kind) {
    case 'git-extension-unavailable':
      void vscode.window.showWarningMessage(
        'The built-in Git extension is unavailable, so the current branch ' +
          'cannot be determined. Use “Open Pull Request…” to open a PR by ' +
          'URL or ID instead.',
      );
      return;
    case 'no-repository':
      void vscode.window.showWarningMessage(
        'No git repository is open in this workspace. Open a folder cloned ' +
          'from an Azure DevOps repository, or use “Open Pull Request…”.',
      );
      return;
    case 'ambiguous-repository':
      // The user cancelled the repository prompt, or the chosen root no
      // longer matches an open repository.
      return;
    case 'detached-head':
      void vscode.window.showWarningMessage(
        'No branch is checked out (detached HEAD), so there is no source ' +
          'branch to search for. Check out a branch and try again.',
      );
      return;
    case 'no-ado-remote':
      void vscode.window.showWarningMessage(
        'This repository has no Azure DevOps Services remote, so its pull ' +
          'requests cannot be discovered here. Use “Open Pull Request…” to ' +
          'open a PR by URL or ID.',
      );
      return;
  }

  // Every non-'ok' kind returned above; `context` is now the 'ok' variant.
  const ok = context;
  log.info('Discovering active PRs for the current branch.', {
    branch: ok.branchName,
    remotes: ok.candidates.map((c) => c.remoteName),
  });

  const discovered = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Finding pull requests for ${ok.branchName}…`,
    },
    () => discoverPullRequests(sessionManager, ok),
  );

  if (discovered.length === 0) {
    void vscode.window.showInformationMessage(
      `No active pull requests have “${ok.branchName}” as their source ` +
        'branch. Pull requests whose source branch lives in a fork are not ' +
        'discovered here.',
    );
    return;
  }

  const picked = await vscode.window.showQuickPick(
    toBranchPrQuickPickItems(discovered),
    {
      title: `Pull requests for ${ok.branchName}`,
      placeHolder: 'Select a pull request to open',
      matchOnDescription: true,
      matchOnDetail: true,
      ignoreFocusOut: true,
    },
  );
  if (!picked) return;

  const ref = pullRequestRefFromDiscoveredPr(picked.source);
  await sessionManager.openPullRequest(ref);
  await revealReviewSurface(sessionManager);
  void vscode.window.showInformationMessage(
    `Loaded PR #${ref.pullRequestId} from ${ref.organization}/${ref.project}.`,
  );
}

async function discoverPullRequests(
  sessionManager: SessionManager,
  context: Extract<BranchContext, { kind: 'ok' }>,
): Promise<DiscoveredPullRequestWithSource[]> {
  const client = sessionManager.getAdoClient();
  const all: DiscoveredPullRequestWithSource[] = [];
  for (const candidate of context.candidates) {
    const prs = await client.listActivePullRequestsBySourceBranch(
      candidate.coordinates,
      candidate.sourceBranch,
    );
    for (const pr of prs) {
      all.push({ coordinates: candidate.coordinates, pullRequest: pr });
    }
  }
  return dedupeDiscoveredPullRequests(all);
}

/**
 * After a PR is opened, focus the Markdown PR Review activity-bar view and
 * open the first changed markdown file in the rendered viewer, so the
 * reviewer lands directly on the review surface. Best-effort: a failure here
 * never fails the open (the PR is already loaded).
 */
async function revealReviewSurface(
  sessionManager: SessionManager,
): Promise<void> {
  try {
    await vscode.commands.executeCommand(
      'workbench.view.extension.markdownPrReview',
    );
    const session = sessionManager.getActiveSession();
    const firstMarkdown = session?.files.find((f) => f.isMarkdown);
    if (session && firstMarkdown) {
      await vscode.commands.executeCommand(
        'vscode.openWith',
        buildMdprUri(session.pr.ref, firstMarkdown.filePath),
        'markdownPrReview.renderedView',
      );
    }
  } catch (err) {
    getLogger('CommandRegistry').warn('Failed to reveal the review surface.', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
