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
 return JSON.stringify([
  parts.organization.toLowerCase(),
  parts.project.toLowerCase(),
  parts.repositoryId.toLowerCase(),
  String(parts.pullRequestId)
 ]);
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
 const { organization, project, repositoryId, pullRequestId } = session.pr.ref;
 return organization.toLowerCase() === parts.organization.toLowerCase() &&
  project.toLowerCase() === parts.project.toLowerCase() &&
  repositoryId.toLowerCase() === parts.repositoryId.toLowerCase() &&
  pullRequestId === parts.pullRequestId;
}
