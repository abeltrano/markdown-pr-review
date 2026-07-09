// SPDX-License-Identifier: MIT
// Sanitization helpers for the rendered-view webview.
//
// Although our markdown-it instance is configured with `html: false`
// (so authored raw HTML never reaches the renderer output) and the
// webview runs under a strict CSP, we still pass any string destined
// for `innerHTML` through DOMPurify as defense-in-depth. This also
// satisfies CodeQL's js/xss and js/xss-through-dom queries on those
// assignments.

import DOMPurify, { type Config } from 'dompurify';

// HTML emitted by our host-side markdown-it pipeline. Markdown-it itself
// never emits scripts (html: false), but we still strip just in case.
// `data-mermaid-source` / `data-mermaid-state` carry the diagram source
// and render-state used by mermaid-loader.ts; they are listed explicitly
// here as defense-in-depth even though DOMPurify allows `data-*` by
// default (ALLOW_DATA_ATTR=true).
const HTML_CONFIG: Config = {
  ADD_TAGS: ['use'],
  ADD_ATTR: [
    'target',
    'data-source-line-start',
    'data-source-line-end',
    'data-mermaid-source',
    'data-mermaid-state',
  ],
};

// Mermaid output is well-formed SVG. We allow the SVG + svgFilters
// profiles plus `foreignObject` (used by mermaid flowcharts to host HTML
// labels — e.g. multi-line labels with `<br/>`). To keep `foreignObject`
// safe we still forbid <script> and the common inline event-handler
// attributes; HTML inside the foreignObject is allowed via the html
// profile but scripts and `on*` handlers are stripped.
//
// FORBID_CONTENTS is cleared because DOMPurify's default list includes
// both `foreignobject` AND `style` — for elements on that list it
// strips the *contents* even when the element itself is allowed. That
// quietly wiped out mermaid's diagram labels (the HTML inside each
// foreignObject) and mermaid's injected theme CSS (the rules inside
// the inline <style> at the top of every diagram), so flowcharts
// rendered as label-less boxes with default browser colors. Clearing
// the list lets the inner content survive. <script> is still removed
// because it is in FORBID_TAGS — stripping the tag also strips its
// contents — so this does not loosen the script-injection defense.
const SVG_CONFIG: Config = {
  USE_PROFILES: { html: true, svg: true, svgFilters: true },
  ADD_TAGS: ['foreignObject'],
  FORBID_TAGS: ['script'],
  FORBID_ATTR: [
    'onload',
    'onclick',
    'onerror',
    'onmouseover',
    'onfocus',
    'onblur',
  ],
  FORBID_CONTENTS: [],
};

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, HTML_CONFIG);
}

export function sanitizeSvg(svg: string): string {
  return DOMPurify.sanitize(svg, SVG_CONFIG);
}
