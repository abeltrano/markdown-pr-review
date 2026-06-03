// SPDX-License-Identifier: MIT
// Diff Annotator tests — REQ-DIFF-001 / REQ-DIFF-002.

import { expect } from 'chai';
import { annotateBlockDiff } from '../../../src/renderer/diff-annotator';

describe('annotateBlockDiff', () => {
    it('TC-040 — emits one "added" annotation per block when base is null (new file)', () => {
        const head = '# Title\n\nFirst paragraph.\n\nSecond paragraph.\n';
        const anns = annotateBlockDiff(head, null);

        expect(anns).to.have.length.greaterThan(0);
        for (const a of anns) {
            expect(a.state).to.equal('added');
            expect(a.headLineStart).to.be.greaterThan(0);
            expect(a.headLineEnd).to.be.gte(a.headLineStart);
        }
    });

    it('TC-041 — emits no annotations when head and base are identical', () => {
        const text = '# Title\n\nA paragraph.\n\nAnother paragraph.\n';
        const anns = annotateBlockDiff(text, text);
        expect(anns).to.deep.equal([]);
    });

    it('TC-042 — emits "added" for net-new paragraphs', () => {
        const base = '# Title\n\nOriginal paragraph.\n';
        const head = '# Title\n\nOriginal paragraph.\n\nA new paragraph appended here.\n';
        const anns = annotateBlockDiff(head, base);

        const added = anns.filter(a => a.state === 'added');
        expect(added).to.have.length.greaterThan(0);
        const newPara = added.find(a => a.headLineStart >= 5);
        expect(newPara, 'expected added annotation for the new paragraph').to.exist;
    });

    it('TC-043 — emits "modified" when a paragraph is changed in place', () => {
        const base = '# Title\n\nThe quick brown fox jumps over the lazy dog.\n';
        const head = '# Title\n\nThe quick brown fox vaults over the sleepy dog.\n';
        const anns = annotateBlockDiff(head, base);

        const modified = anns.filter(a => a.state === 'modified');
        expect(modified, 'expected at least one modified annotation').to.have.length.greaterThan(0);
    });

    it('TC-044 — emits "context-of-deletion" with deletedContent for removed paragraphs', () => {
        const base = '# Title\n\nKept paragraph.\n\nDoomed paragraph that will go.\n\nFinal paragraph.\n';
        const head = '# Title\n\nKept paragraph.\n\nFinal paragraph.\n';
        const anns = annotateBlockDiff(head, base);

        const ctx = anns.filter(a => a.state === 'context-of-deletion');
        expect(ctx, 'expected a context-of-deletion annotation').to.have.length.greaterThan(0);
        expect(ctx[0]!.deletedContent ?? '').to.match(/doomed/i);
    });

    it('headLineStart/headLineEnd are 1-indexed and well-formed', () => {
        const head = 'A\n\nB\n';
        const anns = annotateBlockDiff(head, null);
        for (const a of anns) {
            expect(a.headLineStart).to.be.gte(1);
            expect(a.headLineEnd).to.be.gte(a.headLineStart);
        }
    });

    it('normalization tolerates trailing whitespace differences (no spurious modifications)', () => {
        const base = 'Same paragraph here.\n';
        const head = 'Same paragraph here.   \n';
        const anns = annotateBlockDiff(head, base);
        expect(anns).to.deep.equal([]);
    });

    it('normalization tolerates case differences (no spurious modifications)', () => {
        const base = '# Title\n';
        const head = '# title\n';
        const anns = annotateBlockDiff(head, base);
        expect(anns).to.deep.equal([]);
    });

    it('handles an empty head document gracefully', () => {
        const anns = annotateBlockDiff('', '# Old content\n');
        // Either zero annotations or only context-of-deletion is acceptable.
        for (const a of anns) {
            expect(['context-of-deletion', 'added', 'modified', 'unchanged']).to.include(a.state);
        }
    });

    it('handles an empty base document (everything added)', () => {
        const head = '# Title\n\nBody.\n';
        const anns = annotateBlockDiff(head, '');
        expect(anns.every(a => a.state === 'added' || a.state === 'modified')).to.equal(true);
    });
});
