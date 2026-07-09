// SPDX-License-Identifier: MIT
// Unit tests for the ADO GitPullRequest -> DiscoveredPullRequest mapper
// (REQ-CORE-008 AC-1). Pure-function tests; no vscode dependency.

import { expect } from 'chai';
import { toDiscoveredPullRequest } from '../../src/discovered-pr';

describe('toDiscoveredPullRequest', () => {
  it('maps a full ADO GitPullRequest payload', () => {
    const result = toDiscoveredPullRequest({
      pullRequestId: 42,
      title: 'Update design',
      sourceRefName: 'refs/heads/feature/foo',
      targetRefName: 'refs/heads/main',
      isDraft: true,
      createdBy: { displayName: 'Ada Lovelace' },
      repository: { id: 'guid-123', name: 'MyRepo' },
    });
    expect(result).to.deep.equal({
      pullRequestId: 42,
      title: 'Update design',
      sourceRefName: 'refs/heads/feature/foo',
      targetRefName: 'refs/heads/main',
      isDraft: true,
      author: 'Ada Lovelace',
      repositoryId: 'guid-123',
      repositoryName: 'MyRepo',
    });
  });

  it('applies safe defaults for missing fields', () => {
    const result = toDiscoveredPullRequest({ pullRequestId: 7 });
    expect(result).to.deep.equal({
      pullRequestId: 7,
      title: '',
      sourceRefName: '',
      targetRefName: '',
      isDraft: false,
      author: '',
      repositoryId: '',
      repositoryName: '',
    });
  });
});
