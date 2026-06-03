// SPDX-License-Identifier: MIT
// Comment-thread markers and read-only popovers per design.md §3.2
// "Marker handling".
//
// Each Thread with a `rightFileStart.line` value is rendered as an
// `<button class="ado-thread-marker">` appended inside the block element
// whose `data-source-line-start..end` range contains that line. Clicking a
// marker shows an absolutely positioned `<div class="ado-thread-popover">`
// listing the thread's comments. Clicking the marker again (or anywhere
// outside the popover) closes it.
//
// Popovers render plain text (per-comment author + content). Markdown
// rendering of comment content is deferred (would require shipping
// markdown-it into the rendered-view bundle).

import type { Thread } from '../../types';

let contentRoot: HTMLElement | null = null;
const markerRegistry = new Map<number, HTMLButtonElement>();
let activePopover: HTMLDivElement | null = null;

export function mountThreadMarkers(threads: Thread[], root: HTMLElement): void {
 contentRoot = root;
 bindGlobalDismiss();
 refreshThreadMarkers(threads);
}

export function refreshThreadMarkers(threads: Thread[]): void {
 if (!contentRoot) return;
 closeActivePopover();
 for (const btn of markerRegistry.values()) {
  btn.remove();
 }
 markerRegistry.clear();

 const blocks = contentRoot.querySelectorAll<HTMLElement>(
  '[data-source-line-start]'
 );
 for (const t of threads) {
  if (!t.threadContext?.rightFileStart) continue;
  const startLine = t.threadContext.rightFileStart.line;
  const block = pickBlockForLine(blocks, startLine);
  if (!block) continue;
  const marker = makeMarker(t);
  block.appendChild(marker);
  markerRegistry.set(t.id, marker);
 }
}

function makeMarker(thread: Thread): HTMLButtonElement {
 const marker = document.createElement('button');
 marker.className = 'ado-thread-marker';
 marker.type = 'button';
 const icon = document.createElement('span');
 icon.className = 'codicon codicon-comment-discussion';
 icon.setAttribute('aria-hidden', 'true');
 marker.appendChild(icon);
 marker.dataset.threadId = String(thread.id);
 const firstAuthor = thread.comments[0]?.author.displayName ?? '';
 const firstSnippet = (thread.comments[0]?.content ?? '').slice(0, 80);
 marker.title = `Thread ${thread.id} — ${firstAuthor}: ${firstSnippet}`;
 marker.setAttribute('aria-label', `Comment thread ${thread.id}`);
 marker.setAttribute('aria-haspopup', 'dialog');
 marker.setAttribute('aria-expanded', 'false');
 marker.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  togglePopover(thread, marker);
 });
 return marker;
}

function togglePopover(thread: Thread, marker: HTMLButtonElement): void {
 if (activePopover && activePopover.dataset.threadId === String(thread.id)) {
  closeActivePopover();
  return;
 }
 closeActivePopover();
 const popover = buildPopover(thread, marker);
 document.body.appendChild(popover);
 positionPopover(popover, marker);
 marker.setAttribute('aria-expanded', 'true');
 activePopover = popover;
}

function closeActivePopover(): void {
 if (!activePopover) return;
 const tid = activePopover.dataset.threadId;
 if (tid) {
  const m = markerRegistry.get(Number(tid));
  m?.setAttribute('aria-expanded', 'false');
 }
 activePopover.remove();
 activePopover = null;
}

function buildPopover(thread: Thread, _marker: HTMLButtonElement): HTMLDivElement {
 const popover = document.createElement('div');
 popover.className = 'ado-thread-popover';
 popover.dataset.threadId = String(thread.id);
 popover.setAttribute('role', 'dialog');
 popover.setAttribute('aria-label', `Thread ${thread.id} comments`);

 const header = document.createElement('div');
 header.className = 'ado-thread-popover__header';
 header.textContent = `Thread ${thread.id} · status: ${thread.status}`;
 popover.appendChild(header);

 const closeBtn = document.createElement('button');
 closeBtn.className = 'ado-thread-popover__close';
 closeBtn.type = 'button';
 closeBtn.textContent = '×';
 closeBtn.setAttribute('aria-label', 'Close thread');
 closeBtn.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  closeActivePopover();
 });
 header.appendChild(closeBtn);

 const list = document.createElement('div');
 list.className = 'ado-thread-popover__comments';
 for (const c of thread.comments) {
  const item = document.createElement('div');
  item.className = 'ado-thread-popover__comment';
  const author = document.createElement('div');
  author.className = 'ado-thread-popover__author';
  author.textContent = `${c.author.displayName} · ${formatDate(c.publishedDate)}`;
  const body = document.createElement('div');
  body.className = 'ado-thread-popover__body';
  // Plain-text rendering of comment content. Markdown rendering is
  // deferred (would require shipping markdown-it to the webview).
  body.textContent = c.content;
  item.appendChild(author);
  item.appendChild(body);
  list.appendChild(item);
 }
 popover.appendChild(list);

 // Prevent clicks inside the popover from closing it.
 popover.addEventListener('click', (e) => e.stopPropagation());
 return popover;
}

function positionPopover(popover: HTMLDivElement, marker: HTMLButtonElement): void {
 const markerRect = marker.getBoundingClientRect();
 // First insert to measure.
 popover.style.position = 'absolute';
 popover.style.visibility = 'hidden';
 popover.style.left = '0px';
 popover.style.top = '0px';
 // Force layout.
 const popRect = popover.getBoundingClientRect();
 const viewportW = document.documentElement.clientWidth;
 const viewportH = document.documentElement.clientHeight;
 let left = markerRect.right + window.scrollX + 8;
 let top = markerRect.top + window.scrollY;
 // Clamp horizontally — if it overflows right, anchor to marker's left.
 if (left + popRect.width > window.scrollX + viewportW - 12) {
  left = Math.max(
   window.scrollX + 12,
   markerRect.left + window.scrollX - popRect.width - 8
  );
 }
 // Clamp vertically — keep within viewport.
 if (top + popRect.height > window.scrollY + viewportH - 12) {
  top = Math.max(
   window.scrollY + 12,
   window.scrollY + viewportH - popRect.height - 12
  );
 }
 popover.style.left = `${left}px`;
 popover.style.top = `${top}px`;
 popover.style.visibility = '';
}

function pickBlockForLine(
 blocks: NodeListOf<HTMLElement>,
 line: number
): HTMLElement | null {
 // Find the smallest block whose [data-source-line-start, data-source-line-end]
 // contains the given line. Smaller spans typically represent leaf
 // elements (paragraph, list-item) and are preferred to outer containers
 // (e.g. blockquote) that also overlap.
 let best: HTMLElement | null = null;
 let bestSpan = Number.POSITIVE_INFINITY;
 for (const el of Array.from(blocks)) {
  const start = Number.parseInt(
   el.getAttribute('data-source-line-start') ?? '0',
   10
  );
  const end = Number.parseInt(
   el.getAttribute('data-source-line-end') ?? '0',
   10
  );
  if (start <= line && line <= end) {
   const span = end - start;
   if (span < bestSpan) {
    bestSpan = span;
    best = el;
   }
  }
 }
 return best;
}

function formatDate(iso: string): string {
 try {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
 } catch {
  return iso;
 }
}

let dismissBound = false;

function bindGlobalDismiss(): void {
 if (dismissBound) return;
 dismissBound = true;
 document.addEventListener('click', () => {
  // A click anywhere outside a marker or the popover closes the popover.
  // (Marker clicks already stopPropagation; popover clicks too.)
  closeActivePopover();
 });
 document.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Escape' && activePopover) {
   closeActivePopover();
  }
 });
}
