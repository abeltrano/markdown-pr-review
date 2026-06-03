// SPDX-License-Identifier: MIT
// Unit tests for the selection-mapper normalize layer.
// Covers stripping of emphasis, inline code, links, list markers (smoke
// for TC-050..055 inputs that the mapper feeds into).

import { expect } from 'chai';
import {
 normalizeBlock,
 normalizeText,
} from '../../../src/selection-mapper/normalize';

describe('normalizeBlock', () => {
 it('returns plain text unchanged with a complete position map', () => {
  const span = normalizeBlock(['hello world'], 1);
  expect(span.normalized).to.equal('hello world');
  expect(span.map).to.have.length('hello world'.length);
  expect(span.map[0]).to.deep.equal({ line: 1, offset: 1 });
  expect(span.map[10]).to.deep.equal({ line: 1, offset: 11 });
 });

 it('strips emphasis markers but preserves content', () => {
  const span = normalizeBlock(['this is *very* bold and **strong**'], 1);
  expect(span.normalized).to.equal('this is very bold and strong');
 });

 it('strips inline-code backticks but keeps content', () => {
  const span = normalizeBlock(['call `foo()` to begin'], 1);
  expect(span.normalized).to.equal('call foo() to begin');
 });

 it('discards link targets but keeps link text', () => {
  const span = normalizeBlock(['see [my page](https://example.com) here'], 1);
  expect(span.normalized).to.equal('see my page here');
 });

 it('discards image alt syntax markers', () => {
  const span = normalizeBlock(['![pic](https://x/p.png) cap'], 1);
  // The bracketed alt text "pic" stays in the rendered text;
  // the markers around it and the URL are stripped.
  expect(span.normalized).to.contain('pic');
  expect(span.normalized).to.not.contain('https');
 });

 it('strips heading hashes', () => {
  const span = normalizeBlock(['## Section Two'], 1);
  expect(span.normalized).to.equal('Section Two');
 });

 it('strips bullet list markers', () => {
  const span = normalizeBlock(['- first item', '- second item'], 1);
  expect(span.normalized).to.contain('first item');
  expect(span.normalized).to.contain('second item');
  expect(span.normalized).to.not.match(/^-/m);
 });

 it('strips ordered list markers', () => {
  const span = normalizeBlock(['1. alpha', '2. beta'], 1);
  expect(span.normalized).to.contain('alpha');
  expect(span.normalized).to.contain('beta');
  expect(span.normalized).to.not.match(/^\d/m);
 });

 it('strips blockquote markers', () => {
  const span = normalizeBlock(['> a quote', '> with two lines'], 1);
  expect(span.normalized).to.contain('a quote');
  expect(span.normalized).to.contain('with two lines');
  expect(span.normalized).to.not.contain('>');
 });

 it('drops fence delimiter lines entirely (but keeps fenced content)', () => {
  const span = normalizeBlock(
   ['```js', 'const a = 1;', '```'],
   10
  );
  expect(span.normalized).to.contain('const a = 1;');
  expect(span.normalized).to.not.contain('```');
 });

 it('drops table separator rows', () => {
  const span = normalizeBlock(
   ['| col1 | col2 |', '|------|------|', '| v1   | v2   |'],
   5
  );
  expect(span.normalized).to.not.contain('---');
  expect(span.normalized).to.contain('col1');
  expect(span.normalized).to.contain('v1');
 });

 it('maps every normalized character back to a valid (line, offset)', () => {
  const span = normalizeBlock(['*emphasized* word'], 7);
  for (let i = 0; i < span.normalized.length; i++) {
   const m = span.map[i];
   expect(m, `map[${i}]`).to.not.be.undefined;
   expect(m!.line).to.equal(7);
   expect(m!.offset).to.be.greaterThan(0);
  }
 });

 it('returns empty span for an empty line', () => {
  const span = normalizeBlock([''], 1);
  expect(span.normalized).to.equal('');
  expect(span.map).to.deep.equal([]);
 });
});

describe('normalizeText', () => {
 it('normalizes a freeform string by splitting on newlines', () => {
  const out = normalizeText('*hello*\n`world`');
  expect(out).to.contain('hello');
  expect(out).to.contain('world');
 });

 it('returns the empty string for the empty input', () => {
  expect(normalizeText('')).to.equal('');
 });
});
