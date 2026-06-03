// SPDX-License-Identifier: MIT
// Selection handler. Captures the user's text selection in the rendered view
// and walks up the DOM tree to find the nearest ancestor with
// `data-source-line-start` / `data-source-line-end`.

import type { ContainerKind, SelectionMadePayload } from '../../types';

export interface SelectionHandlerOptions {
    onSelection: (sel: Selection) => void;
    /** Min selection length in chars; smaller selections are ignored. */
    minLength?: number;
}

export function attachSelectionHandlers(opts: SelectionHandlerOptions): void {
    const min = opts.minLength ?? 1;
    // Fire on mouseup AND keyboard selection (shift+arrow).
    const handler = () => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed) return;
        if (sel.toString().length < min) return;
        opts.onSelection(sel);
    };
    document.addEventListener('mouseup', handler);
    document.addEventListener('keyup', (e) => {
        if (e.shiftKey || e.key.startsWith('Arrow')) handler();
    });
}

interface BlockAncestor {
    element: HTMLElement;
    start: number;
    end: number;
    containerKind: ContainerKind;
}

export function captureSelection(sel: Selection): SelectionMadePayload | null {
    if (sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    const startBlock = findBlockAncestor(range.startContainer);
    const endBlock = findBlockAncestor(range.endContainer);

    if (!startBlock || !endBlock) {
        // No source-line ancestor — show a toast (handled by host on
        // selectionMade with no usable block? We instead bail out silently.)
        return null;
    }

    const filePath = document.body.getAttribute('data-file-path') ?? '';
    const spansMultipleBlocks = startBlock.element !== endBlock.element;
    const spannedBlockRanges = spansMultipleBlocks
        ? collectSpannedBlocks(range)
        : undefined;

    const selectedText = sel.toString();
    const textBeforeSelection = collectTextBefore(startBlock.element, range);

    return {
        filePath,
        blockLineRange: {
            start: startBlock.start,
            end: spansMultipleBlocks ? endBlock.end : startBlock.end
        },
        selectedText,
        textBeforeSelection,
        spansMultipleBlocks,
        spannedBlockRanges,
        containerKind: startBlock.containerKind
    };
}

function findBlockAncestor(node: Node | null): BlockAncestor | null {
    let cur: Node | null = node;
    while (cur && cur.nodeType !== Node.ELEMENT_NODE) {
        cur = cur.parentNode;
    }
    while (cur && cur.nodeType === Node.ELEMENT_NODE) {
        const el = cur as HTMLElement;
        const start = el.getAttribute('data-source-line-start');
        const end = el.getAttribute('data-source-line-end');
        if (start && end) {
            return {
                element: el,
                start: Number.parseInt(start, 10),
                end: Number.parseInt(end, 10),
                containerKind: inferKind(el)
            };
        }
        cur = el.parentElement;
    }
    return null;
}

function inferKind(el: HTMLElement): ContainerKind {
    if (el.classList.contains('mermaid')) return 'mermaid';
    const tag = el.tagName.toLowerCase();
    if (tag === 'p') return 'paragraph';
    if (/^h[1-6]$/.test(tag)) return 'heading';
    if (tag === 'li') return 'list-item';
    if (tag === 'blockquote') return 'blockquote';
    if (tag === 'table' || tag === 'thead' || tag === 'tbody' || tag === 'tr') return 'table';
    if (tag === 'pre' || tag === 'code') return 'code-fence';
    return 'html-block';
}

function collectSpannedBlocks(range: Range): Array<{ start: number; end: number }> {
    // Walk all elements with data-source-line attributes between the start
    // and end containers; pick the unique blocks that the range touches.
    const all = document.querySelectorAll<HTMLElement>('[data-source-line-start]');
    const out: Array<{ start: number; end: number }> = [];
    for (const el of Array.from(all)) {
        if (range.intersectsNode(el)) {
            const start = Number.parseInt(el.getAttribute('data-source-line-start') ?? '0', 10);
            const end = Number.parseInt(el.getAttribute('data-source-line-end') ?? '0', 10);
            if (start > 0 && end >= start) {
                out.push({ start, end });
            }
        }
    }
    // De-duplicate identical (start,end) tuples.
    const seen = new Set<string>();
    return out.filter(r => {
        const key = `${r.start}-${r.end}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function collectTextBefore(blockEl: HTMLElement, range: Range): string {
    // Build a Range from the start of the block element to the start of the
    // user's selection, then take its text content.
    const helper = document.createRange();
    helper.setStart(blockEl, 0);
    helper.setEnd(range.startContainer, range.startOffset);
    return helper.toString();
}
