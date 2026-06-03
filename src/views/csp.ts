// SPDX-License-Identifier: MIT
// CSP builder for both webviews per design.md §6.
// Per-panel nonces; rendered-view permits 'unsafe-inline' for style
// (mermaid requirement, ASM-009); comment-input does not.

import type * as vscode from 'vscode';
import { webcrypto as nodeWebcrypto } from 'node:crypto';

/**
 * Generate 32 chars of base62 entropy. Sufficient for per-panel nonces.
 * Uses Node's crypto.getRandomValues, which is available in the extension
 * host (Node 20+ via globalThis.crypto). The node:crypto import is a
 * safety fallback for hosts where globalThis.crypto is not yet wired.
 */
export function generateNonce(): string {
 const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
 const bytes = new Uint8Array(32);
 (globalThis.crypto ?? nodeWebcrypto).getRandomValues(bytes);
 let out = '';
 for (const b of bytes) {
  out += chars[b % chars.length];
 }
 return out;
}

/**
 * CSP for the rendered-view webview.
 *
 * NOTE on 'unsafe-inline' for style-src: REQ-NFR-SEC-001 AC-3 explicitly
 * permits this exception to accommodate mermaid's runtime style injection
 * (mermaid creates inline <style> tags for diagram theming). This exception
 * applies only to the rendered-view webview, which loads mermaid; the
 * comment-input webview omits it (see buildCommentInputCsp below).
 *
 * mermaid v10+ with securityLevel:'strict' does NOT require unsafe-eval, so
 * script-src remains strict (nonce-only).
 */
export function buildRenderedViewCsp(opts: {
 nonce: string;
 webview: vscode.Webview;
}): string {
 const src = opts.webview.cspSource;
 // https: is permitted in style-src and font-src so user-configured
 // `markdown.styles` entries that point at HTTPS URLs (or that
 // @font-face web fonts) load correctly. Local file:// styles are
 // already covered by ${src} via the webview's resource scheme.
 return [
  `default-src 'none'`,
  `img-src ${src} https: data:`,
  `script-src 'nonce-${opts.nonce}' ${src}`,
  `style-src ${src} 'unsafe-inline' https:`,
  `font-src ${src} https: data:`,
  `connect-src 'none'`
 ].join('; ');
}

/**
 * CSP for the comment-input webview — tighter than rendered-view since
 * mermaid is never loaded here.
 */
export function buildCommentInputCsp(opts: {
 nonce: string;
 webview: vscode.Webview;
}): string {
 const src = opts.webview.cspSource;
 return [
  `default-src 'none'`,
  `img-src ${src} data:`,
  `script-src 'nonce-${opts.nonce}' ${src}`,
  `style-src ${src}`,
  `font-src ${src}`,
  `connect-src 'none'`
 ].join('; ');
}
