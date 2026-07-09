// SPDX-License-Identifier: MIT
// Unit tests for the ADO remote-URL parser (TC-006, TC-007).
// Pure-function tests; no vscode dependency.

import { expect } from 'chai';
import { parseAdoRemoteUrl } from '../../src/ado-remote-parser';

describe('parseAdoRemoteUrl', () => {
  describe('TC-006 — canonical dev.azure.com remotes', () => {
    it('parses a standard https dev.azure.com remote', () => {
      const result = parseAdoRemoteUrl(
        'https://dev.azure.com/contoso/MyProj/_git/MyRepo',
      );
      expect(result.ok).to.equal(true);
      if (!result.ok) throw new Error('unreachable');
      expect(result.value).to.deep.equal({
        organization: 'contoso',
        project: 'MyProj',
        repositoryName: 'MyRepo',
      });
    });

    it('strips a trailing .git suffix', () => {
      const result = parseAdoRemoteUrl(
        'https://dev.azure.com/contoso/MyProj/_git/MyRepo.git',
      );
      expect(result.ok).to.equal(true);
      if (!result.ok) throw new Error('unreachable');
      expect(result.value.repositoryName).to.equal('MyRepo');
    });

    it('ignores an {org}@ userinfo prefix', () => {
      const result = parseAdoRemoteUrl(
        'https://contoso@dev.azure.com/contoso/MyProj/_git/MyRepo',
      );
      expect(result.ok).to.equal(true);
      if (!result.ok) throw new Error('unreachable');
      expect(result.value.organization).to.equal('contoso');
    });

    it('does not leak a PAT embedded in userinfo', () => {
      const result = parseAdoRemoteUrl(
        'https://user:supersecretpat@dev.azure.com/contoso/MyProj/_git/MyRepo',
      );
      expect(result.ok).to.equal(true);
      if (!result.ok) throw new Error('unreachable');
      expect(JSON.stringify(result.value)).to.not.contain('supersecretpat');
    });

    it('tolerates a trailing slash and query string', () => {
      const result = parseAdoRemoteUrl(
        'https://dev.azure.com/contoso/MyProj/_git/MyRepo/?foo=bar',
      );
      expect(result.ok).to.equal(true);
      if (!result.ok) throw new Error('unreachable');
      expect(result.value.repositoryName).to.equal('MyRepo');
    });

    it('lower-cases the organization', () => {
      const result = parseAdoRemoteUrl(
        'https://dev.azure.com/Contoso/MyProj/_git/MyRepo',
      );
      if (!result.ok) throw new Error('unreachable');
      expect(result.value.organization).to.equal('contoso');
    });

    it('URL-decodes project and repository segments', () => {
      const result = parseAdoRemoteUrl(
        'https://dev.azure.com/contoso/My%20Proj/_git/My%20Repo',
      );
      if (!result.ok) throw new Error('unreachable');
      expect(result.value.project).to.equal('My Proj');
      expect(result.value.repositoryName).to.equal('My Repo');
    });

    it('returns the raw segment when a component is not valid percent-encoding', () => {
      const result = parseAdoRemoteUrl(
        'https://dev.azure.com/contoso/MyProj/_git/My%Repo'
      );
      if (!result.ok) throw new Error('unreachable');
      expect(result.value.repositoryName).to.equal('My%Repo');
    });
  });

  describe('TC-007 — legacy, SSH, and non-ADO remotes', () => {
    it('parses a legacy visualstudio.com remote', () => {
      const result = parseAdoRemoteUrl(
        'https://contoso.visualstudio.com/MyProj/_git/MyRepo',
      );
      if (!result.ok) throw new Error('unreachable');
      expect(result.value).to.deep.equal({
        organization: 'contoso',
        project: 'MyProj',
        repositoryName: 'MyRepo',
      });
    });

    it('parses the DefaultCollection visualstudio.com variant', () => {
      const result = parseAdoRemoteUrl(
        'https://contoso.visualstudio.com/DefaultCollection/MyProj/_git/MyRepo',
      );
      if (!result.ok) throw new Error('unreachable');
      expect(result.value.project).to.equal('MyProj');
      expect(result.value.repositoryName).to.equal('MyRepo');
    });

    it('parses an ssh.dev.azure.com remote', () => {
      const result = parseAdoRemoteUrl(
        'git@ssh.dev.azure.com:v3/contoso/MyProj/MyRepo',
      );
      if (!result.ok) throw new Error('unreachable');
      expect(result.value).to.deep.equal({
        organization: 'contoso',
        project: 'MyProj',
        repositoryName: 'MyRepo',
      });
    });

    it('parses a legacy vs-ssh.visualstudio.com remote', () => {
      const result = parseAdoRemoteUrl(
        'contoso@vs-ssh.visualstudio.com:v3/contoso/MyProj/MyRepo',
      );
      if (!result.ok) throw new Error('unreachable');
      expect(result.value.organization).to.equal('contoso');
      expect(result.value.repositoryName).to.equal('MyRepo');
    });

    it('rejects a GitHub ssh remote as unsupported', () => {
      const result = parseAdoRemoteUrl('git@github.com:owner/repo.git');
      expect(result.ok).to.equal(false);
      if (result.ok) throw new Error('unreachable');
      expect(result.error.code).to.equal('unsupported-url');
    });

    it('rejects an https GitLab remote as unsupported', () => {
      const result = parseAdoRemoteUrl('https://gitlab.com/owner/repo.git');
      expect(result.ok).to.equal(false);
      if (result.ok) throw new Error('unreachable');
      expect(result.error.code).to.equal('unsupported-url');
    });

    it('rejects blank input', () => {
      const result = parseAdoRemoteUrl('   ');
      expect(result.ok).to.equal(false);
      if (result.ok) throw new Error('unreachable');
      expect(result.error.code).to.equal('empty-input');
    });
  });
});
