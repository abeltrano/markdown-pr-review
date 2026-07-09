// SPDX-License-Identifier: MIT
// Pure helpers for presenting discovered PRs in a Quick Pick and mapping a
// selection back to a PullRequestRef (REQ-CORE-008 AC-2). No vscode import,
// so it is unit-testable (TC-008); the command supplies these items to
// vscode.window.showQuickPick.

import type {
  AdoRepoCoordinates,
  DiscoveredPullRequest,
  PullRequestRef,
} from './types';

/** A discovered PR paired with the ADO coordinates it was found under. */
export interface DiscoveredPullRequestWithSource {
  coordinates: AdoRepoCoordinates;
  pullRequest: DiscoveredPullRequest;
}

/**
 * Quick Pick item shape (structurally a vscode.QuickPickItem) that also
 * carries the underlying discovered PR so the selection can be mapped back.
 */
export interface BranchPrQuickPickItem {
  label: string;
  description: string;
  detail?: string;
  source: DiscoveredPullRequestWithSource;
}

/**
 * Remove duplicate PRs keyed on full ref identity
 * (organization / project / repository / pullRequestId). A bare
 * pullRequestId is NOT unique across orgs or projects, so aggregating
 * across multiple remotes must key on the whole identity.
 */
export function dedupeDiscoveredPullRequests(
  items: DiscoveredPullRequestWithSource[],
): DiscoveredPullRequestWithSource[] {
  const seen = new Set<string>();
  const out: DiscoveredPullRequestWithSource[] = [];
  for (const item of items) {
    const key = refIdentityKey(item);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function toBranchPrQuickPickItems(
  items: DiscoveredPullRequestWithSource[],
): BranchPrQuickPickItem[] {
  return items.map((source) => {
    const pr = source.pullRequest;
    const draft = pr.isDraft ? '$(git-pull-request-draft) [Draft] ' : '';
    const item: BranchPrQuickPickItem = {
      label: `${draft}#${pr.pullRequestId} — ${pr.title}`,
      description: `${shortRef(pr.sourceRefName)} → ${shortRef(pr.targetRefName)}`,
      source,
    };
    if (pr.author) {
      item.detail = `by ${pr.author}`;
    }
    return item;
  });
}

export function pullRequestRefFromDiscoveredPr(
  source: DiscoveredPullRequestWithSource,
): PullRequestRef {
  const { coordinates, pullRequest } = source;
  return {
    organization: coordinates.organization,
    project: coordinates.project,
    repositoryId: pullRequest.repositoryId,
    repositoryName: pullRequest.repositoryName || coordinates.repositoryName,
    pullRequestId: pullRequest.pullRequestId,
  };
}

function refIdentityKey(item: DiscoveredPullRequestWithSource): string {
  const { coordinates, pullRequest } = item;
  return [
    coordinates.organization.toLowerCase(),
    coordinates.project.toLowerCase(),
    (pullRequest.repositoryId || pullRequest.repositoryName).toLowerCase(),
    String(pullRequest.pullRequestId),
  ].join('/');
}

function shortRef(refName: string): string {
  return refName.replace(/^refs\/heads\//, '');
}
