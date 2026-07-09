// SPDX-License-Identifier: MIT
// Unit tests for the PR URL parser (TC-001 .. TC-005, TC-003).
// Pure-function tests; no vscode dependency.

import { expect } from 'chai';
import { parsePullRequestInput } from '../../src/pr-url-parser';
import type { AdoSettings } from '../../src/types';

const EMPTY: AdoSettings = {};
const WITH_DEFAULTS: AdoSettings = {
  defaultOrganization: 'contoso',
  defaultProject: 'MyProj',
};

describe('parsePullRequestInput', () => {
  describe('TC-001 — modern dev.azure.com URL', () => {
    it('parses a canonical dev.azure.com PR URL', () => {
      const result = parsePullRequestInput(
        'https://dev.azure.com/contoso/MyProj/_git/MyRepo/pullrequest/4242',
        EMPTY,
      );
      expect(result.ok).to.equal(true);
      if (!result.ok) throw new Error('unreachable');
      expect(result.value).to.deep.equal({
        organization: 'contoso',
        project: 'MyProj',
        repositoryId: '',
        repositoryName: 'MyRepo',
        pullRequestId: 4242,
      });
    });

    it('accepts trailing query string and fragment', () => {
      const result = parsePullRequestInput(
        'https://dev.azure.com/contoso/MyProj/_git/MyRepo/pullrequest/4242?_a=files#fileA',
        EMPTY,
      );
      expect(result.ok).to.equal(true);
      if (!result.ok) throw new Error('unreachable');
      expect(result.value.pullRequestId).to.equal(4242);
    });

    it('lowercases the organization name', () => {
      const result = parsePullRequestInput(
        'https://dev.azure.com/Contoso/MyProj/_git/MyRepo/pullrequest/4242',
        EMPTY,
      );
      expect(result.ok).to.equal(true);
      if (!result.ok) throw new Error('unreachable');
      expect(result.value.organization).to.equal('contoso');
    });
  });

  describe('TC-002 — legacy *.visualstudio.com URL', () => {
    it('parses a canonical *.visualstudio.com PR URL', () => {
      const result = parsePullRequestInput(
        'https://contoso.visualstudio.com/MyProj/_git/MyRepo/pullrequest/77',
        EMPTY,
      );
      expect(result.ok).to.equal(true);
      if (!result.ok) throw new Error('unreachable');
      expect(result.value).to.deep.equal({
        organization: 'contoso',
        project: 'MyProj',
        repositoryId: '',
        repositoryName: 'MyRepo',
        pullRequestId: 77,
      });
    });

    it('handles URL-encoded project names', () => {
      const result = parsePullRequestInput(
        'https://contoso.visualstudio.com/My%20Proj/_git/MyRepo/pullrequest/77',
        EMPTY,
      );
      expect(result.ok).to.equal(true);
      if (!result.ok) throw new Error('unreachable');
      expect(result.value.project).to.equal('My Proj');
    });
  });

  describe('TC-003 — reject malformed and non-ADO URLs', () => {
    it('rejects empty input', () => {
      const result = parsePullRequestInput('', EMPTY);
      expect(result.ok).to.equal(false);
      if (result.ok) throw new Error('unreachable');
      expect(result.error.code).to.equal('empty-input');
    });

    it('rejects whitespace-only input', () => {
      const result = parsePullRequestInput('   ', EMPTY);
      expect(result.ok).to.equal(false);
      if (result.ok) throw new Error('unreachable');
      expect(result.error.code).to.equal('empty-input');
    });

    it('rejects gibberish', () => {
      const result = parsePullRequestInput('not a url', EMPTY);
      expect(result.ok).to.equal(false);
      if (result.ok) throw new Error('unreachable');
      expect(result.error.code).to.equal('unsupported-url');
    });

    it('rejects a GitHub PR URL', () => {
      const result = parsePullRequestInput(
        'https://github.com/o/r/pull/1',
        EMPTY,
      );
      expect(result.ok).to.equal(false);
      if (result.ok) throw new Error('unreachable');
      expect(result.error.code).to.equal('unsupported-url');
    });

    it('rejects an ADO URL with no PR id', () => {
      const result = parsePullRequestInput(
        'https://dev.azure.com/contoso/MyProj/_git/MyRepo',
        EMPTY,
      );
      expect(result.ok).to.equal(false);
      if (result.ok) throw new Error('unreachable');
      expect(result.error.code).to.equal('unsupported-url');
    });

    it('rejects an ADO URL with non-numeric PR id', () => {
      const result = parsePullRequestInput(
        'https://dev.azure.com/contoso/MyProj/_git/MyRepo/pullrequest/abc',
        EMPTY,
      );
      expect(result.ok).to.equal(false);
      if (result.ok) throw new Error('unreachable');
      expect(result.error.code).to.equal('unsupported-url');
    });

    it('error message is not redacted (preserves the input form)', () => {
      const result = parsePullRequestInput('not a url', EMPTY);
      expect(result.ok).to.equal(false);
      if (result.ok) throw new Error('unreachable');
      expect(result.error.input).to.equal('not a url');
      expect(result.error.message)
        .to.be.a('string')
        .and.have.length.greaterThan(0);
    });
  });

  describe('TC-004 / TC-005 — bare PR id requires defaults', () => {
    it('accepts a bare PR id when both org and project defaults are set', () => {
      const result = parsePullRequestInput('12345', WITH_DEFAULTS);
      expect(result.ok).to.equal(true);
      if (!result.ok) throw new Error('unreachable');
      expect(result.value).to.deep.equal({
        organization: 'contoso',
        project: 'MyProj',
        repositoryId: '',
        repositoryName: '',
        pullRequestId: 12345,
      });
    });

    it('rejects a bare PR id when org default is missing', () => {
      const result = parsePullRequestInput('12345', { defaultProject: 'P' });
      expect(result.ok).to.equal(false);
      if (result.ok) throw new Error('unreachable');
      expect(result.error.code).to.equal('missing-org');
    });

    it('rejects a bare PR id when project default is missing', () => {
      const result = parsePullRequestInput('12345', {
        defaultOrganization: 'o',
      });
      expect(result.ok).to.equal(false);
      if (result.ok) throw new Error('unreachable');
      expect(result.error.code).to.equal('missing-project');
    });

    it('rejects PR id 0 or negative', () => {
      // Note: regex BARE_ID_RE = /^\d+$/ wouldn't match a negative
      // sign, but 0 should fail the positive-integer check.
      const result = parsePullRequestInput('0', WITH_DEFAULTS);
      expect(result.ok).to.equal(false);
      if (result.ok) throw new Error('unreachable');
      expect(result.error.code).to.equal('invalid-pr-id');
    });
  });
});
