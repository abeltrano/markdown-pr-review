// SPDX-License-Identifier: MIT
// Pure helpers for maintaining the persisted recently-opened PR list.

import type { PullRequest, PullRequestRef } from './types';

export const RECENT_PULL_REQUESTS_STATE_KEY = 'markdownPrReview.recentPullRequests';
export const MAX_RECENT_PULL_REQUESTS = 10;

export interface RecentPullRequest {
 ref: PullRequestRef;
 title: string;
 sourceRefName: string;
 targetRefName: string;
 openedAt: string;
}

export function recentPullRequestFromPullRequest(
 pr: PullRequest,
 openedAt: string
): RecentPullRequest {
 return {
  ref: pr.ref,
  title: pr.title,
  sourceRefName: pr.sourceRefName,
  targetRefName: pr.targetRefName,
  openedAt
 };
}

export function addRecentPullRequest(
 existing: RecentPullRequest[],
 next: RecentPullRequest,
 maxItems = MAX_RECENT_PULL_REQUESTS
): RecentPullRequest[] {
 const nextKey = recentPullRequestKey(next.ref);
 return [
  next,
  ...existing.filter(item => recentPullRequestKey(item.ref) !== nextKey)
 ].slice(0, maxItems);
}

export function parseStoredRecentPullRequests(value: unknown): RecentPullRequest[] {
 if (!Array.isArray(value)) return [];
 return value.filter(isRecentPullRequest);
}

export function recentPullRequestKey(ref: PullRequestRef): string {
 return JSON.stringify([
  ref.organization.toLowerCase(),
  ref.project.toLowerCase(),
  (ref.repositoryId || ref.repositoryName).toLowerCase(),
  String(ref.pullRequestId)
 ]);
}

function isRecentPullRequest(value: unknown): value is RecentPullRequest {
 if (!isRecord(value)) return false;
 if (
  typeof value.title !== 'string' ||
  typeof value.sourceRefName !== 'string' ||
  typeof value.targetRefName !== 'string' ||
  typeof value.openedAt !== 'string'
 ) {
  return false;
 }
 return isPullRequestRef(value.ref);
}

export function isPullRequestRef(value: unknown): value is PullRequestRef {
 if (!isRecord(value)) return false;
 return typeof value.organization === 'string' &&
  typeof value.project === 'string' &&
  typeof value.repositoryId === 'string' &&
  typeof value.repositoryName === 'string' &&
  typeof value.pullRequestId === 'number' &&
  Number.isFinite(value.pullRequestId) &&
  value.pullRequestId > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
 return typeof value === 'object' && value !== null;
}
