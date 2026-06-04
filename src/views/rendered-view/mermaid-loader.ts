// SPDX-License-Identifier: MIT
// Lazy mermaid loader. Mermaid is bundled INTO the rendered-view IIFE
// via dynamic import so we don't need a separate <script>
// tag at runtime.

import { sanitizeSvg } from './sanitize';

let mermaidModule: typeof import('mermaid') | undefined;
let mermaidConfigured = false;

export interface MermaidLoaderOptions {
 onError: (msg: string) => void;
}

// State machine for a mermaid container:
//   pending  → never attempted (set by the host fence rule)
//   rendering → render in progress (set before await mermaid.render)
//   rendered → SVG injected (set after successful sanitizeSvg)
//   error    → render failed (set after a thrown mermaid.render)
// The fence rule always emits state="pending"; a fresh diffApplied also
// emits state="pending" because the entire innerHTML is replaced. We
// pick up only pending containers so concurrent initMermaid invocations
// don't double-render and a failed diagram doesn't get retried in a loop.
type MermaidState = 'pending' | 'rendering' | 'rendered' | 'error';
function setState(el: HTMLElement, state: MermaidState): void {
 el.dataset.mermaidState = state;
}

export async function initMermaid(opts: MermaidLoaderOptions): Promise<void> {
 try {
  const containers = document.querySelectorAll<HTMLElement>('div.mermaid');
  if (containers.length === 0) {
   return;
  }
  const fresh: HTMLElement[] = [];
  for (const c of Array.from(containers)) {
   if (c.dataset.mermaidSource === undefined) continue;
   if (c.dataset.mermaidState === 'pending') fresh.push(c);
  }
  if (fresh.length === 0) return;
  if (!mermaidModule) {
   mermaidModule = await import('mermaid');
  }
  const mermaid = mermaidModule.default;
  if (!mermaidConfigured) {
   mermaid.initialize({
    startOnLoad: false,
    theme: 'default',
    securityLevel: 'strict'
   });
   mermaidConfigured = true;
  }
  for (let i = 0; i < fresh.length; i++) {
   const container = fresh[i]!;
   // HTML attribute values are auto-decoded by the parser, so the
   // escaped &amp;/&lt;/&gt;/&quot; emitted by the host fence rule
   // round-trip back to the original characters here.
   const source = container.dataset.mermaidSource ?? '';
   setState(container, 'rendering');
   try {
    const id = `mermaid-${i}-${Date.now().toString(36)}`;
    const { svg } = await mermaid.render(id, source);
    container.innerHTML = sanitizeSvg(svg);
    setState(container, 'rendered');
   } catch (err) {
    container.innerHTML =
     `<div class="mermaid-error">⚠ Mermaid render failed: ` +
     `${escapeHtml(String(err))}</div>`;
    setState(container, 'error');
    opts.onError(String(err));
   }
  }
 } catch (err) {
  opts.onError(String(err));
 }
}

function escapeHtml(s: string): string {
 return s
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');
}
