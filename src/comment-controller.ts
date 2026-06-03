// SPDX-License-Identifier: MIT
// Comment Controller per design.md §3.2 / §4.3.3.
//
// Orchestrates the selectionMade → map → input-display → POST → threadCreated
// flow. One CommentController instance per session.

import type { AdoClient } from './ado-client';
import type { CommentInputViewProvider } from './comment-input-view-provider';
import { getLogger } from './logger';
import { mapSelection } from './selection-mapper';
import type {
    Draft,
    LineOffset,
    MappingMode,
    PostThreadRequest,
    PullRequestRef,
    SelectionMadePayload,
    SelectionPostedPayload,
    Thread
} from './types';

export interface CommentControllerDeps {
    pullRequestRef: PullRequestRef;
    adoClient: AdoClient;
    inputView: CommentInputViewProvider;
    /** Returns the raw markdown for a given filePath at the session's headSha. */
    fileContentResolver: (filePath: string) => Promise<string>;
    /** Called when a thread is successfully posted. */
    onThreadPosted: (thread: Thread) => void;
}

const AUTO_QUOTE_MAX_CHARS = 200;

export class CommentController {
    private readonly log = getLogger('CommentController');
    private currentDraft: Draft | null = null;

    constructor(private readonly deps: CommentControllerDeps) {}

    async handleSelection(
        payload: SelectionMadePayload,
        originatingFileUri: string
    ): Promise<void> {
        try {
            const raw = await this.deps.fileContentResolver(payload.filePath);
            const result = mapSelection({ selection: payload, rawFileContent: raw });
            this.log.info(result.note);
            const autoQuote = truncate(result.quotedText, AUTO_QUOTE_MAX_CHARS);
            const draft: Draft = {
                filePath: payload.filePath,
                originatingFileUri,
                range: {
                    rightFileStart: result.rightFileStart,
                    rightFileEnd: result.rightFileEnd
                },
                mappingMode: result.mode,
                autoQuote,
                bodyText: ''
            };
            this.currentDraft = draft;
            const posted: SelectionPostedPayload = {
                filePath: payload.filePath,
                rightFileStart: result.rightFileStart,
                rightFileEnd: result.rightFileEnd,
                mappingMode: result.mode,
                autoQuote,
                originatingFileUri
            };
            this.deps.inputView.showSelection(posted);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.log.error('Selection mapping failed.', msg);
            this.deps.inputView.showError('ERR_SELECTION_MAP', msg);
        }
    }

    async handlePostThread(req: PostThreadRequest): Promise<void> {
        if (!this.currentDraft) {
            this.log.warn('Post requested with no active draft; ignoring.');
            return;
        }
        try {
            const thread = await this.deps.adoClient.createThread(this.deps.pullRequestRef, {
                filePath: req.filePath,
                rightFileStart: req.rightFileStart,
                rightFileEnd: req.rightFileEnd,
                content: req.content
            });
            this.log.info(`Posted thread ${thread.id} on ${req.filePath}`);
            this.currentDraft = null;
            this.deps.inputView.clearDraft();
            this.deps.onThreadPosted(thread);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.log.error('Thread post failed.', msg);
            this.deps.inputView.showError('ERR_POST_THREAD', msg, true);
        }
    }

    handleCancelDraft(): void {
        this.currentDraft = null;
        this.deps.inputView.clearDraft();
    }

    getDraft(): Draft | null {
        return this.currentDraft;
    }
}

function truncate(s: string, maxChars: number): string {
    if (s.length <= maxChars) return s;
    return s.slice(0, maxChars - 1) + '…';
}

// Re-exports for callers that don't want to import 'types' separately.
export type { Draft, LineOffset, MappingMode };
