// SPDX-License-Identifier: MIT
// Active-repository / branch / remote resolver (REQ-CORE-008, ASM-010).
//
// Reads the current branch and ADO remotes of the active workspace
// repository through the built-in VS Code Git extension API (`vscode.git`) —
// an in-process API, never an external git binary (CON-007 carve-out). It
// performs no writes to the repository or workspace (CON-006), and never
// logs raw remote URLs (which may embed a PAT).
//
// This module imports `vscode`, so it is excluded from unit coverage; the
// remote-URL parsing it relies on lives in the pure ado-remote-parser.ts.

import * as vscode from 'vscode';
import { getLogger, type Logger } from './logger';
import { parseAdoRemoteUrl } from './ado-remote-parser';
import type { AdoRepoCoordinates } from './types';

// -- Minimal subset of the built-in Git extension API (git.d.ts) ----------
// The extension ships no type package, so we declare only the shape we use.

type GitApiState = 'uninitialized' | 'initialized';

interface GitExtension {
  getAPI(version: 1): GitApi;
}

interface GitApi {
  readonly state: GitApiState;
  readonly repositories: GitRepository[];
  readonly onDidChangeState: vscode.Event<GitApiState>;
}

interface GitRepository {
  readonly rootUri: vscode.Uri;
  readonly state: {
    readonly HEAD: GitBranch | undefined;
    readonly remotes: GitRemote[];
  };
}

interface GitBranch {
  readonly name?: string;
  readonly upstream?: { readonly remote: string; readonly name: string };
}

interface GitRemote {
  readonly name: string;
  readonly fetchUrl?: string;
  readonly pushUrl?: string;
}

// -- Public result shape ---------------------------------------------------

export interface RemoteCandidate {
  readonly remoteName: string;
  readonly coordinates: AdoRepoCoordinates;
  /**
   * Branch name to query on this remote — the upstream branch name when
   * HEAD tracks this remote, otherwise the local HEAD short name.
   */
  readonly sourceBranch: string;
}

export type BranchContext =
  | {
      readonly kind: 'ok';
      readonly branchName: string;
      readonly repositoryRoot: string;
      readonly candidates: RemoteCandidate[];
    }
  | { readonly kind: 'git-extension-unavailable' }
  | { readonly kind: 'no-repository' }
  | {
      readonly kind: 'ambiguous-repository';
      readonly repositoryRoots: string[];
    }
  | { readonly kind: 'detached-head' }
  | { readonly kind: 'no-ado-remote' };

const INIT_TIMEOUT_MS = 5000;

/**
 * Resolve the current branch and candidate ADO remotes for the active
 * workspace repository. Never throws; every failure mode is a distinct
 * `BranchContext` kind so the caller can surface an actionable message.
 */
export async function resolveActiveBranchContext(): Promise<BranchContext> {
  const log = getLogger('GitContext');
  const api = await acquireGitApi(log);
  if (!api) {
    return { kind: 'git-extension-unavailable' };
  }
  await waitForInitialized(api);

  const repos = api.repositories;
  if (repos.length === 0) {
    return { kind: 'no-repository' };
  }

  const repo = pickRepository(repos);
  if (!repo) {
    return {
      kind: 'ambiguous-repository',
      repositoryRoots: repos.map((r) => r.rootUri.fsPath),
    };
  }

  const head = repo.state.HEAD;
  if (!head || !head.name) {
    return { kind: 'detached-head' };
  }

  const candidates = buildRemoteCandidates(repo, head, head.name);
  if (candidates.length === 0) {
    return { kind: 'no-ado-remote' };
  }

  return {
    kind: 'ok',
    branchName: head.name,
    repositoryRoot: repo.rootUri.fsPath,
    candidates,
  };
}

async function acquireGitApi(log: Logger): Promise<GitApi | null> {
  const ext = vscode.extensions.getExtension<GitExtension>('vscode.git');
  if (!ext) {
    log.info(
      'Built-in Git extension (vscode.git) is not installed or enabled.',
    );
    return null;
  }
  try {
    const exports = ext.isActive ? ext.exports : await ext.activate();
    return exports.getAPI(1);
  } catch (err) {
    log.warn('Failed to acquire the Git extension API.', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

function waitForInitialized(api: GitApi): Promise<void> {
  if (api.state === 'initialized') {
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    const disposable = api.onDidChangeState((state) => {
      if (state === 'initialized') {
        disposable.dispose();
        clearTimeout(timer);
        resolve();
      }
    });
    // Never hang if the Git extension never reaches `initialized`.
    const timer = setTimeout(() => {
      disposable.dispose();
      resolve();
    }, INIT_TIMEOUT_MS);
  });
}

/**
 * Prefer the repository that owns the active editor's file; fall back to the
 * sole repository; otherwise return null to signal ambiguity. The active tab
 * may be a virtual `mdpr://` rendered view (scheme !== 'file'), which belongs
 * to no repository — that falls through to the sole-or-ambiguous branch.
 */
function pickRepository(repos: GitRepository[]): GitRepository | null {
  if (repos.length === 1) {
    return repos[0]!;
  }
  const activeUri = vscode.window.activeTextEditor?.document.uri;
  if (activeUri && activeUri.scheme === 'file') {
    const containing = repos.find((r) =>
      isWithin(r.rootUri.fsPath, activeUri.fsPath),
    );
    if (containing) {
      return containing;
    }
  }
  return null;
}

function isWithin(root: string, file: string): boolean {
  const rootFwd = root.replace(/\\/g, '/');
  const normalizedRoot = rootFwd.endsWith('/') ? rootFwd : rootFwd + '/';
  const normalizedFile = file.replace(/\\/g, '/');
  return normalizedFile.toLowerCase().startsWith(normalizedRoot.toLowerCase());
}

function buildRemoteCandidates(
  repo: GitRepository,
  head: GitBranch,
  branchName: string,
): RemoteCandidate[] {
  const ordered = [...repo.state.remotes].sort(
    (a, b) => originRank(a.name) - originRank(b.name),
  );
  const seen = new Set<string>();
  const out: RemoteCandidate[] = [];
  for (const remote of ordered) {
    const url = remote.fetchUrl ?? remote.pushUrl;
    if (!url) {
      continue;
    }
    const parsed = parseAdoRemoteUrl(url);
    if (!parsed.ok) {
      continue;
    }
    const coordinates = parsed.value;
    const key =
      `${coordinates.organization}/${coordinates.project}/${coordinates.repositoryName}`.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const sourceBranch =
      head.upstream && head.upstream.remote === remote.name
        ? head.upstream.name
        : branchName;
    out.push({ remoteName: remote.name, coordinates, sourceBranch });
  }
  return out;
}

function originRank(name: string): number {
  return name === 'origin' ? 0 : 1;
}
