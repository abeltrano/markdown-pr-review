// SPDX-License-Identifier: MIT

import { expect } from 'chai';
import {
 addRecentPullRequest,
 isPullRequestRef,
 MAX_RECENT_PULL_REQUESTS,
 parseStoredRecentPullRequests,
 RECENT_PULL_REQUESTS_STATE_KEY,
 recentPullRequestFromPullRequest,
 recentPullRequestKey,
 type RecentPullRequest
} from '../../src/recent-prs';
import type { PullRequest, PullRequestRef } from '../../src/types';

describe('recent PR cache', () => {
 it('defines the persisted-state key and default cache limit', () => {
  expect(RECENT_PULL_REQUESTS_STATE_KEY).to.equal('markdownPrReview.recentPullRequests');
  expect(MAX_RECENT_PULL_REQUESTS).to.equal(10);
 });

 it('creates a persisted recent item from a pull request', () => {
  const pr = makePullRequest(42, 'First PR');
  const item = recentPullRequestFromPullRequest(pr, '2026-07-02T20:00:00.000Z');

  expect(item.ref).to.deep.equal(pr.ref);
  expect(item.title).to.equal('First PR');
  expect(item.sourceRefName).to.equal('refs/heads/feature');
  expect(item.targetRefName).to.equal('refs/heads/main');
  expect(item.openedAt).to.equal('2026-07-02T20:00:00.000Z');
 });

 it('deduplicates reopened PRs and moves the latest entry to the top', () => {
  const oldItem = makeRecent(42, 'Old title', '2026-07-01T20:00:00.000Z');
  const otherItem = makeRecent(43, 'Other PR', '2026-07-01T21:00:00.000Z');
  const updatedItem = makeRecent(42, 'Updated title', '2026-07-02T20:00:00.000Z');

  const result = addRecentPullRequest([oldItem, otherItem], updatedItem);

  expect(result.map(item => item.title)).to.deep.equal(['Updated title', 'Other PR']);
  expect(result[0].openedAt).to.equal('2026-07-02T20:00:00.000Z');
 });

 it('keeps only the requested number of recent PRs', () => {
  const existing = [makeRecent(1), makeRecent(2), makeRecent(3)];
  const result = addRecentPullRequest(existing, makeRecent(4), 3);

  expect(result.map(item => item.ref.pullRequestId)).to.deep.equal([4, 1, 2]);
 });

 it('uses case-insensitive organization/project/repository identity', () => {
  const lower = makeRecent(42);
  const upper: RecentPullRequest = {
   ...lower,
   ref: {
    ...lower.ref,
    organization: 'CONTOSO',
    project: 'PROJECT',
    repositoryId: 'ABCDEFAB-1234-1234-1234-ABCDEFABCDEF'
   }
  };

  expect(recentPullRequestKey(lower.ref)).to.equal(recentPullRequestKey(upper.ref));
 });

 it('falls back to repository name when repository id is not available', () => {
  const lower = makeRecent(42);
  const upper: RecentPullRequest = {
    ...lower,
    ref: {
      ...lower.ref,
      repositoryId: '',
      repositoryName: 'DOCS'
    }
  };
  lower.ref = {
    ...lower.ref,
    repositoryId: '',
    repositoryName: 'docs'
  };

  expect(recentPullRequestKey(lower.ref)).to.equal(recentPullRequestKey(upper.ref));
 });

 it('keeps repository id and repository name identities distinct', () => {
  const withId = makeRecent(42);
  const withName: RecentPullRequest = {
    ...withId,
    ref: {
      ...withId.ref,
      repositoryId: '',
      repositoryName: 'DOCS'
    }
  };

  expect(recentPullRequestKey(withName.ref)).to.not.equal(recentPullRequestKey(withId.ref));
 });

 it('drops malformed entries when reading stored state', () => {
  const valid = makeRecent(42);
  const result = parseStoredRecentPullRequests([
   valid,
   { title: 'missing ref' },
   null,
   { ...valid, ref: { ...valid.ref, pullRequestId: 0 } }
  ]);

  expect(result).to.deep.equal([valid]);
 });

 it('returns an empty recent list for non-array stored state', () => {
  expect(parseStoredRecentPullRequests(undefined)).to.deep.equal([]);
  expect(parseStoredRecentPullRequests({ recent: [makeRecent(42)] })).to.deep.equal([]);
 });

 it('drops entries with incomplete metadata or invalid refs', () => {
  const valid = makeRecent(42);
  const invalidEntries: unknown[] = [
   { ...valid, title: 42 },
   { ...valid, sourceRefName: null },
   { ...valid, targetRefName: false },
   { ...valid, openedAt: 42 },
   { ...valid, ref: 'not a ref' },
   { ...valid, ref: { ...valid.ref, organization: 42 } },
   { ...valid, ref: { ...valid.ref, project: 42 } },
   { ...valid, ref: { ...valid.ref, repositoryId: 42 } },
   { ...valid, ref: { ...valid.ref, repositoryName: 42 } },
   { ...valid, ref: { ...valid.ref, pullRequestId: Number.NaN } },
   { ...valid, ref: { ...valid.ref, pullRequestId: -1 } }
  ];

  expect(parseStoredRecentPullRequests([valid, ...invalidEntries])).to.deep.equal([valid]);
 });
});

describe('isPullRequestRef guard', () => {
 const validRef: PullRequestRef = {
  organization: 'contoso',
  project: 'Project',
  repositoryId: 'abcdefab-1234-1234-1234-abcdefabcdef',
  repositoryName: 'Docs',
  pullRequestId: 42
 };

 it('accepts a complete pull request ref', () => {
  expect(isPullRequestRef(validRef)).to.equal(true);
 });

 it('rejects the file-tree placeholder node passed by the view/title button', () => {
  const placeholder = {
   kind: 'message',
   label: 'No active PR. Run "Markdown PR Review: Open Pull Request…" to start.',
   tooltip: 'Press Ctrl+Shift+P and run the command.'
  };

  expect(isPullRequestRef(placeholder)).to.equal(false);
 });

 it('rejects nullish and non-object values', () => {
  expect(isPullRequestRef(undefined)).to.equal(false);
  expect(isPullRequestRef(null)).to.equal(false);
  expect(isPullRequestRef('ref')).to.equal(false);
 });

 it('rejects partial or malformed refs', () => {
  expect(isPullRequestRef({ ...validRef, organization: 42 })).to.equal(false);
  expect(isPullRequestRef({ ...validRef, repositoryId: 42 })).to.equal(false);
  expect(isPullRequestRef({ ...validRef, pullRequestId: 0 })).to.equal(false);
  expect(isPullRequestRef({
   organization: 'contoso',
   project: 'Project',
   repositoryId: 'abcdefab-1234-1234-1234-abcdefabcdef',
   repositoryName: 'Docs'
  })).to.equal(false);
 });
});

function makeRecent(
 pullRequestId: number,
 title = `PR ${pullRequestId}`,
 openedAt = '2026-07-02T20:00:00.000Z'
): RecentPullRequest {
 return recentPullRequestFromPullRequest(makePullRequest(pullRequestId, title), openedAt);
}

function makePullRequest(pullRequestId: number, title: string): PullRequest {
 return {
  ref: {
   organization: 'contoso',
   project: 'Project',
   repositoryId: 'abcdefab-1234-1234-1234-abcdefabcdef',
   repositoryName: 'Docs',
   pullRequestId
  },
  title,
  sourceRefName: 'refs/heads/feature',
  targetRefName: 'refs/heads/main',
  lastMergeSourceCommit: { commitId: 'abc123' },
  status: 'active'
 };
}
