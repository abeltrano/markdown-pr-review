// SPDX-License-Identifier: MIT
// mdpr:// URI scheme helpers per design.md §3.2 CustomEditorProvider.
//
// URI layout:
//   mdpr://{org}/{project}/{repoId}/{prId}{filePath}
// where {filePath} retains its leading slash so the ADO convention
// (/docs/foo.md) survives the round-trip.

import * as vscode from 'vscode';
import type { PullRequestRef } from './types';

export const MDPR_SCHEME = 'mdpr';

/**
 * Build an mdpr:// URI for a (PR, file) pair.
 * - `ref.repositoryId` MUST be set (the parser returns it empty; SessionManager
 *   fills it in after the first ADO call resolves repo name → GUID).
 */
export function buildMdprUri(ref: PullRequestRef, filePath: string): vscode.Uri {
 if (!ref.repositoryId) {
  throw new Error('buildMdprUri: PullRequestRef.repositoryId is empty.');
 }
 const normalizedFilePath = filePath.startsWith('/') ? filePath : '/' + filePath;
 // Use Uri.from to ensure consistent encoding regardless of host.
 return vscode.Uri.from({
  scheme: MDPR_SCHEME,
  authority: ref.organization,
  path: `/${encodeURIComponent(ref.project)}/${ref.repositoryId}/${ref.pullRequestId}${encodePath(normalizedFilePath)}`
 });
}

/**
 * Parse an mdpr:// URI back into its components.
 */
export function parseMdprUri(uri: vscode.Uri | string): {
 organization: string;
 project: string;
 repositoryId: string;
 pullRequestId: number;
 filePath: string;
} {
 const u = typeof uri === 'string' ? vscode.Uri.parse(uri) : uri;
 if (u.scheme !== MDPR_SCHEME) {
  throw new Error(`parseMdprUri: not an mdpr:// URI (scheme=${u.scheme}).`);
 }
 const org = u.authority;
 if (!org) {
  throw new Error('parseMdprUri: missing organization (authority).');
 }
 // path is "/{project}/{repoId}/{prId}{filePath}"
 const path = u.path;
 const segments = path.split('/');
 // segments[0] is empty (leading slash); we need at least 4 segments past it
 if (segments.length < 5) {
  throw new Error(`parseMdprUri: path has too few segments: ${path}`);
 }
 const project = decodeURIComponent(segments[1]!);
 const repositoryId = segments[2]!;
 const prIdStr = segments[3]!;
 const pullRequestId = Number.parseInt(prIdStr, 10);
 if (!Number.isFinite(pullRequestId) || pullRequestId <= 0) {
  throw new Error(`parseMdprUri: invalid pull request id ${prIdStr}`);
 }
 // Reassemble file path from remaining segments (preserves leading slash)
 const filePath = '/' + segments.slice(4).map(decodeURIComponent).join('/');
 return {
  organization: org,
  project,
  repositoryId,
  pullRequestId,
  filePath
 };
}

/** Encode each path segment but preserve slashes. */
function encodePath(path: string): string {
 return path.split('/').map((seg, i) => (i === 0 && seg === '' ? '' : encodeURIComponent(seg))).join('/');
}
