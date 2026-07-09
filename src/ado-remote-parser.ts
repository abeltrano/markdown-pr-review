// SPDX-License-Identifier: MIT
// ADO remote-URL parser (REQ-CORE-008, ASM-001, RISK-007).
//
// Converts a git remote URL for an Azure DevOps Services repository into
// normalized coordinates {organization, project, repositoryName}, used by
// the active-branch PR discovery flow to resolve the ADO repo behind the
// current workspace repository's remote.
//
// Supported remote shapes (all normalized to dev.azure.com semantics):
//   1. https://dev.azure.com/{org}/{project}/_git/{repo}
//   2. https://{org}@dev.azure.com/{org}/{project}/_git/{repo}
//   3. https://{org}.visualstudio.com/{project}/_git/{repo}
//      (and the .../DefaultCollection/{project}/_git/{repo} variant)
//   4. git@ssh.dev.azure.com:v3/{org}/{project}/{repo}
//   5. {user}@vs-ssh.visualstudio.com:v3/{org}/{project}/{repo}
// A trailing ".git" and trailing "/" are stripped; the organization is
// lower-cased and project/repo are URL-decoded, matching pr-url-parser.ts.
// Any userinfo (including a PAT in "user:pat@…") is discarded. Non-ADO
// remotes (GitHub, GitLab, …) return a typed parse error. Azure DevOps
// Server (on-prem) hosts are out of scope (CON-002).
//
// Pure function — no vscode import — so it is unit-testable (TC-006, TC-007).

import type { AdoRepoCoordinates, ParseError, ParseResult } from './types';

const HTTPS_DEV_AZURE_RE =
  /^https?:\/\/(?:[^@/]+@)?dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/([^/?#]+?)(?:\.git)?\/?(?:[?#].*)?$/i;

const HTTPS_VS_RE =
  /^https?:\/\/(?:[^@/]+@)?([^./]+)\.visualstudio\.com\/(?:DefaultCollection\/)?([^/]+)\/_git\/([^/?#]+?)(?:\.git)?\/?(?:[?#].*)?$/i;

const SSH_DEV_AZURE_RE =
  /^git@ssh\.dev\.azure\.com:v3\/([^/]+)\/([^/]+)\/([^/?#]+?)(?:\.git)?\/?$/i;

const SSH_VS_RE =
  /^(?:[^@]+)@vs-ssh\.visualstudio\.com:v3\/([^/]+)\/([^/]+)\/([^/?#]+?)(?:\.git)?\/?$/i;

const REMOTE_PATTERNS = [
  HTTPS_DEV_AZURE_RE,
  HTTPS_VS_RE,
  SSH_DEV_AZURE_RE,
  SSH_VS_RE,
];

export function parseAdoRemoteUrl(
  rawInput: string,
): ParseResult<AdoRepoCoordinates> {
  const input = (rawInput ?? '').trim();
  if (!input) {
    return error('empty-input', 'Remote URL is empty.', input);
  }

  for (const pattern of REMOTE_PATTERNS) {
    const match = pattern.exec(input);
    if (match) {
      return makeCoordinates(match[1]!, match[2]!, match[3]!, input);
    }
  }

  return error(
    'unsupported-url',
    `Remote is not a recognized Azure DevOps Services URL: ${input}`,
    input,
  );
}

function makeCoordinates(
  org: string,
  project: string,
  repo: string,
  input: string,
): ParseResult<AdoRepoCoordinates> {
  const organization = org.trim().toLowerCase();
  const projectName = safeDecode(project).trim();
  const repositoryName = safeDecode(repo).trim();
  if (!organization || !projectName || !repositoryName) {
    return error(
      'malformed',
      `Remote is missing organization, project, or repository: ${input}`,
      input,
    );
  }
  return {
    ok: true,
    value: { organization, project: projectName, repositoryName },
  };
}

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function error(
  code: ParseError['code'],
  message: string,
  input: string,
): ParseResult<never> {
  return { ok: false, error: { code, message, input } };
}
