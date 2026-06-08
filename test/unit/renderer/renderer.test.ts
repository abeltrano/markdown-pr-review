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
  // Pulls the decoded `data-mermaid-source` content out of the n-th
  // rendered <div class="mermaid"> in the HTML so individual tests can
  // assert on what mermaid-loader will actually see at runtime.
  function extractMermaidSource(html: string, nth = 0): string {
   const matches = [
    ...html.matchAll(/<div\s+class="mermaid"[^>]*\sdata-mermaid-source="([^"]*)"/g)
   ];
   const value = matches[nth]?.[1] ?? '';
   return decodeURIComponent(value);
  }

  // DOMPurify (defense-in-depth on the webview side) strips any data-*
  // attribute whose decoded value contains raw newlines, `<`, or `>`.
  // The fence rule defends against this by URI-encoding the source —
  // every test that asserts on `data-mermaid-source` also enforces this
  // invariant so a future regression in the encoding strategy can't
  // silently re-introduce the "empty mermaid block" bug.
  function attrValueDompurifySafe(html: string): boolean {
   const matches = [
    ...html.matchAll(/<div\s+class="mermaid"[^>]*\sdata-mermaid-source="([^"]*)"/g)
   ];
   if (matches.length === 0) return false;
   for (const m of matches) {
    const v = m[1] ?? '';
    if (/[\n\r<>]/.test(v)) return false;
   }
   return true;
  }

  it('emits a div.mermaid with embedded data-mermaid-source payload', () => {
   const md =
    '```mermaid\nsequenceDiagram\nA->>B: hi\n```\n';
   const { html, mermaidBlockCount } = render({ markdown: md });
   expect(mermaidBlockCount).to.equal(1);
   expect(html).to.match(
    /<div\s+class="mermaid"[^>]*data-source-line-start="1"[^>]*data-source-line-end="4"[^>]*>/
   );
   // The diagram source is URI-encoded into a `data-mermaid-source`
   // attribute (defense against DOMPurify, which strips data-* values
   // with raw newlines or angle brackets). At runtime the webview
   // mermaid-loader decodes it via decodeURIComponent(dataset.mermaidSource).
   expect(html).to.contain('data-mermaid-source="');
   expect(html).to.contain('data-mermaid-state="pending"');
   expect(attrValueDompurifySafe(html)).to.equal(true);
   expect(extractMermaidSource(html)).to.equal('sequenceDiagram\nA->>B: hi\n');
   // The old <script> carrier MUST NOT come back — DOMPurify would
   // strip it in the webview, producing the regression we just fixed.
   expect(html).to.not.contain('<script');
  });

  it('escapes diagram source so &, <, >, " never appear raw in the attribute value', () => {
   const md = [
    '```mermaid',
    'graph TD',
    'A["<x & y>"] --> B',
    '```',
   ].join('\n');
   const { html } = render({ markdown: md });
   // URI-encoded payload contains only the URI-safe ASCII alphabet
   // (alphanumerics + -_.!~*'() + %nn escapes). The chars that would
   // break out of the attribute context (`"`) or trigger DOMPurify
   // stripping (`<`, `>`, `\n`) are all percent-encoded.
   expect(html).to.contain('data-mermaid-source="');
   expect(attrValueDompurifySafe(html)).to.equal(true);
   // Source round-trips exactly back to what the author wrote.
   expect(extractMermaidSource(html)).to.equal('graph TD\nA["<x & y>"] --> B\n');
  });

  it('regular language fences are not affected by the mermaid rule', () => {
   const md = '```js\nalert(1);\n```\n';
   const { html, mermaidBlockCount } = render({ markdown: md });
   expect(mermaidBlockCount).to.equal(0);
   expect(html).to.match(/<pre/);
   expect(html).to.not.match(/class="mermaid"/);
   expect(html).to.not.contain('data-mermaid-source');
  });

  it('preserves multiline subgraph source with HTML-label syntax', () => {
   // Mirrors a real-world failure: flowcharts with subgraphs and HTML
   // labels (the `<br/>` inside node labels) were rendered as raw text
   // when the old <script> data-island was stripped by DOMPurify, then
   // rendered AS NOTHING when DOMPurify started stripping the
   // entity-escaped data-mermaid-source attribute because of its raw
   // newlines and angle brackets. The URI-encoded carrier survives.
   const md = [
    '```mermaid',
    'graph TB',
    '  subgraph "Interface Layer"',
    '    ORCH_YML["ADO Pipeline<br/>(orchestration.yml)"]',
    '    CLI["CLI Script<br/>(release.ps1)"]',
    '  end',
    '```'
   ].join('\n');
   const { html, mermaidBlockCount } = render({ markdown: md });
   expect(mermaidBlockCount).to.equal(1);
   expect(html).to.contain('data-mermaid-source="');
   expect(attrValueDompurifySafe(html)).to.equal(true);
   const source = extractMermaidSource(html);
   expect(source).to.contain('subgraph "Interface Layer"');
   expect(source).to.contain('ADO Pipeline<br/>(orchestration.yml)');
   expect(source).to.contain('CLI Script<br/>(release.ps1)');
   // No raw <br/> escaping the attribute context.
   expect(html).to.not.contain('<br/>(orchestration.yml');
  });
 });

 describe('TC-038 — :::mermaid colon-fence block (ADO syntax)', () => {
  function extractMermaidSource(html: string, nth = 0): string {
   const matches = [
    ...html.matchAll(/<div\s+class="mermaid"[^>]*\sdata-mermaid-source="([^"]*)"/g)
   ];
   return decodeURIComponent(matches[nth]?.[1] ?? '');
  }

  it('emits a div.mermaid for a closed :::mermaid block', () => {
   const md = [
    ':::mermaid',
    'sequenceDiagram',
    'A->>B: hi',
    ':::',
    ''
   ].join('\n');
   const { html, mermaidBlockCount } = render({ markdown: md });
   expect(mermaidBlockCount).to.equal(1);
   expect(html).to.match(
    /<div\s+class="mermaid"[^>]*data-source-line-start="1"[^>]*data-source-line-end="4"[^>]*>/
   );
   expect(html).to.contain('data-mermaid-source="');
   expect(html).to.contain('data-mermaid-state="pending"');
   expect(extractMermaidSource(html)).to.equal('sequenceDiagram\nA->>B: hi\n');
  });

  it('preserves verbatim multiline subgraph content with internal indentation', () => {
   const md = [
    ':::mermaid',
    'flowchart TD',
    '    subgraph "user mode"',
    '        direction TB',
    '        A[WESP service] <--> B[WESP app]',
    '    end',
    ':::',
    ''
   ].join('\n');
   const { html, mermaidBlockCount } = render({ markdown: md });
   expect(mermaidBlockCount).to.equal(1);
   expect(html).to.contain('data-mermaid-source="');
   // Inner 4- and 8-space indentation of the diagram body is preserved
   // verbatim — only the fence's OWN indentation (zero here) is
   // stripped. Decoded source round-trips exactly.
   const source = extractMermaidSource(html);
   expect(source).to.contain('    subgraph "user mode"');
   expect(source).to.contain('        direction TB');
   expect(source).to.contain('A[WESP service] <--> B[WESP app]');
  });

  it('treats EOF as an implicit close (no terminating :::)', () => {
   const md = [
    ':::mermaid',
    'graph TD',
    'A --> B',
    ''
   ].join('\n');
   const { html, mermaidBlockCount } = render({ markdown: md });
   expect(mermaidBlockCount).to.equal(1);
   expect(html).to.match(/<div\s+class="mermaid"[^>]*>/);
   expect(extractMermaidSource(html)).to.contain('graph TD');
  });

  it('matches the opener case-insensitively', () => {
   const md = ':::Mermaid\ngraph TD\nA --> B\n:::\n';
   const { mermaidBlockCount, html } = render({ markdown: md });
   expect(mermaidBlockCount).to.equal(1);
   expect(html).to.match(/<div\s+class="mermaid"/);
  });

  it('does NOT recognise :::mermaidish (non-exact suffix)', () => {
   const md = ':::mermaidish\ngraph TD\n:::\n';
   const { mermaidBlockCount, html } = render({ markdown: md });
   expect(mermaidBlockCount).to.equal(0);
   expect(html).to.not.match(/<div\s+class="mermaid"/);
  });

  it('does NOT recognise :::mermaid followed by non-whitespace tail', () => {
   const md = ':::mermaid graph\nA --> B\n:::\n';
   const { mermaidBlockCount, html } = render({ markdown: md });
   expect(mermaidBlockCount).to.equal(0);
   expect(html).to.not.match(/<div\s+class="mermaid"/);
  });

  it('does NOT recognise a 4-space-indented opener (it is an indented code block)', () => {
   const md = '    :::mermaid\n    graph TD\n    :::\n';
   const { mermaidBlockCount, html } = render({ markdown: md });
   expect(mermaidBlockCount).to.equal(0);
   expect(html).to.match(/<pre/);
  });

  it('recognises a 3-space-indented opener and strips its leading indentation from content', () => {
   const md = [
    '   :::mermaid',
    '   graph TD',
    '   A --> B',
    '   :::',
    ''
   ].join('\n');
   const { mermaidBlockCount, html } = render({ markdown: md });
   expect(mermaidBlockCount).to.equal(1);
   expect(html).to.match(/<div\s+class="mermaid"/);
   // The fence's own 3-space indentation is stripped; content lines
   // start at column 0 in the decoded source.
   const source = extractMermaidSource(html);
   expect(source).to.contain('graph TD');
   expect(source).to.not.contain('   graph TD');
  });

  it('does NOT close on a 4-space-indented ::: line inside the body', () => {
   const md = [
    ':::mermaid',
    'graph TD',
    '    :::',
    'A --> B',
    ':::',
    ''
   ].join('\n');
   const { mermaidBlockCount, html } = render({ markdown: md });
   expect(mermaidBlockCount).to.equal(1);
   // The indented ::: is part of the diagram body, not a closer.
   expect(extractMermaidSource(html)).to.contain('A --> B');
   // The block extends across all 5 lines (open + 3 body + close).
   expect(html).to.match(/data-source-line-start="1"[^>]*data-source-line-end="5"/);
  });

  it('coexists with a regular ```mermaid block in the same document', () => {
   const md = [
    ':::mermaid',
    'graph TD',
    'A --> B',
    ':::',
    '',
    '```mermaid',
    'sequenceDiagram',
    'X->>Y: hi',
    '```',
    ''
   ].join('\n');
   const { mermaidBlockCount, html } = render({ markdown: md });
   expect(mermaidBlockCount).to.equal(2);
   const divCount = (html.match(/<div\s+class="mermaid"/g) ?? []).length;
   expect(divCount).to.equal(2);
   expect(extractMermaidSource(html, 0)).to.contain('graph TD');
   expect(extractMermaidSource(html, 1)).to.contain('sequenceDiagram');
  });

  it('does not interfere with a regular paragraph that happens to contain :::', () => {
   const md = 'See the spec :::section for details.\n';
   const { mermaidBlockCount, html } = render({ markdown: md });
   expect(mermaidBlockCount).to.equal(0);
   expect(html).to.match(/<p[^>]*>See the spec :::section for details\.<\/p>/);
  });
 });

 describe('TC-039 — diff annotations propagate to mermaid block wrappers', () => {
  it('writes data-diff-state on a ```mermaid diff-added block', () => {
   const md = '```mermaid\ngraph TD\nA --> B\n```\n';
   const { html } = render({
    markdown: md,
    diffAnnotations: [{ headLineStart: 1, headLineEnd: 4, state: 'added' }]
   });
   expect(html).to.match(
    /<div\s+class="mermaid"[^>]*data-diff-state="added"[^>]*>/
   );
  });

  it('writes data-diff-state on a :::mermaid diff-added block', () => {
   const md = ':::mermaid\ngraph TD\nA --> B\n:::\n';
   const { html } = render({
    markdown: md,
    diffAnnotations: [{ headLineStart: 1, headLineEnd: 4, state: 'added' }]
   });
   expect(html).to.match(
    /<div\s+class="mermaid"[^>]*data-diff-state="added"[^>]*>/
   );
  });
 });
});
