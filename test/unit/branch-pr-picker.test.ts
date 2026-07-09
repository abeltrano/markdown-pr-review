// SPDX-License-Identifier: MIT
// Unit tests for the branch-PR Quick Pick helpers (TC-008).
// Pure-function tests; no vscode dependency.

import { expect } from 'chai';
import {
  dedupeDiscoveredPullRequests,
  pullRequestRefFromDiscoveredPr,
  toBranchPrQuickPickItems,
  type DiscoveredPullRequestWithSource,
} from '../../src/branch-pr-picker';
import { isPullRequestRef } from '../../src/recent-prs';
import type { DiscoveredPullRequest } from '../../src/types';

function pr(
  overrides: Partial<DiscoveredPullRequest> = {},
): DiscoveredPullRequest {
  return {
    pullRequestId: 20,
    title: 'Update design',
    sourceRefName: 'refs/heads/feature/foo',
    targetRefName: 'refs/heads/main',
    isDraft: false,
    author: 'Ada Lovelace',
    repositoryId: 'guid-abc',
    repositoryName: 'MyRepo',
    ...overrides,
  };
}

function source(
  prOverrides: Partial<DiscoveredPullRequest> = {},
  org = 'contoso',
  project = 'MyProj',
): DiscoveredPullRequestWithSource {
  return {
    coordinates: { organization: org, project, repositoryName: 'MyRepo' },
    pullRequest: pr(prOverrides),
  };
}

describe('branch-pr-picker', () => {
  describe('TC-008 — toBranchPrQuickPickItems', () => {
    it('labels a PR as #id — title with source → target and author detail', () => {
      const [item] = toBranchPrQuickPickItems([source()]);
      expect(item!.label).to.equal('#20 — Update design');
      expect(item!.description).to.equal('feature/foo → main');
      expect(item!.detail).to.equal('by Ada Lovelace');
    });

    it('marks drafts with a draft badge', () => {
      const [item] = toBranchPrQuickPickItems([source({ isDraft: true })]);
      expect(item!.label).to.contain('[Draft]');
      expect(item!.label).to.contain('#20 — Update design');
    });

    it('omits detail when the author is empty', () => {
      const [item] = toBranchPrQuickPickItems([source({ author: '' })]);
      expect(item!.detail).to.equal(undefined);
    });

    it('carries the source for round-tripping the selection', () => {
      const src = source();
      const [item] = toBranchPrQuickPickItems([src]);
      expect(item!.source).to.equal(src);
    });
  });

  describe('pullRequestRefFromDiscoveredPr', () => {
    it('builds a fully-resolved ref from the PR repository id and coords', () => {
      const ref = pullRequestRefFromDiscoveredPr(source());
      expect(ref).to.deep.equal({
        organization: 'contoso',
        project: 'MyProj',
        repositoryId: 'guid-abc',
        repositoryName: 'MyRepo',
        pullRequestId: 20,
      });
      expect(isPullRequestRef(ref)).to.equal(true);
    });

    it('falls back to the coordinate repository name when the PR omits it', () => {
      const ref = pullRequestRefFromDiscoveredPr(
        source({ repositoryName: '' }),
      );
      expect(ref.repositoryName).to.equal('MyRepo');
    });
  });

  describe('dedupeDiscoveredPullRequests', () => {
    it('collapses identical full-ref identities', () => {
      const result = dedupeDiscoveredPullRequests([source(), source()]);
      expect(result).to.have.length(1);
    });

    it('keeps the same pullRequestId under different organizations', () => {
      const result = dedupeDiscoveredPullRequests([
        source({}, 'org-a'),
        source({}, 'org-b'),
      ]);
      expect(result).to.have.length(2);
    });
  });
});
