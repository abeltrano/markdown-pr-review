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
const HTML_CONFIG: Config = {
 ADD_TAGS: ['use'],
 ADD_ATTR: ['target', 'data-source-line-start', 'data-source-line-end']
};

// Mermaid output is well-formed SVG. We allow the SVG profile but
// explicitly strip scripts, foreign objects, and inline event handlers
// to neutralise any malicious diagram source that slipped past
// mermaid's strict securityLevel.
const SVG_CONFIG: Config = {
 USE_PROFILES: { svg: true, svgFilters: true },
 FORBID_TAGS: ['script', 'foreignObject'],
 FORBID_ATTR: ['onload', 'onclick', 'onerror']
};

export function sanitizeHtml(html: string): string {
 return DOMPurify.sanitize(html, HTML_CONFIG);
}

export function sanitizeSvg(svg: string): string {
 return DOMPurify.sanitize(svg, SVG_CONFIG);
}

// Stylesheet URIs delivered via host -> webview messages should only ever
// be VS Code webview-resource URIs (which present as https://...) or
// explicit https URLs. Drop anything else so that an attacker who
// controls a message payload cannot inject `javascript:` or other
// scriptable schemes through a <link href>.
export function isSafeStylesheetUri(uri: string): boolean {
 try {
  const url = new URL(uri);
  return url.protocol === 'https:';
 } catch {
  return false;
 }
}
