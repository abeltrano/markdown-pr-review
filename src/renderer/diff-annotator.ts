// SPDX-License-Identifier: MIT
// Diff Annotator (TASK-030 / REQ-DIFF-001).
//
// Strategy:
//   1. Tokenize each version's markdown via the shared markdown-it
//      instance to obtain block-level tokens with stable line maps.
//   2. For each block, compute a normalized fingerprint (whitespace
//      collapsed, lowercased) so trivial reformatting doesn't surface
//      as a diff.
//   3. Run a line-style diff over the fingerprint sequences via
//      `diff` (Myers) to identify added / removed / unchanged hunks.
//   4. Map the head-side hunks back to head-version line ranges and
//      emit DiffAnnotation entries. Removed hunks on the base side
//      are emitted as `context-of-deletion` annotations attached to
//      the surrounding head block.
//
// When the base version is null (e.g. the file was added in this PR),
// every head block is emitted as `added`.

import { diffArrays } from 'diff';
import type Token from 'markdown-it/lib/token.mjs';
import { createMarkdownIt } from './markdown-it-config';
import type { DiffAnnotation } from '../types';

export interface AnnotateInput {
    headMarkdown: string;
    /** Null means the file did not exist at the merge-base. */
    baseMarkdown: string | null;
}

interface Block {
    /** 1-indexed inclusive start line in the source. */
    startLine: number;
    /** 1-indexed inclusive end line in the source. */
    endLine: number;
    fingerprint: string;
    /** Block kind, retained for debugging only. */
    kind: string;
}

export function annotateBlockDiff(
    headMarkdown: string,
    baseMarkdown: string | null
): DiffAnnotation[] {
    const md = createMarkdownIt();
    const headTokens = md.parse(headMarkdown, {});
    const headBlocks = extractBlocks(headTokens);

    if (baseMarkdown === null) {
        // Whole file added.
        return headBlocks.map((b): DiffAnnotation => ({
            state: 'added',
            headLineStart: b.startLine,
            headLineEnd: b.endLine
        }));
    }

    const baseTokens = md.parse(baseMarkdown, {});
    const baseBlocks = extractBlocks(baseTokens);

    const baseFps = baseBlocks.map(b => b.fingerprint);
    const headFps = headBlocks.map(b => b.fingerprint);

    const changes = diffArrays(baseFps, headFps);

    const annotations: DiffAnnotation[] = [];
    let headIdx = 0;
    let lastHeadBlock: Block | undefined;
    let pendingDeleted: string[] = [];

    const flushDeleted = (): void => {
        if (pendingDeleted.length === 0) return;
        // Attach the deletion context to the nearest head block. Prefer
        // the block immediately AFTER the deletion site (i.e., the next
        // head block); fall back to the most recent head block when the
        // deletion is at the file tail.
        const anchor = headBlocks[headIdx] ?? lastHeadBlock;
        if (anchor) {
            annotations.push({
                state: 'context-of-deletion',
                headLineStart: anchor.startLine,
                headLineEnd: anchor.endLine,
                deletedContent: pendingDeleted.join('\n')
            });
        }
        pendingDeleted = [];
    };

    for (const part of changes) {
        if (part.added) {
            // Each "value" entry corresponds to one head block.
            for (let i = 0; i < part.value.length; i++) {
                const block = headBlocks[headIdx];
                if (!block) break;
                annotations.push({
                    state: detectModifiedVsAdded(block, baseBlocks),
                    headLineStart: block.startLine,
                    headLineEnd: block.endLine
                });
                lastHeadBlock = block;
                headIdx++;
            }
        } else if (part.removed) {
            // Stash these for a context-of-deletion attachment on the next
            // head block.
            for (const v of part.value) {
                pendingDeleted.push(v);
            }
        } else {
            // Unchanged: advance head index, but emit nothing (renderer
            // treats absence of data-diff-state as unchanged).
            flushDeleted();
            for (let i = 0; i < part.value.length; i++) {
                const block = headBlocks[headIdx];
                if (!block) break;
                lastHeadBlock = block;
                headIdx++;
            }
        }
    }
    flushDeleted();

    return mergeContiguous(annotations);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BLOCK_OPEN_TYPES = new Set<string>([
    'paragraph_open',
    'heading_open',
    'blockquote_open',
    'list_item_open',
    'table_open',
    'thead_open',
    'tbody_open',
    'tr_open'
]);

const BLOCK_SELF_TYPES = new Set<string>([
    'fence',
    'code_block',
    'hr',
    'html_block'
]);

function extractBlocks(tokens: Token[]): Block[] {
    const blocks: Block[] = [];
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i]!;
        if (BLOCK_SELF_TYPES.has(t.type) && t.map) {
            blocks.push(blockFromSelfToken(t));
            continue;
        }
        if (BLOCK_OPEN_TYPES.has(t.type) && t.map) {
            // Find matching close to gather child tokens for fingerprint.
            const closeType = t.type.replace(/_open$/, '_close');
            let j = i + 1;
            const children: Token[] = [];
            while (j < tokens.length && tokens[j]!.type !== closeType) {
                children.push(tokens[j]!);
                j++;
            }
            blocks.push(blockFromOpenToken(t, children));
        }
    }
    // De-duplicate overlapping blocks (e.g., thead_open + tr_open inside
    // table_open): keep the outermost.
    return collapseOverlaps(blocks);
}

function blockFromSelfToken(t: Token): Block {
    const [start, end] = t.map!;
    return {
        startLine: start + 1,
        endLine: Math.max(start + 1, end),
        fingerprint: normalize(`${t.type}|${t.content ?? ''}`),
        kind: t.type
    };
}

function blockFromOpenToken(t: Token, children: Token[]): Block {
    const [start, end] = t.map!;
    const text = children
        .map(c => c.content ?? '')
        .filter(s => s.length > 0)
        .join(' ');
    return {
        startLine: start + 1,
        endLine: Math.max(start + 1, end),
        fingerprint: normalize(`${t.type}|${text}`),
        kind: t.type
    };
}

function normalize(s: string): string {
    return s
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function collapseOverlaps(blocks: Block[]): Block[] {
    // Sort by start line, then by descending span (outer blocks first).
    const sorted = [...blocks].sort((a, b) => {
        if (a.startLine !== b.startLine) return a.startLine - b.startLine;
        return (b.endLine - b.startLine) - (a.endLine - a.startLine);
    });
    const result: Block[] = [];
    let lastCovered = 0;
    for (const b of sorted) {
        if (b.startLine > lastCovered) {
            result.push(b);
            lastCovered = b.endLine;
        }
    }
    return result;
}

function detectModifiedVsAdded(
    headBlock: Block,
    baseBlocks: Block[]
): DiffAnnotation['state'] {
    // If a base block exists with the same kind near the same line, classify
    // as `modified` (REQ-DIFF-001 AC-4 — modifications are not add+remove).
    const tolerance = 5;
    const candidate = baseBlocks.find(
        b =>
            b.kind === headBlock.kind &&
            Math.abs(b.startLine - headBlock.startLine) <= tolerance &&
            similarity(b.fingerprint, headBlock.fingerprint) > 0.4
    );
    return candidate ? 'modified' : 'added';
}

function similarity(a: string, b: string): number {
    if (a.length === 0 && b.length === 0) return 1;
    const tokensA = new Set(a.split(' '));
    const tokensB = new Set(b.split(' '));
    let intersect = 0;
    for (const t of tokensA) {
        if (tokensB.has(t)) intersect++;
    }
    const union = tokensA.size + tokensB.size - intersect;
    return union === 0 ? 0 : intersect / union;
}

function mergeContiguous(anns: DiffAnnotation[]): DiffAnnotation[] {
    // Sort by line and merge adjacent same-state annotations.
    const sorted = [...anns].sort((a, b) => a.headLineStart - b.headLineStart);
    const out: DiffAnnotation[] = [];
    for (const a of sorted) {
        const last = out[out.length - 1];
        if (
            last &&
            last.state === a.state &&
            last.state !== 'context-of-deletion' &&
            a.headLineStart <= last.headLineEnd + 1
        ) {
            last.headLineEnd = Math.max(last.headLineEnd, a.headLineEnd);
        } else {
            out.push({ ...a });
        }
    }
    return out;
}
