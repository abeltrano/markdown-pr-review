// SPDX-License-Identifier: MIT
// Stale-PR Watcher per design.md §3.2 (REQ-ERR-002).
//
// Polls the PR's head commit every N seconds. When the head advances
// past `session.headSha` we post a `staleCommit` message to every open
// rendered-view panel. After 3 consecutive failures the watcher logs
// a warning and continues polling (background concern; never surfaces
// as a user error).

import * as vscode from 'vscode';
import type { AdoClient } from './ado-client';
import { getLogger, type Logger } from './logger';
import type { HostToRenderedView, Session } from './types';

const DEFAULT_POLL_SECONDS = 30;
const MIN_POLL_SECONDS = 15;
const MAX_POLL_SECONDS = 60;
const MAX_CONSECUTIVE_FAILURES_BEFORE_WARN = 3;

export class StalePRWatcher implements vscode.Disposable {
  private readonly log: Logger;
  // Watch every open PR session (keyed by Session.id) with a single shared
  // timer so multiple simultaneously-open PRs all get stale-head detection.
  private sessions = new Map<string, Session>();
  private failures = new Map<string, number>();
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly adoClient: AdoClient,
    log?: Logger,
  ) {
    this.log = log ?? getLogger('StalePRWatcher');
  }

  /** Replace the watched set with the currently-open sessions. */
  setSessions(sessions: Session[]): void {
    this.sessions = new Map(sessions.map((s) => [s.id, s]));
    for (const id of [...this.failures.keys()]) {
      if (!this.sessions.has(id)) this.failures.delete(id);
    }
    if (this.sessions.size === 0) {
      this.stopTimer();
    } else if (!this.timer) {
      const intervalMs = this.resolvePollSeconds() * 1000;
      this.timer = setInterval(() => void this.tickAll(), intervalMs);
      this.log.info('Stale-PR watcher started.', { intervalMs });
    }
  }

  private stopTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  dispose(): void {
    this.stopTimer();
    this.sessions.clear();
    this.failures.clear();
  }

  private resolvePollSeconds(): number {
    const cfg = vscode.workspace.getConfiguration('markdownPrReview');
    const raw = cfg.get<number>('staleCommitPollSeconds', DEFAULT_POLL_SECONDS);
    const n = Number.isFinite(raw) ? Math.trunc(raw) : DEFAULT_POLL_SECONDS;
    return Math.min(MAX_POLL_SECONDS, Math.max(MIN_POLL_SECONDS, n));
  }

  private async tickAll(): Promise<void> {
    for (const session of [...this.sessions.values()]) {
      await this.tick(session);
    }
  }

  private async tick(session: Session): Promise<void> {
    if (!this.sessions.has(session.id)) return;
    try {
      const pr = await this.adoClient.getPullRequest(session.pr.ref);
      this.failures.delete(session.id);
      const latestHead = pr.lastMergeSourceCommit.commitId;
      if (latestHead && latestHead !== session.headSha) {
        this.log.info('Detected stale head commit.', {
          pullRequestId: session.pr.ref.pullRequestId,
          oldHead: session.headSha,
          newHead: latestHead,
        });
        this.notifyPanels(session, latestHead);
      }
    } catch (err) {
      const next = (this.failures.get(session.id) ?? 0) + 1;
      this.failures.set(session.id, next);
      if (next === MAX_CONSECUTIVE_FAILURES_BEFORE_WARN) {
        this.log.warn(
          `Stale-PR watcher has failed ${next} times in a row for PR ${session.pr.ref.pullRequestId} — continuing in background.`,
          { error: err instanceof Error ? err.message : String(err) },
        );
      }
    }
  }

  private notifyPanels(session: Session, latestHead: string): void {
    const payload: HostToRenderedView = {
      type: 'staleCommit',
      payload: { newSha: latestHead, oldSha: session.headSha },
    };
    for (const panel of session.openedEditors.values()) {
      try {
        void panel.webview.postMessage(payload);
      } catch (err) {
        this.log.warn('Failed to post staleCommit to panel.', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
}
