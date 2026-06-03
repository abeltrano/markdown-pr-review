// SPDX-License-Identifier: MIT
// ADO REST Client per design.md §3.2 + §4.1.1.
//
// Six endpoints:
//   1. getPullRequest
//   2. getChangedFiles
//   3. getFileContent
//   4. getThreads
//   5. createThread
//   6. getMergeBaseSha
// Plus the helper resolveRepositoryId (name -> GUID).
//
// Error handling per §4.1.1 table:
//   401 -> invalidate token, emit onTokenInvalid, throw (silent-retry in v0.4)
//   403/404 -> throw with surfaced reason
//   429 -> exponential backoff (1s, 2s, 4s + jitter, max 3 retries)
//   5xx -> single retry after 2s
//   Network -> throw "Cannot reach Azure DevOps"

import {
    AuthAcquisitionError,
    VsCodeAuthManager,
    type AuthManager
} from './auth-manager';
import { getLogger, redactAuthHeaders, type Logger } from './logger';
import { AdoNetworkError, AdoRestError } from './ado-errors';
import type {
    ChangedFile,
    LineOffset,
    PullRequest,
    PullRequestRef,
    Thread
} from './types';

// Hard cap on a single ADO REST request before we give up and surface a
// timeout error. Most calls finish in <2s; this exists so a stalled
// network or backend doesn't leave the rendered view spinning forever.
const FETCH_TIMEOUT_MS = 90_000;

const API_VERSION = '7.1';

export interface CreateThreadInput {
    filePath: string;
    rightFileStart: LineOffset;
    rightFileEnd: LineOffset;
    /** Full comment body (includes the auto-quote prefix from the controller). */
    content: string;
}

export interface AdoClient {
    getPullRequest(ref: PullRequestRef): Promise<PullRequest>;
    getChangedFiles(ref: PullRequestRef, sha: string): Promise<ChangedFile[]>;
    getFileContent(repoId: string, sha: string, path: string): Promise<string>;
    /** Variant that takes a full PR ref (preferred). */
    getFileContentByRef(ref: PullRequestRef, sha: string, path: string): Promise<string>;
    /** Returns null on 404 (file absent at the given sha) instead of throwing. */
    getFileContentOrNullByRef(
        ref: PullRequestRef,
        sha: string,
        path: string
    ): Promise<string | null>;
    getThreads(ref: PullRequestRef): Promise<Thread[]>;
    createThread(ref: PullRequestRef, input: CreateThreadInput): Promise<Thread>;
    getMergeBaseSha(ref: PullRequestRef): Promise<string>;
    resolveRepositoryId(ref: PullRequestRef): Promise<string>;
}

// Re-export ADO error classes for callers that import from this module.
export { AdoRestError, AdoNetworkError };

export class HttpAdoClient implements AdoClient {
    private readonly log: Logger;

    constructor(
        private readonly auth: AuthManager,
        log?: Logger
    ) {
        this.log = log ?? getLogger('AdoClient');
    }

    async getPullRequest(ref: PullRequestRef): Promise<PullRequest> {
        const repoId = await this.resolveRepositoryId(ref);
        const url = this.buildUrl(
            ref.organization,
            `${encodeURIComponent(ref.project)}/_apis/git/repositories/${repoId}/pullRequests/${ref.pullRequestId}`,
            { 'api-version': API_VERSION, includeWorkItemRefs: 'false' }
        );
        const raw = await this.requestJson<{
            pullRequestId: number;
            title: string;
            sourceRefName: string;
            targetRefName: string;
            lastMergeSourceCommit?: { commitId: string };
            status: string;
        }>('GET', url);
        return {
            ref: { ...ref, repositoryId: repoId },
            title: raw.title,
            sourceRefName: raw.sourceRefName,
            targetRefName: raw.targetRefName,
            lastMergeSourceCommit: { commitId: raw.lastMergeSourceCommit?.commitId ?? '' },
            status: (raw.status as PullRequest['status']) ?? 'active'
        };
    }

    async getChangedFiles(ref: PullRequestRef, _sha: string): Promise<ChangedFile[]> {
        // ADO returns changes per iteration. Fetch the latest iteration first,
        // then its changes.
        const repoId = await this.resolveRepositoryId(ref);
        const iterUrl = this.buildUrl(
            ref.organization,
            `${encodeURIComponent(ref.project)}/_apis/git/repositories/${repoId}/pullRequests/${ref.pullRequestId}/iterations`,
            { 'api-version': API_VERSION }
        );
        const iters = await this.requestJson<{
            value: Array<{ id: number; createdDate: string }>;
        }>('GET', iterUrl);
        if (!iters.value || iters.value.length === 0) {
            return [];
        }
        const latest = iters.value[iters.value.length - 1]!;
        const changesUrl = this.buildUrl(
            ref.organization,
            `${encodeURIComponent(ref.project)}/_apis/git/repositories/${repoId}/pullRequests/${ref.pullRequestId}/iterations/${latest.id}/changes`,
            { 'api-version': API_VERSION, '$top': '1000' }
        );
        const raw = await this.requestJson<{
            changeEntries: Array<{
                changeId?: number;
                item?: { path?: string; isFolder?: boolean };
                changeType?: string;
            }>;
        }>('GET', changesUrl);
        const out: ChangedFile[] = [];
        for (const entry of raw.changeEntries ?? []) {
            const path = entry.item?.path;
            if (!path || entry.item?.isFolder) {
                continue;
            }
            const ct = (entry.changeType ?? 'edit').toLowerCase();
            const changeType: ChangedFile['changeType'] =
                ct.includes('add') ? 'add' :
                ct.includes('delete') ? 'delete' :
                ct.includes('rename') ? 'rename' : 'edit';
            const lower = path.toLowerCase();
            const isMarkdown =
                lower.endsWith('.md') || lower.endsWith('.markdown') || lower.endsWith('.mdx');
            out.push({ filePath: path, changeType, isMarkdown });
        }
        return out;
    }

    async getFileContent(repoId: string, sha: string, path: string): Promise<string> {
        // Get raw file content at a specific commit.
        const url = this.buildUrl(
            /* org */ this.expectOrg(repoId),
            // The org isn't on the repoId path-wise; callers must pass the
            // PR ref's org. We adopted a 4-arg shape for clarity but this
            // overload is awkward — replaced below by a single-org context
            // tracked at the session level. Documented decision D-003.
            `_apis/git/repositories/${repoId}/items`,
            {
                path,
                'versionDescriptor.version': sha,
                'versionDescriptor.versionType': 'commit',
                'api-version': API_VERSION,
                includeContent: 'true',
                '$format': 'octetStream'
            }
        );
        return await this.requestText('GET', url);
    }

    async getThreads(ref: PullRequestRef): Promise<Thread[]> {
        const repoId = await this.resolveRepositoryId(ref);
        const url = this.buildUrl(
            ref.organization,
            `${encodeURIComponent(ref.project)}/_apis/git/repositories/${repoId}/pullRequests/${ref.pullRequestId}/threads`,
            { 'api-version': API_VERSION }
        );
        const raw = await this.requestJson<{ value: AdoRawThread[] }>('GET', url);
        return (raw.value ?? []).map(toThread);
    }

    async createThread(ref: PullRequestRef, input: CreateThreadInput): Promise<Thread> {
        const repoId = await this.resolveRepositoryId(ref);
        const url = this.buildUrl(
            ref.organization,
            `${encodeURIComponent(ref.project)}/_apis/git/repositories/${repoId}/pullRequests/${ref.pullRequestId}/threads`,
            { 'api-version': API_VERSION }
        );
        const body = {
            comments: [
                {
                    parentCommentId: 0,
                    content: input.content,
                    commentType: 1     // 1 = text per design.md §4.1.1
                }
            ],
            status: 1,                  // 1 = active
            threadContext: {
                filePath: input.filePath,
                rightFileStart: input.rightFileStart,
                rightFileEnd: input.rightFileEnd
            }
        };
        const raw = await this.requestJson<AdoRawThread>('POST', url, body);
        return toThread(raw);
    }

    async getMergeBaseSha(ref: PullRequestRef): Promise<string> {
        const repoId = await this.resolveRepositoryId(ref);
        const url = this.buildUrl(
            ref.organization,
            `${encodeURIComponent(ref.project)}/_apis/git/repositories/${repoId}/pullRequests/${ref.pullRequestId}/iterations`,
            { 'api-version': API_VERSION }
        );
        const iters = await this.requestJson<{
            value: Array<{ id: number; commonRefCommit?: { commitId?: string } }>;
        }>('GET', url);
        if (!iters.value || iters.value.length === 0) {
            return '';
        }
        const latest = iters.value[iters.value.length - 1]!;
        return latest.commonRefCommit?.commitId ?? '';
    }

    async resolveRepositoryId(ref: PullRequestRef): Promise<string> {
        if (ref.repositoryId && /^[0-9a-fA-F-]{36}$/.test(ref.repositoryId)) {
            return ref.repositoryId;
        }
        if (!ref.repositoryName) {
            throw new Error('Repository id and name both missing — cannot resolve.');
        }
        const url = this.buildUrl(
            ref.organization,
            `${encodeURIComponent(ref.project)}/_apis/git/repositories/${encodeURIComponent(ref.repositoryName)}`,
            { 'api-version': API_VERSION }
        );
        const raw = await this.requestJson<{ id: string }>('GET', url);
        return raw.id;
    }

    // -------------------------------------------------------------------
    // Internals
    // -------------------------------------------------------------------

    private buildUrl(
        org: string,
        path: string,
        params: Record<string, string>
    ): string {
        const base = `https://dev.azure.com/${encodeURIComponent(org)}/`;
        const url = new URL(path, base);
        for (const [k, v] of Object.entries(params)) {
            url.searchParams.set(k, v);
        }
        return url.toString();
    }

    private async requestJson<T>(method: string, url: string, body?: unknown): Promise<T> {
        const text = await this.requestText(method, url, body);
        if (!text) {
            return {} as T;
        }
        try {
            return JSON.parse(text) as T;
        } catch (err) {
            this.log.error('Failed to parse ADO response as JSON.', {
                url,
                method,
                bodyPreview: text.slice(0, 200)
            });
            throw err;
        }
    }

    private async requestText(method: string, url: string, body?: unknown): Promise<string> {
        const maxAttempts = 4;     // 1 initial + 3 retries for 429
        let attempt = 0;
        let lastError: unknown;
        let auth401Retries = 0;     // TASK-035: cap at 1 interactive retry per request
        while (attempt < maxAttempts) {
            attempt++;
            let token: string;
            try {
                token = await this.auth.getToken({ silent: auth401Retries === 0 });
            } catch (err) {
                // First-run case: no cached MSAL session exists, so silent
                // acquisition fails before any HTTP call has been made.
                // Fall back to interactive auth once so the user actually
                // gets a sign-in prompt. Subsequent retries reuse the now-
                // cached session.
                if (
                    err instanceof AuthAcquisitionError &&
                    err.kind === 'silent' &&
                    auth401Retries === 0
                ) {
                    this.log.info('No cached session; prompting for interactive sign-in.', { url });
                    token = await this.auth.getToken({ silent: false });
                } else {
                    throw err;
                }
            }
            const authHeader = VsCodeAuthManager.buildAuthHeader(
                token,
                (this.auth as VsCodeAuthManager).currentMode ?? 'msal'
            );
            const headers: Record<string, string> = {
                Authorization: authHeader,
                Accept: 'application/json;api-version=' + API_VERSION + ', text/plain'
            };
            let serializedBody: string | undefined;
            if (body !== undefined) {
                headers['Content-Type'] = 'application/json';
                serializedBody = JSON.stringify(body);
            }
            this.log.info(`${method} ${url}`, redactAuthHeaders({ attempt, method, url }));
            let response: Response;
            let bodyText: string;
            const controller = new AbortController();
            const timeoutHandle = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
            try {
                // The timeout covers BOTH header arrival (fetch) AND body
                // streaming (response.text/safeReadText). microsoft/OS's
                // /items endpoint will often return headers immediately and
                // then stall mid-stream; clearing the timer at fetch resolve
                // would leave us hanging on the body read.
                response = await fetch(url, {
                    method,
                    headers,
                    body: serializedBody,
                    signal: controller.signal
                });
                bodyText = response.ok
                    ? await response.text()
                    : await safeReadText(response);
            } catch (err) {
                const isTimeout = (err as { name?: string })?.name === 'AbortError';
                const wrapped = isTimeout
                    ? new Error(`Request timed out after ${FETCH_TIMEOUT_MS / 1000}s`)
                    : err;
                lastError = wrapped;
                this.log.warn(
                    isTimeout
                        ? `Request timed out (${FETCH_TIMEOUT_MS} ms) on attempt ${attempt}.`
                        : `Network error on attempt ${attempt}.`,
                    {
                        url,
                        method,
                        error: wrapped instanceof Error ? wrapped.message : String(wrapped)
                    }
                );
                if (attempt >= maxAttempts) {
                    throw new AdoNetworkError(url, wrapped);
                }
                await sleep(backoffMs(attempt));
                continue;
            } finally {
                clearTimeout(timeoutHandle);
            }
            if (response.ok) {
                return bodyText;
            }
            const safeBody = bodyText.length > 1000 ? bodyText.slice(0, 1000) + '...[truncated]' : bodyText;
            if (response.status === 401) {
                (this.auth as VsCodeAuthManager).invalidateToken?.();
                // TASK-035 / REQ-AUTH-002 AC-2: silent retry once. On the second
                // 401, surface the error to the user. The retry uses
                // silent:false so the auth provider can prompt for fresh
                // credentials (modal MSAL dialog or PAT entry).
                if (auth401Retries === 0) {
                    auth401Retries++;
                    attempt--; // not counted toward 429/network attempts
                    this.log.warn('401 received; retrying once with interactive auth.', { url });
                    continue;
                }
                throw new AdoRestError(401, url, safeBody, 'Unauthorized — token may be invalid or scope rejected.');
            }
            if (response.status === 403) {
                throw new AdoRestError(403, url, safeBody, 'Forbidden — your account may not have permission for this repository.');
            }
            if (response.status === 404) {
                throw new AdoRestError(404, url, safeBody, 'Not found — check the PR URL or your access.');
            }
            if (response.status === 429 && attempt < maxAttempts) {
                const retryAfterHeader = response.headers.get('Retry-After');
                const wait = retryAfterHeader ? Number.parseInt(retryAfterHeader, 10) * 1000 : backoffMs(attempt);
                this.log.warn(`429 rate-limited; backing off ${wait} ms.`, { attempt });
                await sleep(wait);
                continue;
            }
            if (response.status >= 500 && response.status < 600 && attempt === 1) {
                this.log.warn(`5xx (${response.status}); single retry after 2s.`);
                await sleep(2000);
                continue;
            }
            throw new AdoRestError(
                response.status,
                url,
                safeBody,
                `ADO returned HTTP ${response.status}: ${response.statusText}`
            );
        }
        // Loop fell through without returning — must be a network error retry exhaustion.
        throw new AdoNetworkError(url, lastError ?? new Error('Exhausted retries'));
    }

    /**
     * Org is not encoded in the bare repository id. This helper is a holdover
     * from an earlier signature; the getFileContent path now expects the
     * caller to thread org through via the session. Documented as D-003.
     * For now we infer it from the most recent authoritative call (NOT YET
     * — this is a temporary stub; real wiring goes through SessionManager
     * which holds the active org).
     */
    private expectOrg(_repoId: string): string {
        throw new Error('HttpAdoClient.getFileContent requires the caller to pass the org explicitly. Use getFileContentByRef instead.');
    }

    /** Replacement for getFileContent that takes a PullRequestRef directly. */
    async getFileContentByRef(
        ref: PullRequestRef,
        sha: string,
        path: string
    ): Promise<string> {
        const repoId = await this.resolveRepositoryId(ref);
        // Use the JSON-envelope form of /items (no $format=octetStream).
        // On large ADO mono-repos like microsoft/OS the octetStream variant
        // returns headers immediately but stalls mid-stream; the JSON form
        // is served from a different code path and completes reliably.
        const url = this.buildUrl(
            ref.organization,
            `${encodeURIComponent(ref.project)}/_apis/git/repositories/${repoId}/items`,
            {
                path,
                'versionDescriptor.version': sha,
                'versionDescriptor.versionType': 'commit',
                'api-version': API_VERSION,
                includeContent: 'true'
            }
        );
        const raw = await this.requestJson<{ content?: string }>('GET', url);
        return raw.content ?? '';
    }

    /**
     * Same as getFileContentByRef but returns null when the server replies
     * 404 (file absent at this sha — common for the merge-base of an
     * added file, per REQ-DIFF-002 AC-2).
     */
    async getFileContentOrNullByRef(
        ref: PullRequestRef,
        sha: string,
        path: string
    ): Promise<string | null> {
        try {
            return await this.getFileContentByRef(ref, sha, path);
        } catch (err) {
            if (err instanceof AdoRestError && err.status === 404) {
                return null;
            }
            throw err;
        }
    }
}

// ---------------------------------------------------------------------------
// Wire helpers
// ---------------------------------------------------------------------------

interface AdoRawThread {
    id: number;
    status?: string;
    publishedDate?: string;
    comments?: Array<{
        id: number;
        author?: { displayName?: string; uniqueName?: string };
        content?: string;
        publishedDate?: string;
        commentType?: string;
    }>;
    threadContext?: {
        filePath?: string;
        rightFileStart?: { line: number; offset: number };
        rightFileEnd?: { line: number; offset: number };
    };
}

function toThread(raw: AdoRawThread): Thread {
    return {
        id: raw.id,
        status: (raw.status as Thread['status']) ?? 'unknown',
        publishedDate: raw.publishedDate ?? '',
        comments: (raw.comments ?? []).map(c => ({
            id: c.id,
            author: {
                displayName: c.author?.displayName ?? '',
                uniqueName: c.author?.uniqueName ?? ''
            },
            content: c.content ?? '',
            publishedDate: c.publishedDate ?? '',
            commentType: (c.commentType as 'text' | 'codeChange' | 'system') ?? 'text'
        })),
        threadContext: raw.threadContext
            ? {
                  filePath: raw.threadContext.filePath ?? '',
                  rightFileStart: raw.threadContext.rightFileStart ?? null,
                  rightFileEnd: raw.threadContext.rightFileEnd ?? null
              }
            : null
    };
}

async function safeReadText(response: Response): Promise<string> {
    try {
        return await response.text();
    } catch {
        return '';
    }
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function backoffMs(attempt: number): number {
    const base = Math.pow(2, attempt - 1) * 1000;
    const jitter = Math.floor(Math.random() * 500);
    return base + jitter;
}

// Surface the AuthAcquisitionError so callers can pattern-match if needed.
export { AuthAcquisitionError };
