// SPDX-License-Identifier: MIT
// Comment Input WebviewView per design.md §4.1.2 / §4.3.3.
// Sidebar webview that shows the active draft + lets the reviewer compose
// + post. Sends 'requestPostThread' to host when "Post" is clicked.

import type {
 HostToInputView,
 InputViewToHost,
 PostThreadRequest,
 SelectionPostedPayload
} from '../../types';

declare function acquireVsCodeApi(): {
 postMessage: (msg: InputViewToHost) => void;
 setState: (state: unknown) => void;
 getState: () => unknown;
};

const vscode = acquireVsCodeApi();

interface State {
 active: SelectionPostedPayload | null;
}

const state: State = { active: null };

function post(msg: InputViewToHost): void {
 vscode.postMessage(msg);
}

function log(level: 'info' | 'warn' | 'error', message: string, context?: unknown): void {
 post({ type: 'log', payload: { level, message, context } });
}

window.addEventListener('message', (event: MessageEvent<HostToInputView>) => {
 const msg = event.data;
 switch (msg.type) {
  case 'selectionPosted':
   state.active = msg.payload;
   renderActive();
   break;
  case 'draftCleared':
   state.active = null;
   renderEmpty();
   break;
  case 'error':
   showError(msg.payload.code, msg.payload.message);
   break;
  default:
   log('warn', 'Unknown host message', msg);
 }
});

function renderEmpty(): void {
 const root = ensureRoot();
 root.innerHTML = `
  <div class="empty">
   <p>No active selection.</p>
   <p>Select text in the rendered view and press
   <kbd>Ctrl+Alt+C</kbd> to add a comment.</p>
  </div>
 `;
}

function renderActive(): void {
 if (!state.active) {
  renderEmpty();
  return;
 }
 const a = state.active;
 const root = ensureRoot();
 root.innerHTML = `
  <div class="draft">
   <header>
    <strong>${escapeHtml(a.filePath)}</strong>
    <span class="lines">Lines ${a.rightFileStart.line}-${a.rightFileEnd.line}</span>
   </header>
   <textarea id="body" rows="8" placeholder="Type your comment…"></textarea>
   <footer>
    <button id="post">Post</button>
    <button id="cancel" class="secondary">Cancel</button>
   </footer>
  </div>
 `;
 const ta = root.querySelector<HTMLTextAreaElement>('#body')!;
 ta.value = formatAutoQuote(a.autoQuote);
 ta.focus();
 // Move cursor to end so reviewer types after the quote.
 ta.setSelectionRange(ta.value.length, ta.value.length);
 root.querySelector('#post')?.addEventListener('click', () => {
  const text = ta.value.trim();
  if (!text) return;
  const req: PostThreadRequest = {
   filePath: a.filePath,
   rightFileStart: a.rightFileStart,
   rightFileEnd: a.rightFileEnd,
   content: text,
   originatingFileUri: a.originatingFileUri
  };
  post({ type: 'requestPostThread', payload: req });
 });
 root.querySelector('#cancel')?.addEventListener('click', () => {
  post({ type: 'cancelDraft' });
 });
}

function showError(code: string, message: string): void {
 const root = ensureRoot();
 const errEl = document.createElement('div');
 errEl.className = 'error';
 errEl.textContent = `[${code}] ${message}`;
 root.prepend(errEl);
 setTimeout(() => errEl.remove(), 8000);
}

function ensureRoot(): HTMLElement {
 let root = document.getElementById('root');
 if (!root) {
  root = document.createElement('div');
  root.id = 'root';
  document.body.appendChild(root);
 }
 return root;
}

function formatAutoQuote(autoQuote: string): string {
 if (!autoQuote) return '';
 // Block-quote the autoQuote with > prefix on each line, then blank
 // line, so reviewer can start typing.
 const quoted = autoQuote
  .split('\n')
  .map(line => `> ${line}`)
  .join('\n');
 return `${quoted}\n\n`;
}

function escapeHtml(s: string): string {
 return s
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');
}

// Render the empty state and notify host.
renderEmpty();
post({ type: 'ready' });

export {};
