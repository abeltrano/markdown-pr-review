// SPDX-License-Identifier: MIT
// Shared types per design.md §4.2 and §4.1.2.
// Used in both the extension host and (subset, via type-only re-export
// from the webview-side types module) the webview bundles.

import type * as vscode from 'vscode';

// ---------------------------------------------------------------------------
// Domain types (design.md §4.2)
// ---------------------------------------------------------------------------

export interface PullRequestRef {
    /** e.g., "microsoft" */
    organization: string;
    /** e.g., "OS" */
    project: string;
    /** GUID, resolved from repo name during open */
    repositoryId: string;
    /** human-readable */
    repositoryName: string;
    pullRequestId: number;
}

export interface PullRequest {
    ref: PullRequestRef;
    title: string;
    /** refs/heads/feature/foo */
    sourceRefName: string;
    /** refs/heads/main */
    targetRefName: string;
    /** head SHA */
    lastMergeSourceCommit: { commitId: string };
    status: 'active' | 'completed' | 'abandoned';
}

export interface ChangedFile {
    /** e.g., /docs/design.md (leading slash, ADO convention) */
    filePath: string;
    changeType: 'add' | 'edit' | 'delete' | 'rename';
    /** derived: extension in {.md, .markdown, .mdx} */
    isMarkdown: boolean;
}

export interface Thread {
    id: number;
    status: 'active' | 'fixed' | 'wontFix' | 'closed' | 'byDesign' | 'pending' | 'unknown';
    /** ISO-8601 */
    publishedDate: string;
    comments: Comment[];
    /** null = PR-level (non-inline) comment */
    threadContext: ThreadContext | null;
}

export interface Comment {
    id: number;
    author: { displayName: string; uniqueName: string };
    content: string;
    publishedDate: string;
    commentType: 'text' | 'codeChange' | 'system';
}

export interface ThreadContext {
    filePath: string;
    rightFileStart: LineOffset | null;
    rightFileEnd: LineOffset | null;
    // leftFileStart/End also exist on the wire but we don't use them
    // (head-version-only review per design.md §4.1.1).
}

export interface LineOffset {
    /** 1-indexed per ASM-004 */
    line: number;
    /** 1-indexed, 9999 used as end-of-line sentinel per design §4.1.1 */
    offset: number;
}

export interface DiffAnnotation {
    state: 'unchanged' | 'added' | 'modified' | 'context-of-deletion';
    /** 1-indexed inclusive */
    headLineStart: number;
    /** 1-indexed inclusive */
    headLineEnd: number;
    /** Only populated when state is 'context-of-deletion' */
    deletedContent?: string;
}

export type MappingMode =
    | 'precise'
    | 'coarse-mermaid'
    | 'coarse-html-block'
    | 'coarse-multi-block'
    | 'coarse-ambiguous-text'
    | 'coarse-text-not-found';

export interface MappingResult {
    rightFileStart: LineOffset;
    rightFileEnd: LineOffset;
    mappingMode: MappingMode;
}

export interface Draft {
    filePath: string;
    /** adopr:// URI of the rendered-view webview that originated this draft */
    originatingFileUri: string;
    range: {
        rightFileStart: LineOffset;
        rightFileEnd: LineOffset;
    };
    mappingMode: MappingMode;
    /** Already truncated per REQ-COMMENT-003 AC-2 */
    autoQuote: string;
    /** Reviewer's in-flight content (includes the auto-quote prefix) */
    bodyText: string;
}

// Session is a runtime object held entirely in the extension host;
// the WebviewPanel reference makes it host-only (cannot ship to webview).
export interface Session {
    id: string;
    pr: PullRequest;
    headSha: string;
    baseSha: string;
    files: ChangedFile[];
    /** filePath → raw markdown at headSha */
    fileContentCache: Map<string, string>;
    /** adopr:// URI string → panel from CustomEditorProvider */
    openedEditors: Map<string, vscode.WebviewPanel>;
    threads: Thread[];
    /** At most one draft at a time (see design.md §4.3.3) */
    activeDraft: Draft | null;
    /** Disposes the stale-PR poll timer + any other per-session resources */
    dispose(): void;
}

// ---------------------------------------------------------------------------
// Settings (consumed by PR URL parser & stale-PR watcher)
// ---------------------------------------------------------------------------

export interface AdoSettings {
    defaultOrganization: string;
    defaultProject: string;
    /** Clamped to [15, 60]; default 30 */
    staleCommitPollSeconds: number;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type ParseResult<T> =
    | { ok: true; value: T }
    | { ok: false; error: ParseError };

export interface ParseError {
    code:
        | 'empty-input'
        | 'unsupported-url'
        | 'missing-org'
        | 'missing-project'
        | 'invalid-pr-id'
        | 'malformed';
    message: string;
    /** The input the parser received (for diagnostics) */
    input: string;
}

// ---------------------------------------------------------------------------
// postMessage protocol (design.md §4.1.2)
// ---------------------------------------------------------------------------

// Host → Rendered-View Webview ----------------------------------------------

export type HostToRenderedView =
    | { type: 'init'; payload: RenderedViewInitPayload }
    | { type: 'threadCreated'; payload: { thread: Thread } }
    | { type: 'threadsRefreshed'; payload: { threads: Thread[] } }
    | { type: 'selectionCleared' }
    | { type: 'error'; payload: ErrorPayload }
    | { type: 'staleCommit'; payload: { newSha: string; oldSha: string } };

export interface RenderedViewInitPayload {
    sessionId: string;
    filePath: string;
    pullRequest: { id: number; title: string; sourceRef: string; targetRef: string };
    headSha: string;
    baseSha: string;
    fileContent: { html: string; sourceMap: Record<string, [number, number]> };
    threads: Thread[];
    diffAnnotations: DiffAnnotation[];
    protocolVersion: 1;
}

export interface ErrorPayload {
    code: string;
    message: string;
    recoverable: boolean;
    details?: unknown;
}

// Rendered-View Webview → Host ----------------------------------------------

export type RenderedViewToHost =
    | { type: 'ready' }
    | { type: 'selectionMade'; payload: SelectionMadePayload }
    | { type: 'refreshThreads' }
    | { type: 'refreshToHead' }
    | { type: 'log'; payload: LogPayload };

export type ContainerKind =
    | 'paragraph'
    | 'heading'
    | 'list-item'
    | 'blockquote'
    | 'table'
    | 'code-fence'
    | 'mermaid'
    | 'html-block';

export interface SelectionMadePayload {
    filePath: string;
    /** 1-indexed inclusive */
    blockLineRange: { start: number; end: number };
    /** Result of range.toString() */
    selectedText: string;
    /** Rendered plain text from the block-anchor to the selection start
     *  (used by the Selection Mapper to disambiguate repeated substrings) */
    textBeforeSelection: string;
    spansMultipleBlocks: boolean;
    /** Only populated when spansMultipleBlocks is true */
    spannedBlockRanges?: Array<{ start: number; end: number }>;
    containerKind: ContainerKind;
}

export interface LogPayload {
    level: 'info' | 'warn' | 'error';
    message: string;
    context?: unknown;
}

// Host → CommentInputView ---------------------------------------------------

export type HostToInputView =
    | { type: 'selectionPosted'; payload: SelectionPostedPayload }
    | { type: 'draftCleared' }
    | { type: 'error'; payload: ErrorPayload };

export interface SelectionPostedPayload {
    filePath: string;
    rightFileStart: LineOffset;
    rightFileEnd: LineOffset;
    mappingMode: MappingMode;
    /** Already truncated to 200 chars per REQ-COMMENT-003 AC-2 */
    autoQuote: string;
    /** adopr:// URI of the source rendered-view webview (used for threadCreated routing) */
    originatingFileUri: string;
}

// CommentInputView → Host ---------------------------------------------------

export type InputViewToHost =
    | { type: 'ready' }
    | { type: 'requestPostThread'; payload: PostThreadRequest }
    | { type: 'cancelDraft' }
    | { type: 'log'; payload: LogPayload };

export interface PostThreadRequest {
    filePath: string;
    rightFileStart: LineOffset;
    rightFileEnd: LineOffset;
    /** Includes the auto-quoted prefix per REQ-COMMENT-003 */
    content: string;
    /** Pass-through from selectionPosted for routing */
    originatingFileUri: string;
}

// ---------------------------------------------------------------------------
// Render-pipeline outputs
// ---------------------------------------------------------------------------

export interface RenderResult {
    html: string;
    /** Element id → [headLineStart, headLineEnd]; reserved for future precision-anchor lookups */
    sourceMap: Record<string, [number, number]>;
    /** Number of <div class="mermaid"> nodes emitted; used by lazy-load gate */
    mermaidBlockCount: number;
}

// ---------------------------------------------------------------------------
// Misc helpers
// ---------------------------------------------------------------------------

/** Used by SelectionMapper internals; exported so test code can construct fixtures. */
export interface PositionMap {
    /** Each char in `normalized` maps to (line, offset) in the raw source */
    normalized: string;
    map: LineOffset[];
}
