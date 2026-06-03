// SPDX-License-Identifier: MIT
// Disambiguation helpers for the selection mapper. Given a list of match
// indices in the normalized string and the approximate position derived
// from textBeforeSelection, pick the best one.

export interface DisambiguateInput {
 /** All indices where normalizedSelection matches normalizedRaw. */
 matches: number[];
 /** Length of the normalized textBeforeSelection — approximate target. */
 approxStart: number;
 /** Distance threshold for "unique enough". */
 threshold?: number;
}

export interface DisambiguateResult {
 /** Best match index, or null if disambiguation failed. */
 index: number | null;
 /** True if multiple matches are within `threshold` of approxStart. */
 ambiguous: boolean;
}

export function disambiguate(input: DisambiguateInput): DisambiguateResult {
 const threshold = input.threshold ?? 20;
 if (input.matches.length === 0) {
  return { index: null, ambiguous: false };
 }
 if (input.matches.length === 1) {
  return { index: input.matches[0]!, ambiguous: false };
 }
 // Sort by absolute distance from approxStart.
 const ranked = input.matches
  .map(idx => ({ idx, distance: Math.abs(idx - input.approxStart) }))
  .sort((a, b) => a.distance - b.distance);
 const closest = ranked[0]!;
 const second = ranked[1]!;
 // Ambiguous if the two closest are both within threshold.
 if (closest.distance < threshold && second.distance < threshold) {
  return { index: null, ambiguous: true };
 }
 return { index: closest.idx, ambiguous: false };
}
