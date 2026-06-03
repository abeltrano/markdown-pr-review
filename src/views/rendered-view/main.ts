// SPDX-License-Identifier: MIT
// Rendered-View webview bootstrap.
//
// Responsibilities:
//   1. Receive `init` payload (HTML + threads + diff annotations) from host.
//   2. Inject HTML into <article id="content">.
//   3. Initialize selection handler, thread markers, and (lazily) mermaid.
//
// The webview NEVER calls markdown-it. All rendering happens in the host.

import type {
    HostToRenderedView,
    RenderedViewInitPayload,
    RenderedViewToHost,
    RestylePayload,
    Thread
} from '../../types';
import { initMermaid } from './mermaid-loader';
import { attachSelectionHandlers, captureSelection } from './selection-handler';
import { mountThreadMarkers, refreshThreadMarkers } from './selection-highlight';

declare function acquireVsCodeApi(): {
    postMessage: (msg: RenderedViewToHost) => void;
    setState: (state: unknown) => void;
    getState: () => unknown;
};

const vscode = acquireVsCodeApi();

interface ViewState {
    init: RenderedViewInitPayload | null;
    threads: Thread[];
}

const state: ViewState = { init: null, threads: [] };

function post(message: RenderedViewToHost): void {
    vscode.postMessage(message);
}

function log(level: 'info' | 'warn' | 'error', message: string, context?: unknown): void {
    post({ type: 'log', payload: { level, message, context } });
}

window.addEventListener('message', (event: MessageEvent<HostToRenderedView>) => {
    const msg = event.data;
    try {
        switch (msg.type) {
            case 'init':
                onInit(msg.payload);
                break;
            case 'diffApplied':
                onDiffApplied(msg.payload);
                break;
            case 'threadCreated':
                state.threads.push(msg.payload.thread);
                refreshThreadMarkers(state.threads);
                break;
            case 'threadsRefreshed':
                state.threads = msg.payload.threads;
                refreshThreadMarkers(state.threads);
                break;
            case 'selectionCleared':
                clearSelection();
                break;
            case 'staleCommit':
                showStaleBanner(msg.payload.newSha, msg.payload.oldSha);
                break;
            case 'restyle':
                onRestyle(msg.payload);
                break;
            case 'error':
                showError(msg.payload.code, msg.payload.message);
                break;
            default:
                log('warn', 'Unknown host message', msg);
        }
    } catch (err) {
        log('error', 'Failed to handle host message', String(err));
    }
});

function onDiffApplied(payload: {
    html: string;
    sourceMap: Record<string, [number, number]>;
    diffAnnotations: unknown[];
}): void {
    const article = document.getElementById('content') as HTMLElement | null;
    if (!article) return;
    article.innerHTML = payload.html;
    if (state.init) {
        state.init.fileContent.html = payload.html;
        state.init.fileContent.sourceMap = payload.sourceMap;
        // diffAnnotations is unused by the renderer post-init, but keep the
        // state object internally consistent in case future code reads it.
        (state.init as { diffAnnotations: unknown[] }).diffAnnotations =
            payload.diffAnnotations;
    }
    mountThreadMarkers(state.threads, article);
    void initMermaid({
        onError: (msg) => log('warn', 'Mermaid render failure', msg)
    });
}

function onInit(payload: RenderedViewInitPayload): void {
    state.init = payload;
    state.threads = payload.threads ?? [];
    const article = document.getElementById('content') as HTMLElement | null;
    if (!article) {
        log('error', 'Content element missing');
        return;
    }
    article.innerHTML = payload.fileContent.html;
    document.body.setAttribute('data-file-path', payload.filePath);
    setHeader(payload);
    attachSelectionHandlers({
        onSelection: (sel) => {
            const payload = captureSelection(sel);
            if (payload) {
                post({ type: 'selectionMade', payload });
            }
        }
    });
    mountThreadMarkers(state.threads, article);
    initMermaid({
        onError: (msg) => log('warn', 'Mermaid render failure', msg)
    });
}

function setHeader(payload: RenderedViewInitPayload): void {
    const banner = document.getElementById('pr-banner');
    if (!banner) return;
    banner.textContent =
        `PR #${payload.pullRequest.id}: ${payload.pullRequest.title} ` +
        `(${payload.pullRequest.sourceRef} → ${payload.pullRequest.targetRef})`;
}

function clearSelection(): void {
    const sel = window.getSelection();
    if (sel) sel.removeAllRanges();
}

function showStaleBanner(newSha: string, oldSha: string): void {
    const banner = ensureBanner();
    banner.className = 'banner warn';
    banner.innerHTML =
        `<strong>Newer commit available.</strong> ` +
        `Refresh to head <code>${escapeHtml(newSha.slice(0, 8))}</code> ` +
        `(currently viewing <code>${escapeHtml(oldSha.slice(0, 8))}</code>).` +
        `<button id="refresh-to-head-btn">Refresh</button>`;
    const btn = banner.querySelector('#refresh-to-head-btn');
    btn?.addEventListener('click', () => post({ type: 'refreshToHead' }));
}

function showError(code: string, message: string): void {
    const banner = ensureBanner();
    banner.className = 'banner error';
    banner.textContent = `[${code}] ${message}`;
}

function ensureBanner(): HTMLElement {
    let banner = document.getElementById('runtime-banner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'runtime-banner';
        document.body.insertBefore(banner, document.body.firstChild);
    }
    return banner;
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// Apply a live style refresh pushed by the host after the user
// changed `markdown.preview.*` or `markdown.styles`. Updates the
// :root CSS variables that drive the prose font, then replaces
// the user-stylesheet <link> elements wholesale so the cascade
// reflects exactly what the user has currently configured.
function onRestyle(payload: RestylePayload): void {
    const root = document.documentElement;
    root.style.setProperty('--markdown-font-family', payload.fontFamily);
    root.style.setProperty('--markdown-font-size', `${payload.fontSize}px`);
    root.style.setProperty('--markdown-line-height', String(payload.lineHeight));
    const head = document.head;
    head
        .querySelectorAll('link[data-user-style="true"]')
        .forEach((el) => el.remove());
    for (const uri of payload.userStyleUris) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.setAttribute('data-user-style', 'true');
        link.href = uri;
        head.appendChild(link);
    }
}

post({ type: 'ready' });

export {};
