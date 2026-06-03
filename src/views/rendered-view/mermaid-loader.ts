// SPDX-License-Identifier: MIT
// Lazy mermaid loader. Mermaid is bundled INTO the rendered-view IIFE
// (decision D-011) via dynamic import so we don't need a separate <script>
// tag at runtime.

let mermaidModule: typeof import('mermaid') | undefined;

let initialized = false;

export interface MermaidLoaderOptions {
    onError: (msg: string) => void;
}

export async function initMermaid(opts: MermaidLoaderOptions): Promise<void> {
    if (initialized) return;
    initialized = true;
    try {
        const containers = document.querySelectorAll<HTMLElement>('div.mermaid');
        if (containers.length === 0) {
            return;
        }
        if (!mermaidModule) {
            mermaidModule = await import('mermaid');
        }
        const mermaid = mermaidModule.default;
        mermaid.initialize({
            startOnLoad: false,
            theme: 'default',
            securityLevel: 'strict'
        });
        for (let i = 0; i < containers.length; i++) {
            const container = containers[i]!;
            const scriptEl = container.querySelector('script[type="text/x-mermaid"]');
            if (!scriptEl) continue;
            const source = unescapeMermaidSource(scriptEl.textContent ?? '');
            try {
                const id = `mermaid-${i}-${Date.now().toString(36)}`;
                const { svg } = await mermaid.render(id, source);
                container.innerHTML = svg;
            } catch (err) {
                container.innerHTML =
                    `<div class="mermaid-error">⚠ Mermaid render failed: ` +
                    `${escapeHtml(String(err))}</div>`;
                opts.onError(String(err));
            }
        }
    } catch (err) {
        opts.onError(String(err));
    }
}

function unescapeMermaidSource(src: string): string {
    return src
        .replace(/&quot;/g, '"')
        .replace(/&gt;/g, '>')
        .replace(/&lt;/g, '<')
        .replace(/&amp;/g, '&');
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
