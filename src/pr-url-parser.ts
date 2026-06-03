// SPDX-License-Identifier: MIT
// PR URL Parser per design.md §3.2.
// Accepts three input shapes:
//   1. https://{org}.visualstudio.com/{project}/_git/{repo}/pullrequest/{id}
//   2. https://dev.azure.com/{org}/{project}/_git/{repo}/pullrequest/{id}
//   3. Bare PR id "12345" (requires defaultOrganization+defaultProject in settings)
// Always normalizes to dev.azure.com/{org}/{project}/_git/{repo}/...
// internally to dodge legacy-host quirks (RISK-007).
//
// Pure function — settings passed in for testability (TC-001..005).

import type { AdoSettings, ParseError, ParseResult, PullRequestRef } from './types';

// repositoryId is filled in later by ADO Client once the repo name is resolved
// to a GUID; the parser returns the human-readable repo name as both fields
// to keep the type total. SessionManager replaces repositoryId after the
// first ADO call.
export type ParsedPullRequestRef = PullRequestRef;

const VS_URL_RE = /^https?:\/\/([a-z0-9-]+)\.visualstudio\.com\/([^/]+)\/_git\/([^/]+)\/pullrequest\/(\d+)(?:[/?#].*)?$/i;
const ADO_URL_RE = /^https?:\/\/dev\.azure\.com\/([a-z0-9-]+)\/([^/]+)\/_git\/([^/]+)\/pullrequest\/(\d+)(?:[/?#].*)?$/i;
const BARE_ID_RE = /^\d+$/;

export function parsePullRequestInput(
 rawInput: string,
 settings: AdoSettings
): ParseResult<ParsedPullRequestRef> {
 const input = (rawInput ?? '').trim();
 if (!input) {
  return error('empty-input', 'Input is empty.', input);
 }

 // Bare PR ID requires both defaultOrganization and defaultProject.
 if (BARE_ID_RE.test(input)) {
  if (!settings.defaultOrganization) {
   return error(
    'missing-org',
    'A bare PR ID was provided but no default organization is configured (setting: markdownPrReview.defaultOrganization).',
    input
   );
  }
  if (!settings.defaultProject) {
   return error(
    'missing-project',
    'A bare PR ID was provided but no default project is configured (setting: markdownPrReview.defaultProject).',
    input
   );
  }
  const id = Number.parseInt(input, 10);
  if (!Number.isFinite(id) || id <= 0) {
   return error('invalid-pr-id', `PR id is not a positive integer: ${input}`, input);
  }
  return {
   ok: true,
   value: {
    organization: settings.defaultOrganization,
    project: decodeURIComponent(settings.defaultProject),
    // Repository name unknown for bare-id input; resolution requires
    // the user to have configured a default repo or for the session
    // to fail with a clear "repo unknown" error. For v0.1 we leave
    // both fields empty and let the ADO client surface the failure.
    repositoryId: '',
    repositoryName: '',
    pullRequestId: id
   }
  };
 }

 const vsMatch = VS_URL_RE.exec(input);
 if (vsMatch) {
  const [, org, project, repo, idStr] = vsMatch;
  return makeRef(org!, project!, repo!, idStr!, input);
 }

 const adoMatch = ADO_URL_RE.exec(input);
 if (adoMatch) {
  const [, org, project, repo, idStr] = adoMatch;
  return makeRef(org!, project!, repo!, idStr!, input);
 }

 return error(
  'unsupported-url',
  `Input does not match a supported URL form or numeric PR id. Expected one of: https://{org}.visualstudio.com/{project}/_git/{repo}/pullrequest/{id}, https://dev.azure.com/{org}/{project}/_git/{repo}/pullrequest/{id}, or a bare numeric PR id with default org/project configured.`,
  input
 );
}

function makeRef(
 org: string,
 project: string,
 repo: string,
 idStr: string,
 input: string
): ParseResult<ParsedPullRequestRef> {
 const id = Number.parseInt(idStr, 10);
 if (!Number.isFinite(id) || id <= 0) {
  return error('invalid-pr-id', `PR id is not a positive integer: ${idStr}`, input);
 }
 return {
  ok: true,
  value: {
   organization: org.toLowerCase(),
   project: decodeURIComponent(project),
   repositoryId: '',                    // ADO Client will resolve from name
   repositoryName: decodeURIComponent(repo),
   pullRequestId: id
  }
 };
}

function error(code: ParseError['code'], message: string, input: string): ParseResult<never> {
 return { ok: false, error: { code, message, input } };
}
