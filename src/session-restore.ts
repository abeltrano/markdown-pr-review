// SPDX-License-Identifier: MIT
// Helpers for restoring a rendered-view session from VS Code's persisted
// custom-editor resource URI after an extension-host reload.

import type { PullRequestRef, Session } from './types';

export interface MdprSessionParts {
 organization: string;
 project: string;
 repositoryId: string;
 pullRequestId: number;
}

export function sessionKeyFromMdprParts(parts: MdprSessionParts): string {
 return [
  parts.organization.toLowerCase(),
  parts.project,
  parts.repositoryId.toLowerCase(),
  String(parts.pullRequestId)
 ].join('\n');
}

export function pullRequestRefFromMdprParts(parts: MdprSessionParts): PullRequestRef {
 return {
  organization: parts.organization,
  project: parts.project,
  repositoryId: parts.repositoryId,
  repositoryName: '',
  pullRequestId: parts.pullRequestId
 };
}

export function sessionMatchesMdprParts(
 session: Pick<Session, 'pr'>,
 parts: MdprSessionParts
): boolean {
 const ref = session.pr.ref;
 return ref.organization.toLowerCase() === parts.organization.toLowerCase() &&
  ref.project === parts.project &&
  ref.repositoryId.toLowerCase() === parts.repositoryId.toLowerCase() &&
  ref.pullRequestId === parts.pullRequestId;
}
