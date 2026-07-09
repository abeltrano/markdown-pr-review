// SPDX-License-Identifier: MIT
// Unit tests for the selection-mapper disambiguate helper (TC-056, TC-057
// indirectly — feeds the mapper's ambiguous-text branch).

import { expect } from 'chai';
import { disambiguate } from '../../../src/selection-mapper/disambiguate';

describe('disambiguate', () => {
  it('returns null for no matches', () => {
    const result = disambiguate({ matches: [], approxStart: 0 });
    expect(result).to.deep.equal({ index: null, ambiguous: false });
  });

  it('returns the sole match for a unique result', () => {
    const result = disambiguate({ matches: [42], approxStart: 100 });
    expect(result).to.deep.equal({ index: 42, ambiguous: false });
  });

  it('picks the closest match when one is well outside the threshold', () => {
    const result = disambiguate({
      matches: [10, 200],
      approxStart: 12,
      threshold: 20,
    });
    expect(result.index).to.equal(10);
    expect(result.ambiguous).to.equal(false);
  });

  it('reports ambiguous when two matches are both within threshold', () => {
    const result = disambiguate({
      matches: [5, 15],
      approxStart: 10,
      threshold: 20,
    });
    expect(result.index).to.equal(null);
    expect(result.ambiguous).to.equal(true);
  });

  it('respects a custom threshold', () => {
    // With threshold 4, distances 5 and 6 are both > threshold, so the
    // mapper should pick the closest (one) instead of returning ambiguous.
    const result = disambiguate({
      matches: [5, 16],
      approxStart: 10,
      threshold: 4,
    });
    expect(result.index).to.equal(5);
    expect(result.ambiguous).to.equal(false);
  });

  it('uses default threshold (20) when omitted', () => {
    const result = disambiguate({
      matches: [0, 19],
      approxStart: 10,
    });
    // Both distances (10, 9) are < 20 => ambiguous.
    expect(result.ambiguous).to.equal(true);
  });
});
