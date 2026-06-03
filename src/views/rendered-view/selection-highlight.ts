// SPDX-License-Identifier: MIT
// Renders comment markers on the rendered view at each thread's
// rightFileStart/rightFileEnd. Markers are clickable bubbles in the right
// gutter that scroll into view and trigger thread-display behavior
// (popover in v0.2 — not yet wired in v0.1).
//
// For v0.1 we mount visual markers only; click handlers no-op.

import type { Thread } from '../../types';

let markerContainer: HTMLElement | null = null;

export function mountThreadMarkers(threads: Thread[], contentRoot: HTMLElement): void {
    if (!markerContainer) {
        markerContainer = document.createElement('div');
        markerContainer.id = 'thread-markers';
        contentRoot.parentElement?.appendChild(markerContainer);
    }
    refreshThreadMarkers(threads);
}

export function refreshThreadMarkers(threads: Thread[]): void {
    if (!markerContainer) return;
    markerContainer.innerHTML = '';
    const blocks = document.querySelectorAll<HTMLElement>('[data-source-line-start]');
    for (const t of threads) {
        if (!t.threadContext?.rightFileStart) continue;
        const startLine = t.threadContext.rightFileStart.line;
        const block = pickBlockForLine(blocks, startLine);
        if (!block) continue;
        const marker = document.createElement('button');
        marker.className = 'thread-marker';
        marker.title = `Thread ${t.id} — ${t.comments[0]?.author.displayName ?? ''}: ${
            (t.comments[0]?.content ?? '').slice(0, 80)
        }`;
        marker.setAttribute('aria-label', `Comment thread ${t.id}`);
        marker.textContent = '💬';
        marker.dataset.threadId = String(t.id);
        positionMarker(marker, block);
        markerContainer.appendChild(marker);
    }
}

function pickBlockForLine(blocks: NodeListOf<HTMLElement>, line: number): HTMLElement | null {
    // Find the block whose [data-source-line-start, data-source-line-end]
    // contains the given line.
    for (const el of Array.from(blocks)) {
        const start = Number.parseInt(el.getAttribute('data-source-line-start') ?? '0', 10);
        const end = Number.parseInt(el.getAttribute('data-source-line-end') ?? '0', 10);
        if (start <= line && line <= end) {
            return el;
        }
    }
    return null;
}

function positionMarker(marker: HTMLElement, block: HTMLElement): void {
    const rect = block.getBoundingClientRect();
    const containerRect = markerContainer!.parentElement!.getBoundingClientRect();
    marker.style.position = 'absolute';
    marker.style.top = `${rect.top - containerRect.top + 2}px`;
    marker.style.right = '8px';
    marker.style.zIndex = '10';
}
