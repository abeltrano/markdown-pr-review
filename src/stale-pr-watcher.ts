// SPDX-License-Identifier: MIT
// Stale-PR Watcher per design.md §3.2 (TASK-034 / REQ-ERR-002).
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
    private session: Session | null = null;
    private timer: NodeJS.Timeout | null = null;
    private consecutiveFailures = 0;
    private stopped = true;

    constructor(private readonly adoClient: AdoClient, log?: Logger) {
        this.log = log ?? getLogger('StalePRWatcher');
    }

    start(session: Session): void {
        this.stop();
        this.session = session;
        this.consecutiveFailures = 0;
        this.stopped = false;
        const intervalMs = this.resolvePollSeconds() * 1000;
        this.timer = setInterval(() => void this.tick(), intervalMs);
        this.log.info('Stale-PR watcher started.', { intervalMs });
    }

    stop(): void {
        this.stopped = true;
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        this.session = null;
    }

    dispose(): void {
        this.stop();
    }

    private resolvePollSeconds(): number {
        const cfg = vscode.workspace.getConfiguration('adoMdReview');
        const raw = cfg.get<number>('staleCommitPollSeconds', DEFAULT_POLL_SECONDS);
        const n = Number.isFinite(raw) ? Math.trunc(raw) : DEFAULT_POLL_SECONDS;
        return Math.min(MAX_POLL_SECONDS, Math.max(MIN_POLL_SECONDS, n));
    }

    private async tick(): Promise<void> {
        const session = this.session;
        if (!session || this.stopped) return;
        try {
            const pr = await this.adoClient.getPullRequest(session.pr.ref);
            this.consecutiveFailures = 0;
            const latestHead = pr.lastMergeSourceCommit.commitId;
            if (latestHead && latestHead !== session.headSha) {
                this.log.info('Detected stale head commit.', {
                    oldHead: session.headSha,
                    newHead: latestHead
                });
                this.notifyPanels(session, latestHead);
            }
        } catch (err) {
            this.consecutiveFailures++;
            if (this.consecutiveFailures === MAX_CONSECUTIVE_FAILURES_BEFORE_WARN) {
                this.log.warn(
                    `Stale-PR watcher has failed ${this.consecutiveFailures} times in a row — continuing in background.`,
                    { error: err instanceof Error ? err.message : String(err) }
                );
            }
        }
    }

    private notifyPanels(session: Session, latestHead: string): void {
        const payload: HostToRenderedView = {
            type: 'staleCommit',
            payload: { newSha: latestHead, oldSha: session.headSha }
        };
        for (const panel of session.openedEditors.values()) {
            try {
                void panel.webview.postMessage(payload);
            } catch (err) {
                this.log.warn('Failed to post staleCommit to panel.', {
                    error: err instanceof Error ? err.message : String(err)
                });
            }
        }
    }
}
