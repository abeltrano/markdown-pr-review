// SPDX-License-Identifier: MIT
// SessionManager per design.md §3.2.
//
// Owns the lifecycle of a Session and bridges:
//   - PR loading (parser → AdoClient → first set of files/threads)
//   - File content caching (filePath → raw markdown @ headSha)
//   - WebviewPanel registration for opened adopr:// URIs
//   - Routing webview ↔ comment-controller ↔ ado-client

import * as vscode from 'vscode';
import { HttpAdoClient, type AdoClient } from './ado-client';
import { CommentController } from './comment-controller';
import type { CommentInputViewProvider } from './comment-input-view-provider';
import { getLogger } from './logger';
import { render as renderMarkdown } from './renderer';
import { annotateBlockDiff } from './renderer/diff-annotator';
import { parseAdoprUri } from './adopr-uri';
import { buildRenderedViewCsp, generateNonce } from './views/csp';
import { surfaceError, toErrorPayload } from './error-utils';
import type { AuthManager } from './auth-manager';
import type {
    HostToRenderedView,
    PostThreadRequest,
    PullRequestRef,
    RenderedViewInitPayload,
    RenderedViewToHost,
    Session,
    Thread
} from './types';

export class SessionManager {
    private readonly log = getLogger('SessionManager');
    private readonly _onSessionChanged = new vscode.EventEmitter<Session | null>();
    readonly onSessionChanged = this._onSessionChanged.event;
    private readonly _onThreadsChanged = new vscode.EventEmitter<void>();
    readonly onThreadsChanged = this._onThreadsChanged.event;

    private activeSession: Session | null = null;
    private adoClient: AdoClient;
    private commentController: CommentController | null = null;
    private inputView: CommentInputViewProvider | null = null;
    private disposables: vscode.Disposable[] = [];

    constructor(
        private readonly context: vscode.ExtensionContext,
        auth: AuthManager
    ) {
        this.adoClient = new HttpAdoClient(auth);
    }

    setInputView(view: CommentInputViewProvider): void {
        this.inputView = view;
    }

    getActiveSession(): Session | null {
        return this.activeSession;
    }

    /** Internal accessor — used by infrastructure that needs to make REST calls. */
    getAdoClient(): AdoClient {
        return this.adoClient;
    }

    async openPullRequest(ref: PullRequestRef): Promise<void> {
        this.log.info('Opening PR', { ref });
        // Tear down any prior session.
        await this.disposeSession();
        // Resolve repo GUID if needed.
        const repoId = await this.adoClient.resolveRepositoryId(ref);
        const fullRef: PullRequestRef = { ...ref, repositoryId: repoId };

        const pr = await this.adoClient.getPullRequest(fullRef);
        const headSha = pr.lastMergeSourceCommit.commitId;
        const baseSha = await this.adoClient.getMergeBaseSha(fullRef);
        const files = await this.adoClient.getChangedFiles(fullRef, headSha);
        const threads = await this.adoClient.getThreads(fullRef);

        const session: Session = {
            id: `${fullRef.organization}-${fullRef.project}-${fullRef.pullRequestId}`,
            pr,
            headSha,
            baseSha,
            files,
            fileContentCache: new Map(),
            openedEditors: new Map(),
            threads,
            activeDraft: null,
            dispose: () => { /* per-session resources cleared in disposeSession() */ }
        };
        this.activeSession = session;

        // Wire the comment controller for this session.
        this.commentController = new CommentController({
            pullRequestRef: fullRef,
            adoClient: this.adoClient,
            inputView: this.inputView!,
            fileContentResolver: (filePath) => this.getFileContent(filePath),
            onThreadPosted: (thread) => this.recordPostedThread(thread)
        });

        this._onSessionChanged.fire(session);
        this.log.info(`PR loaded — ${pr.title} (${files.length} files, ${threads.length} threads)`);
    }

    async getFileContent(filePath: string): Promise<string> {
        const session = this.requireSession();
        const cached = session.fileContentCache.get(filePath);
        if (cached !== undefined) return cached;
        const ref = session.pr.ref;
        const client = this.adoClient as HttpAdoClient;
        const text = await client.getFileContentByRef(ref, session.headSha, filePath);
        session.fileContentCache.set(filePath, text);
        return text;
    }

    async attachRenderedView(uri: vscode.Uri, panel: vscode.WebviewPanel): Promise<void> {
        const session = this.requireSession();
        const parsed = parseAdoprUri(uri.toString());
        const filePath = parsed.filePath;
        session.openedEditors.set(uri.toString(), panel);
        panel.onDidDispose(() => {
            session.openedEditors.delete(uri.toString());
        });

        // Build HTML envelope for the panel.
        const distRoot = vscode.Uri.joinPath(this.context.extensionUri, 'out');
        const nonce = generateNonce();
        const csp = buildRenderedViewCsp({ nonce, webview: panel.webview });
        const scriptUri = panel.webview.asWebviewUri(
            vscode.Uri.joinPath(distRoot, 'views', 'rendered-view', 'main.js')
        );
        panel.webview.html = renderedViewHtml({ csp, nonce, scriptUri: scriptUri.toString() });

        panel.webview.onDidReceiveMessage((msg: RenderedViewToHost) => {
            void this.handleRenderedViewMessage(uri.toString(), msg);
        });

        try {
            const initPayload = await this.buildInitPayload(filePath);
            await panel.webview.postMessage({ type: 'init', payload: initPayload } satisfies HostToRenderedView);
        } catch (err) {
            this.log.error('Failed to build init payload', {
                filePath,
                error: err instanceof Error ? err.message : String(err)
            });
            const payload = toErrorPayload(err);
            void panel.webview.postMessage({ type: 'error', payload } satisfies HostToRenderedView);
            void surfaceError(err, `Open ${filePath}`);
        }
    }

    private async buildInitPayload(filePath: string): Promise<RenderedViewInitPayload> {
        const session = this.requireSession();
        const markdown = await this.getFileContent(filePath);
        const diffAnnotations = await this.computeDiffAnnotations(filePath, markdown);
        const result = renderMarkdown({ markdown, diffAnnotations });
        return {
            sessionId: session.id,
            filePath,
            pullRequest: {
                id: session.pr.ref.pullRequestId,
                title: session.pr.title,
                sourceRef: session.pr.sourceRefName,
                targetRef: session.pr.targetRefName
            },
            headSha: session.headSha,
            baseSha: session.baseSha,
            fileContent: { html: result.html, sourceMap: result.sourceMap },
            threads: session.threads.filter(t => t.threadContext?.filePath === filePath),
            diffAnnotations,
            protocolVersion: 1
        };
    }

    private async computeDiffAnnotations(filePath: string, headMarkdown: string) {
        const session = this.requireSession();
        if (!session.baseSha) {
            return [];
        }
        try {
            const baseMarkdown = await this.adoClient.getFileContentOrNullByRef(
                session.pr.ref,
                session.baseSha,
                filePath
            );
            return annotateBlockDiff(headMarkdown, baseMarkdown);
        } catch (err) {
            this.log.warn('Failed to compute diff annotations', {
                filePath,
                error: (err as Error).message
            });
            return [];
        }
    }

    private async handleRenderedViewMessage(uriStr: string, msg: RenderedViewToHost): Promise<void> {
        switch (msg.type) {
            case 'ready':
                // No-op: init was already posted by attachRenderedView.
                break;
            case 'selectionMade':
                if (!this.commentController) return;
                await this.commentController.handleSelection(msg.payload, uriStr);
                break;
            case 'refreshThreads':
                await this.refreshThreads();
                break;
            case 'refreshToHead':
                this.log.info('Refresh-to-head requested.');
                try {
                    const session = this.activeSession;
                    if (session) {
                        await this.openPullRequest(session.pr.ref);
                    }
                } catch (err) {
                    await surfaceError(err, 'Refresh to head');
                }
                break;
            case 'log':
                this.log[msg.payload.level](msg.payload.message, msg.payload.context);
                break;
        }
    }

    async refreshThreads(): Promise<void> {
        const session = this.requireSession();
        const threads = await this.adoClient.getThreads(session.pr.ref);
        session.threads = threads;
        this._onThreadsChanged.fire();
        // Push to every open rendered view.
        for (const [_uri, panel] of session.openedEditors) {
            void panel.webview.postMessage({
                type: 'threadsRefreshed',
                payload: { threads: threads.filter(t => t.threadContext?.filePath === parseAdoprUri(_uri).filePath) }
            } satisfies HostToRenderedView);
        }
    }

    async handlePostThread(req: PostThreadRequest): Promise<void> {
        if (!this.commentController) return;
        await this.commentController.handlePostThread(req);
    }

    handleCancelDraft(): void {
        if (!this.commentController) return;
        this.commentController.handleCancelDraft();
    }

    private recordPostedThread(thread: Thread): void {
        const session = this.requireSession();
        session.threads.push(thread);
        this._onThreadsChanged.fire();
        // Push to the originating panel (and any others showing the same file).
        const filePath = thread.threadContext?.filePath;
        for (const [uri, panel] of session.openedEditors) {
            const parsed = parseAdoprUri(uri);
            if (parsed.filePath === filePath) {
                void panel.webview.postMessage({
                    type: 'threadCreated',
                    payload: { thread }
                } satisfies HostToRenderedView);
            }
        }
    }

    private requireSession(): Session {
        if (!this.activeSession) {
            throw new Error('No active session. Open a pull request first.');
        }
        return this.activeSession;
    }

    async disposeSession(): Promise<void> {
        if (!this.activeSession) return;
        for (const panel of this.activeSession.openedEditors.values()) {
            try { panel.dispose(); } catch { /* ignore */ }
        }
        this.activeSession = null;
        this.commentController = null;
        this._onSessionChanged.fire(null);
    }

    dispose(): void {
        void this.disposeSession();
        this._onSessionChanged.dispose();
        this._onThreadsChanged.dispose();
        for (const d of this.disposables) {
            try { d.dispose(); } catch { /* ignore */ }
        }
    }
}

function renderedViewHtml(opts: { csp: string; nonce: string; scriptUri: string }): string {
    return /* html */ `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="${opts.csp}">
    <title>ADO MD Review</title>
    <style>
        body { font-family: var(--vscode-editor-font-family); margin: 0; padding: 0; }
        #pr-banner { padding: 6px 12px; background: var(--vscode-editorWidget-background); border-bottom: 1px solid var(--vscode-editorWidget-border); font-size: 0.85em; }
        #content-wrapper { position: relative; padding: 16px 24px; max-width: 900px; margin: 0 auto; }
        article#content { line-height: 1.5; color: var(--vscode-editor-foreground); }
        article#content pre { background: var(--vscode-textCodeBlock-background); padding: 8px; overflow-x: auto; }
        article#content code { background: var(--vscode-textCodeBlock-background); padding: 1px 4px; }
        article#content table { border-collapse: collapse; margin: 8px 0; }
        article#content th, article#content td { border: 1px solid var(--vscode-editorWidget-border); padding: 4px 8px; }
        article#content blockquote { border-left: 3px solid var(--vscode-editorWidget-border); padding-left: 12px; opacity: 0.85; }
        .ado-thread-marker {
            display: inline-flex; align-items: center; justify-content: center;
            margin-left: 6px; padding: 0 4px;
            background: var(--vscode-badge-background, transparent);
            color: var(--vscode-badge-foreground, inherit);
            border: 1px solid var(--vscode-editorWidget-border);
            border-radius: 10px;
            cursor: pointer; font-size: 0.85em; line-height: 1.2;
            vertical-align: baseline;
        }
        .ado-thread-marker[aria-expanded="true"] {
            background: var(--vscode-list-activeSelectionBackground);
            color: var(--vscode-list-activeSelectionForeground);
        }
        .ado-thread-marker:focus { outline: 1px solid var(--vscode-focusBorder); }
        .ado-thread-popover {
            min-width: 260px; max-width: 480px; max-height: 60vh; overflow: auto;
            background: var(--vscode-editorHoverWidget-background);
            color: var(--vscode-editorHoverWidget-foreground);
            border: 1px solid var(--vscode-editorHoverWidget-border);
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            border-radius: 4px; padding: 8px 12px; font-size: 0.9em;
            z-index: 100;
        }
        .ado-thread-popover__header {
            display: flex; justify-content: space-between; align-items: center;
            font-weight: 600; padding-bottom: 6px;
            border-bottom: 1px solid var(--vscode-editorWidget-border);
            margin-bottom: 6px;
        }
        .ado-thread-popover__close {
            background: none; border: 0; color: inherit; cursor: pointer;
            font-size: 1.2em; padding: 0 4px;
        }
        .ado-thread-popover__comment {
            padding: 4px 0;
            border-bottom: 1px dashed var(--vscode-editorWidget-border);
        }
        .ado-thread-popover__comment:last-child { border-bottom: 0; }
        .ado-thread-popover__author {
            font-size: 0.85em; opacity: 0.8; margin-bottom: 2px;
        }
        .ado-thread-popover__body {
            white-space: pre-wrap; word-wrap: break-word;
        }
        /* Diff gutter bars (TASK-031 / REQ-DIFF-001). */
        article#content [data-source-line-start] { position: relative; }
        article#content [data-diff-state="added"] {
            border-left: 3px solid var(--vscode-diffEditor-insertedTextBackground, #2cbe4e);
            padding-left: 8px;
            margin-left: -11px;
        }
        article#content [data-diff-state="modified"] {
            border-left: 3px solid var(--vscode-editorInfo-foreground, #3794ff);
            padding-left: 8px;
            margin-left: -11px;
        }
        article#content [data-diff-state="context-of-deletion"] {
            border-left: 3px dashed var(--vscode-diffEditor-removedTextBackground, #cb2431);
            padding-left: 8px;
            margin-left: -11px;
            cursor: help;
        }
        article#content [data-diff-state="context-of-deletion"]::before {
            content: "↑ deleted content (hover to view)";
            display: block;
            font-size: 0.75em;
            opacity: 0.7;
            font-style: italic;
            margin-bottom: 4px;
        }
        article#content [data-diff-state="context-of-deletion"][data-diff-deleted]:hover::after {
            content: attr(data-diff-deleted);
            position: absolute;
            left: 12px;
            top: 100%;
            white-space: pre-wrap;
            background: var(--vscode-editorHoverWidget-background);
            color: var(--vscode-editorHoverWidget-foreground);
            border: 1px solid var(--vscode-editorHoverWidget-border);
            padding: 6px 10px;
            border-radius: 4px;
            font-size: 0.85em;
            max-width: 480px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.2);
            z-index: 90;
        }
        .banner { padding: 6px 12px; }
        .banner.warn { background: var(--vscode-inputValidation-warningBackground); }
        .banner.error { background: var(--vscode-inputValidation-errorBackground); color: var(--vscode-inputValidation-errorForeground); }
        ::selection { background: var(--vscode-editor-selectionBackground); color: var(--vscode-editor-selectionForeground); }
    </style>
</head>
<body>
    <div id="pr-banner">Loading…</div>
    <div id="content-wrapper">
        <article id="content"></article>
    </div>
    <script nonce="${opts.nonce}" src="${opts.scriptUri}"></script>
</body>
</html>`;
}
