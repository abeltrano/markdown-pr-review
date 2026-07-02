// SPDX-License-Identifier: MIT
// Focused tests for rendered-view session restoration from persisted mdpr://
// custom-editor URIs.

import { expect } from 'chai';
import {
 pullRequestRefFromMdprParts,
 sessionKeyFromMdprParts,
 sessionMatchesMdprParts,
 type MdprSessionParts
} from '../../src/session-restore';
import type { Session } from '../../src/types';

const PARTS: MdprSessionParts = {
 organization: 'Contoso',
 project: 'My Project',
 repositoryId: '01234567-89ab-cdef-0123-456789abcdef',
 pullRequestId: 61
};

describe('rendered-view session restoration', () => {
 it('builds a pull request ref from persisted mdpr URI parts', () => {
  expect(pullRequestRefFromMdprParts(PARTS)).to.deep.equal({
   organization: 'Contoso',
   project: 'My Project',
   repositoryId: '01234567-89ab-cdef-0123-456789abcdef',
   repositoryName: '',
   pullRequestId: 61
  });
 });

 it('generates case-insensitive stable keys for the same PR', () => {
  const upperCaseParts: MdprSessionParts = {
   ...PARTS,
   organization: 'CONTOSO',
   project: 'MY PROJECT',
   repositoryId: '01234567-89AB-CDEF-0123-456789ABCDEF'
  };

  expect(sessionKeyFromMdprParts(upperCaseParts)).to.equal(
   sessionKeyFromMdprParts(PARTS)
  );
  expect(sessionKeyFromMdprParts({ ...PARTS, project: 'Other Project' })).to.not.equal(
   sessionKeyFromMdprParts(PARTS)
  );
  expect(sessionKeyFromMdprParts({ ...PARTS, pullRequestId: 62 })).to.not.equal(
   sessionKeyFromMdprParts(PARTS)
  );
 });

 it('recognizes when the active session already matches the restored editor', () => {
  const session: Pick<Session, 'pr'> = {
   pr: {
    ref: {
     ...pullRequestRefFromMdprParts(PARTS),
     organization: 'contoso',
     repositoryId: '01234567-89AB-CDEF-0123-456789ABCDEF'
    },
    title: 'Preserve rendered markdown on reload',
    sourceRefName: 'refs/heads/feature/reload',
    targetRefName: 'refs/heads/main',
    lastMergeSourceCommit: { commitId: 'abc123' },
    status: 'active'
   }
  };

  expect(sessionMatchesMdprParts(session, PARTS)).to.equal(true);
 });

 it('rejects sessions for a different pull request', () => {
  const session: Pick<Session, 'pr'> = {
   pr: {
    ref: pullRequestRefFromMdprParts({ ...PARTS, pullRequestId: 62 }),
    title: 'Different PR',
    sourceRefName: 'refs/heads/feature/other',
    targetRefName: 'refs/heads/main',
    lastMergeSourceCommit: { commitId: 'def456' },
    status: 'active'
   }
  };

  expect(sessionMatchesMdprParts(session, PARTS)).to.equal(false);
 });
});
