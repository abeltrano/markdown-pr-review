// SPDX-License-Identifier: MIT
// Pure mapping from the ADO "Get Pull Requests" wire shape (GitPullRequest)
// to the extension's DiscoveredPullRequest (REQ-CORE-008). Kept out of the
// coverage-excluded ADO client so the mapping stays unit-testable.

import type { DiscoveredPullRequest } from './types';

/** Subset of the ADO GitPullRequest wire shape consumed by discovery. */
export interface RawGitPullRequest {
  pullRequestId?: number;
  title?: string;
  sourceRefName?: string;
  targetRefName?: string;
  isDraft?: boolean;
  createdBy?: { displayName?: string };
  repository?: { id?: string; name?: string };
}

export function toDiscoveredPullRequest(
  raw: RawGitPullRequest,
): DiscoveredPullRequest {
  return {
    pullRequestId: raw.pullRequestId ?? 0,
    title: raw.title ?? '',
    sourceRefName: raw.sourceRefName ?? '',
    targetRefName: raw.targetRefName ?? '',
    isDraft: raw.isDraft ?? false,
    author: raw.createdBy?.displayName ?? '',
    repositoryId: raw.repository?.id ?? '',
    repositoryName: raw.repository?.name ?? '',
  };
}
