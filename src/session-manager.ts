// SPDX-License-Identifier: MIT
// SessionManager per design.md §3.2.
//
// Owns the lifecycle of a Session and bridges:
//   - PR loading (parser → AdoClient → first set of files/threads)
//   - File content caching (filePath → raw markdown @ headSha)
//   - WebviewPanel registration for opened mdpr:// URIs
//   - Routing webview ↔ comment-controller ↔ ado-client

import * as vscode from 'vscode';
import * as path from 'path';
import { HttpAdoClient, type AdoClient } from './ado-client';
import { CommentController } from './comment-controller';
import type { CommentInputViewProvider } from './comment-input-view-provider';
import { getLogger } from './logger';
import { render as renderMarkdown } from './renderer';
import { annotateBlockDiff } from './renderer/diff-annotator';
import { parseMdprUri } from './mdpr-uri';
import {
  pullRequestRefFromMdprParts,
  sessionKeyFromMdprParts,
} from './session-restore';
import {
  RECENT_PULL_REQUESTS_STATE_KEY,
  addRecentPullRequest,
  parseStoredRecentPullRequests,
  recentPullRequestFromPullRequest,
} from './recent-prs';
import { buildRenderedViewCsp, generateNonce } from './views/csp';
import { surfaceError, toErrorPayload } from './error-utils';
import type { AuthManager } from './auth-manager';
import type {
  HostToRenderedView,
  PostThreadRequest,
  PullRequest,
  PullRequestRef,
  RenderedViewInitPayload,
  RenderedViewToHost,
  Session,
  Thread,
} from './types';

export class SessionManager {
  private readonly log = getLogger('SessionManager');
  private readonly _onSessionChanged =
    new vscode.EventEmitter<Session | null>();
  readonly onSessionChanged = this._onSessionChanged.event;
  private readonly _onThreadsChanged = new vscode.EventEmitter<void>();
  readonly onThreadsChanged = this._onThreadsChanged.event;

  // Open PR sessions keyed by session key (org/project/repoId/prId). Multiple
  // PRs can be open at once; each mdpr:// rendered editor resolves against its
  // own session by URI, independent of which PR is currently "active".
  private readonly sessions = new Map<string, Session>();
  private readonly commentControllers = new Map<string, CommentController>();
  private activeSessionKey: string | null = null;
  // Session key of the PR whose selection currently populates the shared
  // comment-input sidebar, so Post/Cancel route to the right PR regardless
  // of which session is active.
  private activeDraftKey: string | null = null;
  private adoClient: AdoClient;
  private inputView: CommentInputViewProvider | null = null;
  private disposables: vscode.Disposable[] = [];
  private readonly pendingSessionRestores = new Map<string, Promise<void>>();
  // Per-webview ready signal: resolves when the webview's script has
  // attached its `message` listener and posted `ready`. We MUST wait on
  // this before postMessage(init), otherwise the very first message is
  // delivered to a webview iframe that has no handler yet and gets lost.
  private webviewReady = new Map<
    string,
    { promise: Promise<void>; resolve: () => void }
  >();

  constructor(
    private readonly context: vscode.ExtensionContext,
    auth: AuthManager,
  ) {
    this.adoClient = new HttpAdoClient(auth);
    // Live-refresh open rendered-view panels when user-controllable
    // markdown styling changes. We re-resolve the markdown.styles
    // entries and post a 'restyle' message to each open webview so
    // the page updates without a full reload (preserves scroll
    // position and thread-popover state).
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (
          e.affectsConfiguration('markdown.styles') ||
          e.affectsConfiguration('markdown.preview')
        ) {
          this.restyleAllOpenPanels();
        }
      }),
    );
  }

  setInputView(view: CommentInputViewProvider): void {
    this.inputView = view;
  }

  getActiveSession(): Session | null {
    return this.activeSessionKey
      ? (this.sessions.get(this.activeSessionKey) ?? null)
      : null;
  }

  /** Internal accessor — used by infrastructure that needs to make REST calls. */
  getAdoClient(): AdoClient {
    return this.adoClient;
  }

  /** Session for an mdpr:// URI (by PR identity), or null if not open. */
  getSessionForUri(uriStr: string): Session | null {
    const key = this.keyForUri(uriStr);
    return key ? (this.sessions.get(key) ?? null) : null;
  }

  /** All currently open PR sessions, in open (insertion) order. */
  getOpenSessions(): Session[] {
    return [...this.sessions.values()];
  }

  /** True when the given session is the currently active one. */
  isActiveSession(session: Session): boolean {
    return (
      this.activeSessionKey != null &&
      this.sessions.get(this.activeSessionKey) === session
    );
  }

  /**
   * Make the session for an mdpr:// URI active so the active PR follows the
   * focused rendered-view editor tab. No-op when that PR is not open or is
   * already active.
   */
  setActiveByUri(uriStr: string): void {
    const key = this.keyForUri(uriStr);
    if (!key || !this.sessions.has(key) || this.activeSessionKey === key)
      return;
    this.activeSessionKey = key;
    this._onSessionChanged.fire(this.getActiveSession());
  }

  /** Close (dispose) the session for a given PR ref, if it is open. */
  async closePullRequestByRef(ref: PullRequestRef): Promise<void> {
    await this.disposeSession(this.keyForRef(ref));
  }

  private keyForRef(ref: PullRequestRef): string {
    return sessionKeyFromMdprParts({
      organization: ref.organization,
      project: ref.project,
      repositoryId: ref.repositoryId,
      pullRequestId: ref.pullRequestId,
    });
  }

  private keyForUri(uriStr: string): string | null {
    try {
      return sessionKeyFromMdprParts(parseMdprUri(uriStr));
    } catch {
      return null;
    }
  }

  async openPullRequest(ref: PullRequestRef): Promise<void> {
    this.log.info('Opening PR', { ref });
    // Resolve repo GUID if needed.
    const repoId = await this.adoClient.resolveRepositoryId(ref);
    const fullRef: PullRequestRef = { ...ref, repositoryId: repoId };
    const key = this.keyForRef(fullRef);
    // Re-opening a PR that is already open reloads it (e.g. refresh-to-head):
    // dispose just that one session, leaving any other open PRs intact.
    if (this.sessions.has(key)) {
      await this.disposeSession(key);
    }

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
      dispose: () => {
        /* per-session resources cleared in disposeSession() */
      },
    };
    this.sessions.set(key, session);

    // Wire a comment controller bound to THIS session's PR ref and a
    // session-scoped file-content resolver, so comments and content fetches
    // always target the right PR regardless of which session is active.
    this.commentControllers.set(
      key,
      new CommentController({
        pullRequestRef: fullRef,
        adoClient: this.adoClient,
        inputView: this.inputView!,
        fileContentResolver: (filePath) =>
          this.getFileContentForSession(session, filePath),
        onThreadPosted: (thread) => this.recordPostedThread(session, thread),
      }),
    );

    this.activeSessionKey = key;
    await this.recordRecentPullRequest(pr);
    this._onSessionChanged.fire(session);
    this.log.info(
      `PR loaded — ${pr.title} (${files.length} files, ${threads.length} threads)`,
    );
  }

  async getFileContentForSession(
    session: Session,
    filePath: string,
  ): Promise<string> {
    const cached = session.fileContentCache.get(filePath);
    if (cached !== undefined) return cached;
    const ref = session.pr.ref;
    const client = this.adoClient as HttpAdoClient;
    const text = await client.getFileContentByRef(
      ref,
      session.headSha,
      filePath,
    );
    session.fileContentCache.set(filePath, text);
    return text;
  }

  async attachRenderedView(
    uri: vscode.Uri,
    panel: vscode.WebviewPanel,
  ): Promise<void> {
    const parsed = parseMdprUri(uri.toString());
    try {
      await this.ensureSessionForRenderedView(parsed);
    } catch (err) {
      this.log.error('Failed to restore session for rendered view.', {
        filePath: parsed.filePath,
        error: err instanceof Error ? err.message : String(err),
      });
      await surfaceError(err, `Restore ${parsed.filePath}`);
      throw err;
    }
    const session = this.getSessionForUri(uri.toString());
    if (!session) {
      throw new Error('No session for rendered view after restore.');
    }
    const filePath = parsed.filePath;
    const uriKey = uri.toString();
    session.openedEditors.set(uriKey, panel);

    // Create the ready-signal deferred BEFORE setting webview.html so
    // the 'ready' message can never arrive before the deferred exists.
    let resolveReady!: () => void;
    let rejectReady!: (err: Error) => void;
    const readyPromise = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    this.webviewReady.set(uriKey, {
      promise: readyPromise,
      resolve: resolveReady,
    });

    panel.onDidDispose(() => {
      session.openedEditors.delete(uriKey);
      this.webviewReady.delete(uriKey);
      // Unblock any pending await on readyPromise so attachRenderedView
      // can complete (the panel is gone — there's nothing to render).
      rejectReady(new Error('Webview disposed before ready'));
    });

    // Build HTML envelope for the panel.
    const distRoot = vscode.Uri.joinPath(this.context.extensionUri, 'out');
    const userStyles = this.resolveUserStyles(panel.webview);
    const builtinStyles = this.resolveBuiltinMarkdownStyles(panel.webview);
    // Re-set the webview options so user-configured markdown.styles
    // file paths AND the built-in markdown extension's media dir are
    // reachable via the webview resource scheme. The CustomEditorProvider
    // sets a baseline (enableScripts + distRoot); this overrides with
    // the union. Must happen before we assign webview.html so the
    // resource scheme covers every <link> tag emitted there.
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        distRoot,
        ...builtinStyles.roots,
        ...userStyles.roots,
      ],
    };
    const nonce = generateNonce();
    const csp = buildRenderedViewCsp({ nonce, webview: panel.webview });
    const scriptUri = panel.webview.asWebviewUri(
      vscode.Uri.joinPath(distRoot, 'views', 'rendered-view', 'main.js'),
    );

    // Register the message handler BEFORE setting webview.html. The
    // setter kicks off iframe creation + script load asynchronously,
    // and main.ts may post 'ready' before this turn yields control —
    // any message arriving without an onDidReceiveMessage handler is
    // dropped silently. (Observed empirically: a missed 'ready'
    // wedges attachRenderedView forever on readyPromise.)
    panel.webview.onDidReceiveMessage((msg: RenderedViewToHost) => {
      void this.handleRenderedViewMessage(uriKey, msg);
    });

    panel.webview.html = renderedViewHtml({
      csp,
      nonce,
      scriptUri: scriptUri.toString(),
      codiconCssUri: panel.webview
        .asWebviewUri(
          vscode.Uri.joinPath(
            this.context.extensionUri,
            'out',
            'codicons',
            'codicon.css',
          ),
        )
        .toString(),
      previewStyle: readMarkdownPreviewStyle(),
      builtinStyleUris: builtinStyles.uris,
      userStyleUris: userStyles.uris,
    });

    // Kick off head + base fetches in parallel so the base fetch can
    // overlap network latency with the head fetch + initial render.
    const headPromise = this.getFileContentForSession(session, filePath);
    const basePromise: Promise<string | null> = session.baseSha
      ? this.adoClient
          .getFileContentOrNullByRef(session.pr.ref, session.baseSha, filePath)
          .catch((err) => {
            this.log.warn('Base fetch failed; diff annotations skipped.', {
              filePath,
              error: err instanceof Error ? err.message : String(err),
            });
            return null;
          })
      : Promise.resolve(null);

    try {
      // Phase 1: render the head markdown without diff bars and post
      // init so the user sees rendered content the moment head arrives.
      const headStartedAt = Date.now();
      const headMarkdown = await headPromise;
      this.log.info('Head markdown fetched.', {
        filePath,
        ms: Date.now() - headStartedAt,
        markdownChars: headMarkdown.length,
      });
      const renderStartedAt = Date.now();
      const initRender = renderMarkdown({
        markdown: headMarkdown,
        diffAnnotations: [],
      });
      this.log.info('Initial render complete.', {
        filePath,
        ms: Date.now() - renderStartedAt,
        htmlChars: initRender.html.length,
        sourceMapEntries: initRender.sourceMap.length,
      });
      const initPayload: RenderedViewInitPayload = {
        sessionId: session.id,
        filePath,
        pullRequest: {
          id: session.pr.ref.pullRequestId,
          title: session.pr.title,
          sourceRef: session.pr.sourceRefName,
          targetRef: session.pr.targetRefName,
        },
        headSha: session.headSha,
        baseSha: session.baseSha,
        fileContent: { html: initRender.html, sourceMap: initRender.sourceMap },
        threads: session.threads.filter(
          (t) => t.threadContext?.filePath === filePath,
        ),
        diffAnnotations: [],
        protocolVersion: 1,
      };
      // Block on the webview's 'ready' signal. If the message listener
      // is not yet attached when we postMessage, the event is silently
      // dropped (no DOM listener => no handler runs). Always wait.
      // Safety watchdog: if 'ready' never arrives (e.g., main.ts
      // crashed at load), proceed after 5s so the user still gets
      // SOMETHING — postMessage may end up dropped but they will see
      // either rendered content or the unchanged Loading… banner
      // instead of an apparently-frozen tab.
      const waitForReadyStart = Date.now();
      const READY_WATCHDOG_MS = 5_000;
      let readyArrived = true;
      await Promise.race([
        readyPromise,
        new Promise<void>((resolve) =>
          setTimeout(() => {
            readyArrived = false;
            resolve();
          }, READY_WATCHDOG_MS),
        ),
      ]);
      if (!readyArrived) {
        this.log.warn(
          `Webview 'ready' did not arrive within ${READY_WATCHDOG_MS}ms; ` +
            'posting init anyway (may be lost).',
          { filePath },
        );
      } else {
        this.log.info('Init waited for ready.', {
          filePath,
          ms: Date.now() - waitForReadyStart,
        });
      }
      const initPostStartedAt = Date.now();
      const postInitPromise = Promise.resolve(
        panel.webview.postMessage({
          type: 'init',
          payload: initPayload,
        } satisfies HostToRenderedView),
      );
      postInitPromise.then(
        (ok) =>
          this.log.info('Init postMessage settled.', {
            filePath,
            ms: Date.now() - initPostStartedAt,
            delivered: ok,
          }),
        (err) =>
          this.log.error('Init postMessage rejected.', {
            filePath,
            ms: Date.now() - initPostStartedAt,
            error: err instanceof Error ? err.message : String(err),
          }),
      );
      this.log.info('Init posted to webview.', { filePath });

      // Phase 2: once the base markdown is available, compute diff
      // annotations and re-render with gutter bars applied. Sent as
      // a 'diffApplied' message so the webview only swaps innerHTML.
      const baseMarkdown = await basePromise;
      if (baseMarkdown == null) {
        this.log.info('No base content; skipping diff annotations.', {
          filePath,
        });
        return;
      }
      const diffAnnotations = annotateBlockDiff(headMarkdown, baseMarkdown);
      if (diffAnnotations.length === 0) {
        this.log.info('No diff annotations produced.', { filePath });
        return;
      }
      const diffRender = renderMarkdown({
        markdown: headMarkdown,
        diffAnnotations,
      });
      const diffPostStartedAt = Date.now();
      const postDiffPromise = Promise.resolve(
        panel.webview.postMessage({
          type: 'diffApplied',
          payload: {
            html: diffRender.html,
            sourceMap: diffRender.sourceMap,
            diffAnnotations,
          },
        } satisfies HostToRenderedView),
      );
      postDiffPromise.then(
        (ok) =>
          this.log.info('Diff postMessage settled.', {
            filePath,
            ms: Date.now() - diffPostStartedAt,
            delivered: ok,
          }),
        (err) =>
          this.log.error('Diff postMessage rejected.', {
            filePath,
            ms: Date.now() - diffPostStartedAt,
            error: err instanceof Error ? err.message : String(err),
          }),
      );
      this.log.info('Diff applied to webview.', {
        filePath,
        annotations: diffAnnotations.length,
      });
    } catch (err) {
      this.log.error('Failed to render rendered view', {
        filePath,
        error: err instanceof Error ? err.message : String(err),
      });
      const payload = toErrorPayload(err);
      void panel.webview.postMessage({
        type: 'error',
        payload,
      } satisfies HostToRenderedView);
      void surfaceError(err, `Open ${filePath}`);
    }
  }

  private async ensureSessionForRenderedView(
    parsed: ReturnType<typeof parseMdprUri>,
  ): Promise<void> {
    const key = sessionKeyFromMdprParts(parsed);
    if (this.sessions.has(key)) {
      // Already open — mark it active so active-session consumers (tree,
      // status bar, stale watcher) follow the rendered editor the user just
      // focused. Fire the change event so they actually re-read the session.
      if (this.activeSessionKey !== key) {
        this.activeSessionKey = key;
        this._onSessionChanged.fire(this.getActiveSession());
      }
      return;
    }
    const pending = this.pendingSessionRestores.get(key);
    if (pending) {
      await pending;
      return;
    }

    this.log.info('Restoring session for rendered view.', {
      organization: parsed.organization,
      project: parsed.project,
      repositoryId: parsed.repositoryId,
      pullRequestId: parsed.pullRequestId,
    });
    const promise = this.openPullRequest(pullRequestRefFromMdprParts(parsed));
    this.pendingSessionRestores.set(key, promise);
    try {
      await promise;
    } finally {
      this.pendingSessionRestores.delete(key);
    }
  }

  private async handleRenderedViewMessage(
    uriStr: string,
    msg: RenderedViewToHost,
  ): Promise<void> {
    switch (msg.type) {
      case 'ready':
        this.log.info('Webview ready signal received.', { uri: uriStr });
        this.webviewReady.get(uriStr)?.resolve();
        break;
      case 'selectionMade': {
        const key = this.keyForUri(uriStr);
        const controller = key ? this.commentControllers.get(key) : undefined;
        if (!controller) return;
        this.activeDraftKey = key;
        await controller.handleSelection(msg.payload, uriStr);
        break;
      }
      case 'refreshThreads': {
        const session = this.getSessionForUri(uriStr);
        if (session) await this.refreshThreadsForSession(session);
        break;
      }
      case 'refreshToHead':
        this.log.info('Refresh-to-head requested.');
        try {
          const session = this.getSessionForUri(uriStr);
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
    await this.refreshThreadsForSession(this.requireSession());
  }

  private async refreshThreadsForSession(session: Session): Promise<void> {
    const threads = await this.adoClient.getThreads(session.pr.ref);
    session.threads = threads;
    this._onThreadsChanged.fire();
    // Push to every open rendered view for this session.
    for (const [_uri, panel] of session.openedEditors) {
      void panel.webview.postMessage({
        type: 'threadsRefreshed',
        payload: {
          threads: threads.filter(
            (t) => t.threadContext?.filePath === parseMdprUri(_uri).filePath,
          ),
        },
      } satisfies HostToRenderedView);
    }
  }

  async handlePostThread(req: PostThreadRequest): Promise<void> {
    const controller = this.activeDraftController();
    if (!controller) return;
    // Only release the draft's routing key once the post actually succeeds.
    // CommentController swallows recoverable post errors and keeps the draft,
    // so a retry must still route to the PR whose selection created it rather
    // than falling back to whichever session happens to be active.
    const posted = await controller.handlePostThread(req);
    if (posted) this.activeDraftKey = null;
  }

  handleCancelDraft(): void {
    const controller = this.activeDraftController();
    if (!controller) return;
    controller.handleCancelDraft();
    this.activeDraftKey = null;
  }

  private activeDraftController(): CommentController | null {
    if (this.activeDraftKey) {
      const owned = this.commentControllers.get(this.activeDraftKey);
      if (owned) return owned;
    }
    return this.activeSessionKey
      ? (this.commentControllers.get(this.activeSessionKey) ?? null)
      : null;
  }

  private recordPostedThread(session: Session, thread: Thread): void {
    session.threads.push(thread);
    this._onThreadsChanged.fire();
    // Push to the originating panel (and any others showing the same file).
    const filePath = thread.threadContext?.filePath;
    for (const [uri, panel] of session.openedEditors) {
      const parsed = parseMdprUri(uri);
      if (parsed.filePath === filePath) {
        void panel.webview.postMessage({
          type: 'threadCreated',
          payload: { thread },
        } satisfies HostToRenderedView);
      }
    }
  }

  private requireSession(): Session {
    const session = this.getActiveSession();
    if (!session) {
      throw new Error('No active session. Open a pull request first.');
    }
    return session;
  }

  private *allOpenPanels(): Iterable<[string, vscode.WebviewPanel]> {
    for (const session of this.sessions.values()) {
      yield* session.openedEditors;
    }
  }

  private async recordRecentPullRequest(
    pr: PullRequest,
    openedAt = new Date().toISOString(),
  ): Promise<void> {
    try {
      const existing = parseStoredRecentPullRequests(
        this.context.globalState.get<unknown>(RECENT_PULL_REQUESTS_STATE_KEY),
      );
      const next = addRecentPullRequest(
        existing,
        recentPullRequestFromPullRequest(pr, openedAt),
      );
      await this.context.globalState.update(
        RECENT_PULL_REQUESTS_STATE_KEY,
        next,
      );
    } catch (err) {
      this.log.warn('Failed to persist recent pull request.', {
        pullRequestId: pr.ref.pullRequestId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Resolve the user's `markdown.styles` setting into:
   *   - `uris`: webview-loadable URLs to feed into `<link rel="stylesheet">`
   *   - `roots`: parent directories that must be added to localResourceRoots
   *     so the webview can fetch each local stylesheet
   *
   * Entries are classified per the built-in markdown preview's behaviour:
   *   - `http(s)://...` → used as-is (requires `https:` in CSP style-src)
   *   - `file:///...`   → parsed and converted via asWebviewUri
   *   - absolute path   → wrapped in vscode.Uri.file then asWebviewUri
   *   - relative path   → resolved against the first workspace folder, or
   *                       skipped (with a warning) when no workspace is open
   *
   * Invalid / malformed entries are logged and skipped so a single bad
   * entry can't break the rendered view.
   */
  private resolveUserStyles(webview: vscode.Webview): {
    uris: string[];
    roots: vscode.Uri[];
  } {
    const raw = vscode.workspace
      .getConfiguration('markdown')
      .get<unknown>('styles');
    const entries = Array.isArray(raw) ? raw : [];
    const uris: string[] = [];
    const roots: vscode.Uri[] = [];
    const seenRoots = new Set<string>();
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
    for (const entry of entries) {
      if (typeof entry !== 'string') continue;
      const trimmed = entry.trim();
      if (trimmed.length === 0) continue;
      try {
        if (/^https?:\/\//i.test(trimmed)) {
          uris.push(trimmed);
          continue;
        }
        let fileUri: vscode.Uri;
        if (/^file:\/\//i.test(trimmed)) {
          fileUri = vscode.Uri.parse(trimmed);
        } else if (path.isAbsolute(trimmed)) {
          fileUri = vscode.Uri.file(trimmed);
        } else if (workspaceFolder) {
          fileUri = vscode.Uri.joinPath(workspaceFolder, trimmed);
        } else {
          this.log.warn(
            'Skipping relative markdown.styles entry (no workspace folder open).',
            { entry: trimmed },
          );
          continue;
        }
        uris.push(webview.asWebviewUri(fileUri).toString());
        const dir = path.dirname(fileUri.fsPath);
        if (!seenRoots.has(dir)) {
          seenRoots.add(dir);
          roots.push(vscode.Uri.file(dir));
        }
      } catch (err) {
        this.log.warn('Failed to resolve markdown.styles entry; skipping.', {
          entry: trimmed,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return { uris, roots };
  }

  /**
   * Resolve VS Code's built-in markdown preview stylesheet
   * (markdown.css from the bundled `vscode.markdown-language-features`
   * extension). Returns webview-loadable URIs and the parent dir to add
   * to `localResourceRoots`. Returns empty arrays if the extension can't
   * be found — some stripped-down VS Code variants ship without it, and
   * we still want to render in that case (just without the native look).
   *
   * The path inside that extension changes between VS Code commits
   * (it sits under a hash-named dir), so we MUST resolve it via the
   * extension API rather than guessing a fixed location.
   */
  private resolveBuiltinMarkdownStyles(webview: vscode.Webview): {
    uris: string[];
    roots: vscode.Uri[];
  } {
    try {
      const ext = vscode.extensions.getExtension(
        'vscode.markdown-language-features',
      );
      if (!ext) return { uris: [], roots: [] };
      const mediaDir = vscode.Uri.joinPath(ext.extensionUri, 'media');
      const cssUri = vscode.Uri.joinPath(mediaDir, 'markdown.css');
      return {
        uris: [webview.asWebviewUri(cssUri).toString()],
        roots: [mediaDir],
      };
    } catch (err) {
      this.log.warn('Failed to resolve built-in markdown.css; falling back.', {
        error: err instanceof Error ? err.message : String(err),
      });
      return { uris: [], roots: [] };
    }
  }

  /**
   * Push a live style refresh to every open rendered-view panel.
   * Invoked when the user changes `markdown.preview.*` or
   * `markdown.styles`. We re-resolve user styles (including
   * widening localResourceRoots if needed) and post a 'restyle'
   * message so the page can swap CSS without a full reload.
   */
  private restyleAllOpenPanels(): void {
    const previewStyle = readMarkdownPreviewStyle();
    const distRoot = vscode.Uri.joinPath(this.context.extensionUri, 'out');
    for (const [uriKey, panel] of this.allOpenPanels()) {
      try {
        const userStyles = this.resolveUserStyles(panel.webview);
        const builtinStyles = this.resolveBuiltinMarkdownStyles(panel.webview);
        // Re-widen localResourceRoots first so any newly-added
        // user style file dir is reachable before the webview
        // tries to fetch it via the swapped <link>. Built-in
        // roots are stable across config changes but included
        // for symmetry with the initial render path.
        panel.webview.options = {
          enableScripts: true,
          localResourceRoots: [
            distRoot,
            ...builtinStyles.roots,
            ...userStyles.roots,
          ],
        };
        void panel.webview.postMessage({
          type: 'restyle',
          payload: {
            fontFamily: previewStyle.fontFamily,
            fontSize: previewStyle.fontSize,
            lineHeight: previewStyle.lineHeight,
            builtinStyleUris: builtinStyles.uris,
            userStyleUris: userStyles.uris,
          },
        } satisfies HostToRenderedView);
      } catch (err) {
        this.log.warn('Failed to restyle panel; skipping.', {
          uri: uriKey,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  async disposeSession(key?: string): Promise<void> {
    const targetKey = key ?? this.activeSessionKey;
    if (!targetKey) return;
    const session = this.sessions.get(targetKey);
    if (!session) return;
    for (const panel of session.openedEditors.values()) {
      try {
        panel.dispose();
      } catch {
        /* ignore */
      }
    }
    this.sessions.delete(targetKey);
    this.commentControllers.delete(targetKey);
    this.pendingSessionRestores.delete(targetKey);
    if (this.activeDraftKey === targetKey) this.activeDraftKey = null;
    if (this.activeSessionKey === targetKey) {
      // Promote the most-recently-opened remaining session, if any.
      const remaining = [...this.sessions.keys()];
      this.activeSessionKey = remaining.length
        ? remaining[remaining.length - 1]!
        : null;
    }
    this._onSessionChanged.fire(this.getActiveSession());
  }

  async disposeAll(): Promise<void> {
    for (const key of [...this.sessions.keys()]) {
      await this.disposeSession(key);
    }
  }

  dispose(): void {
    void this.disposeAll();
    this._onSessionChanged.dispose();
    this._onThreadsChanged.dispose();
    for (const d of this.disposables) {
      try {
        d.dispose();
      } catch {
        /* ignore */
      }
    }
  }
}

function renderedViewHtml(opts: {
  csp: string;
  nonce: string;
  scriptUri: string;
  codiconCssUri: string;
  previewStyle: { fontFamily: string; fontSize: number; lineHeight: number };
  builtinStyleUris: string[];
  userStyleUris: string[];
}): string {
  // Built-in markdown.css from VS Code's bundled
  // markdown-language-features extension is loaded BEFORE our inline
  // <style> so our extension-specific overrides (body padding, banners,
  // thread markers, diff gutters) win where they apply, while the
  // built-in's prose styling (headings, lists, blockquote, pre, code,
  // tables) drives the look of the actual markdown content. User
  // `markdown.styles` entries come LAST so the user's tweaks always win.
  const builtinStyleLinks = opts.builtinStyleUris
    .map(
      (uri) =>
        `    <link rel="stylesheet" data-builtin-style="true" href="${escapeHtmlAttribute(uri)}">`,
    )
    .join('\n');
  const userStyleLinks = opts.userStyleUris
    .map(
      (uri) =>
        `    <link rel="stylesheet" data-user-style="true" href="${escapeHtmlAttribute(uri)}">`,
    )
    .join('\n');
  return /* html */ `<!doctype html>
<html lang="en">
<head>
 <meta charset="utf-8">
 <meta http-equiv="Content-Security-Policy" content="${opts.csp}">
 <link rel="stylesheet" href="${opts.codiconCssUri}">
${builtinStyleLinks}
 <title>Markdown PR Review</title>
 <style>
  /* Match the built-in markdown preview's font defaults so prose
  in our rendered view looks the same as Ctrl+Shift+V. The same
  --markdown-font-* CSS variables drive both VS Code's built-in
  markdown.css and this block. */
  :root {
   --markdown-font-family: ${escapeCssString(opts.previewStyle.fontFamily)};
   --markdown-font-size: ${opts.previewStyle.fontSize}px;
   --markdown-line-height: ${opts.previewStyle.lineHeight};
  }
  /* Built-in markdown.css applies padding: 0 26px to html+body and
     padding-top: 1em to body; we override that here because our
     centred max-width #content-wrapper provides the prose gutter.
     This rule comes after the built-in <link> so it wins by source
     order (same specificity). */
  html, body { padding: 0; }
  body {
   font-family: var(--markdown-font-family);
   font-size: var(--markdown-font-size);
   line-height: var(--markdown-line-height);
   margin: 0;
   /* Apply the foreground color at the body level (matches VS Code's
      built-in markdown preview) so any user markdown.styles entry
      targeting body can cascade naturally to descendants. Using
      --vscode-foreground (general UI foreground) instead of
      --vscode-editor-foreground keeps prose readable on themes that
      intentionally mute the editor text color. */
   color: var(--vscode-foreground);
  }
  #pr-banner { padding: 6px 12px; background: var(--vscode-editorWidget-background); border-bottom: 1px solid var(--vscode-editorWidget-border); font-size: 0.85em; }
  #content-wrapper { position: relative; padding: 16px 24px; max-width: 900px; margin: 0 auto; }
  /* Prose styling for h1-h6, p, ul, ol, li, blockquote, pre, code,
     table, hr is delegated to the built-in markdown.css <link> above
     so the rendered view matches Ctrl+Shift+V. Only extension-specific
     selectors (banner, thread marker/popover, diff gutter, selection)
     live in this block. */
  .ado-thread-marker {
   display: inline-flex; align-items: center; justify-content: center;
   margin-left: 6px; padding: 2px 4px;
   background: transparent;
   color: var(--vscode-icon-foreground, var(--vscode-foreground));
   border: none;
   cursor: pointer;
   opacity: 0.7;
   vertical-align: baseline;
   line-height: 1;
  }
  .ado-thread-marker .codicon { font-size: 14px; }
  .ado-thread-marker:hover { opacity: 1; }
  .ado-thread-marker[aria-expanded="true"] {
   color: var(--vscode-textLink-foreground);
   opacity: 1;
  }
  .ado-thread-marker:focus {
   outline: 1px solid var(--vscode-focusBorder);
   outline-offset: 1px;
  }
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
  /* Diff gutter bars (REQ-DIFF-001). */
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
${userStyleLinks}
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

// VS Code's markdown preview defaults (matches
// extensions/markdown-language-features's preview.css).
const PREVIEW_DEFAULT_FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "Segoe WPC", "Segoe UI", "Ubuntu", "Droid Sans", sans-serif';
const PREVIEW_DEFAULT_FONT_SIZE = 14;
const PREVIEW_DEFAULT_LINE_HEIGHT = 1.6;

// Read the user's markdown.preview.* settings so our rendered view
// inherits any customizations they've already made for Ctrl+Shift+V.
// Falls back to the same defaults VS Code's built-in preview uses.
function readMarkdownPreviewStyle(): {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
} {
  const cfg = vscode.workspace.getConfiguration('markdown.preview');
  const rawFamily = cfg.get<string>('fontFamily');
  const rawSize = cfg.get<number>('fontSize');
  const rawLine = cfg.get<number>('lineHeight');
  return {
    fontFamily:
      typeof rawFamily === 'string' && rawFamily.trim().length > 0
        ? rawFamily
        : PREVIEW_DEFAULT_FONT_FAMILY,
    fontSize:
      typeof rawSize === 'number' && Number.isFinite(rawSize) && rawSize > 0
        ? rawSize
        : PREVIEW_DEFAULT_FONT_SIZE,
    lineHeight:
      typeof rawLine === 'number' && Number.isFinite(rawLine) && rawLine > 0
        ? rawLine
        : PREVIEW_DEFAULT_LINE_HEIGHT,
  };
}

// Escape a string for safe inclusion as an HTML attribute value.
// User-style URIs come from VS Code config and are typically benign,
// but neutralise embedded quotes/angle-brackets defensively to avoid
// attribute-context injection in the rendered HTML.
function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Escape a string for safe inclusion inside a CSS value. The font-family
// stack can contain quoted family names (e.g. "Segoe UI") which must
// remain intact, but stray </style> or backslashes must not be allowed
// to break out of the <style> block.
function escapeCssString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/<\//g, '<\\/')
    .replace(/[\r\n]/g, ' ');
}
