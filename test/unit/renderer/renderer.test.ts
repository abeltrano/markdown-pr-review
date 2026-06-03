// SPDX-License-Identifier: MIT
// Unit tests for the renderer pipeline (TC-031, TC-032, TC-033, TC-037).
// Pure-function tests via the renderer's `render()` entry point.

import { expect } from 'chai';
import { render } from '../../../src/renderer';

describe('renderer pipeline', () => {
 describe('TC-031 — emits data-source-line attributes on block elements', () => {
  it('paragraphs carry start/end attrs', () => {
   const { html } = render({ markdown: 'hello world\n' });
   expect(html).to.match(/<p[^>]*data-source-line-start="1"[^>]*>/);
   expect(html).to.match(/data-source-line-end="1"/);
  });

  it('headings carry start/end attrs', () => {
   const { html } = render({ markdown: '# Title\n\nbody\n' });
   expect(html).to.match(
    /<h1[^>]*data-source-line-start="1"[^>]*data-source-line-end="1"[^>]*>/
   );
   expect(html).to.match(
    /<p[^>]*data-source-line-start="3"[^>]*>/
   );
  });

  it('list_item, blockquote, table_open all carry attrs', () => {
   const md = [
    '- alpha',
    '- beta',
    '',
    '> quoted',
    '',
    '| a | b |',
    '|---|---|',
    '| 1 | 2 |',
    '',
   ].join('\n');
   const { html } = render({ markdown: md });
   expect(html).to.match(/<li[^>]*data-source-line-start="1"/);
   expect(html).to.match(/<blockquote[^>]*data-source-line-start="4"/);
   expect(html).to.match(/<table[^>]*data-source-line-start="6"/);
  });

  it('fence carries start/end attrs (markdown-it places them on the inner <code>)', () => {
   const md = '```js\nconst a = 1;\n```\n';
   const { html } = render({ markdown: md });
   // markdown-it's default fence renderer puts the fence-token's
   // attributes on the inner <code> element, not the outer <pre>.
   expect(html).to.match(
    /<code[^>]*data-source-line-start="1"[^>]*data-source-line-end="3"[^>]*>/
   );
  });

  it('attrs are 1-indexed with start ≤ end', () => {
   const md = '# h1\n\nparagraph that spans\ntwo lines.\n';
   const { html } = render({ markdown: md });
   const matches = Array.from(
    html.matchAll(
     /data-source-line-start="(\d+)"[^>]*data-source-line-end="(\d+)"/g
    )
   );
   expect(matches.length).to.be.greaterThan(0);
   for (const m of matches) {
    const start = Number(m[1]);
    const end = Number(m[2]);
    expect(start).to.be.greaterThan(0);
    expect(end).to.be.greaterThan(0);
    expect(start).to.be.lessThanOrEqual(end);
   }
  });
 });

 describe('TC-032 — html_block handling under html:false (safer default)', () => {
  // The renderer is configured with `html: false` so block-level raw
  // HTML is rendered as escaped text inside a paragraph, NOT as an
  // html_block token. This is the safer default (TC-033).
  it('block-level raw HTML is rendered as escaped text, not executed', () => {
   const md = '<details><summary>x</summary>body</details>\n';
   const { html } = render({ markdown: md });
   // The output is a paragraph with the HTML escaped.
   expect(html).to.match(/<p[^>]*>/);
   expect(html).to.contain('&lt;details&gt;');
   expect(html).to.contain('&lt;/details&gt;');
   // The raw HTML must NOT survive as live elements.
   expect(html).to.not.match(/<details[^>]*>/);
   expect(html).to.not.match(/<summary[^>]*>/);
  });

  it('the host paragraph carries source-line attributes', () => {
   const md = '<aside class="note"><p>nb</p></aside>\n';
   const { html } = render({ markdown: md });
   expect(html).to.match(
    /<p[^>]*data-source-line-start="1"[^>]*data-source-line-end="1"[^>]*>/
   );
   // The inner markup is escaped.
   expect(html).to.contain('&lt;aside');
   expect(html).to.contain('&lt;/aside&gt;');
  });
 });

 describe('TC-033 — dangerous HTML is rendered safely', () => {
  // markdown-it ships with html: false by default. Confirming that
  // default is the safest setting here: <script> tags should not pass
  // through to the rendered output.
  it('does not produce executable <script> from an html_block', () => {
   const md = '<script>alert(1)</script>\n';
   const { html } = render({ markdown: md });
   // Either escaped or stripped, but never a live script tag.
   expect(html).to.not.match(/<script>[^<]*alert/);
  });

  it('does not produce inline <script> from inline HTML', () => {
   const md = 'inline <script>alert(1)</script> here.\n';
   const { html } = render({ markdown: md });
   expect(html).to.not.match(/<script>alert/);
  });

  it('does not preserve onerror attribute on inline html', () => {
   const md = '<img src=x onerror=alert(1)>\n';
   const { html } = render({ markdown: md });
   // The img source itself may be present (or stripped). The
   // important invariant is that the onerror handler does not
   // survive in a live form.
   expect(html).to.not.match(/<img[^>]*onerror=/i);
  });
 });

 describe('TC-037 — mermaid fence emits CSP-safe wrapper', () => {
  it('emits a div.mermaid with embedded script[text/x-mermaid] payload', () => {
   const md =
    '```mermaid\nsequenceDiagram\nA->>B: hi\n```\n';
   const { html, mermaidBlockCount } = render({ markdown: md });
   expect(mermaidBlockCount).to.equal(1);
   expect(html).to.match(
    /<div\s+class="mermaid"[^>]*data-source-line-start="1"[^>]*data-source-line-end="4"[^>]*>/
   );
   expect(html).to.contain('<script type="text/x-mermaid">');
   expect(html).to.contain('sequenceDiagram');
   expect(html).to.contain('A-&gt;&gt;B: hi');
  });

  it('escapes diagram source so &, <, >, " do not break out of the script payload', () => {
   const md = [
    '```mermaid',
    'graph TD',
    'A["<x & y>"] --> B',
    '```',
   ].join('\n');
   const { html } = render({ markdown: md });
   expect(html).to.contain('&lt;x &amp; y&gt;');
   expect(html).to.not.match(/<script[^>]*>[^<]*<x/);
  });

  it('regular language fences are not affected by the mermaid rule', () => {
   const md = '```js\nalert(1);\n```\n';
   const { html, mermaidBlockCount } = render({ markdown: md });
   expect(mermaidBlockCount).to.equal(0);
   expect(html).to.match(/<pre/);
   expect(html).to.not.match(/class="mermaid"/);
  });
 });
});
