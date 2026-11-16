export type ScaleId = 'continuous' | 'chromatic' | 'major' | 'minor' | 'pentatonic' | 'minorPentatonic' | 'blues' | 'wholeTone' | 'dorian';

export const SCALES: { id: ScaleId; name: string; steps: number[] | null }[] = [
  { id: 'continuous', name: 'Continuous (no scale)', steps: null },
  { id: 'chromatic', name: 'Chromatic', steps: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
  { id: 'major', name: 'Major', steps: [0, 2, 4, 5, 7, 9, 11] },
  { id: 'minor', name: 'Natural minor', steps: [0, 2, 3, 5, 7, 8, 10] },
  { id: 'dorian', name: 'Dorian', steps: [0, 2, 3, 5, 7, 9, 10] },
  { id: 'pentatonic', name: 'Major pentatonic', steps: [0, 2, 4, 7, 9] },
  { id: 'minorPentatonic', name: 'Minor pentatonic', steps: [0, 3, 5, 7, 10] },
  { id: 'blues', name: 'Blues', steps: [0, 3, 5, 6, 7, 10] },
  { id: 'wholeTone', name: 'Whole tone', steps: [0, 2, 4, 6, 8, 10] },
];

/**
 * Map a normalised value t ∈ [0,1] to a frequency between minHz and maxHz,
 * optionally snapped to the nearest note of a musical scale rooted at minHz.
 */
export function frequencyFor(t: number, minHz: number, maxHz: number, scale: ScaleId): number {
  const lo = Math.max(20, Math.min(minHz, maxHz));
  const hi = Math.max(lo + 1, Math.max(minHz, maxHz));
  const x = Math.max(0, Math.min(1, t));
  const def = SCALES.find((s) => s.id === scale);
  if (!def || !def.steps) return lo * Math.pow(hi / lo, x);
  const totalSemis = 12 * Math.log2(hi / lo);
  const semis = x * totalSemis;
  const octave = Math.floor(semis / 12);
  const within = semis - octave * 12;
  let best = def.steps[0];
  let bestD = Infinity;
  for (const s of [...def.steps, 12]) {
    const d = Math.abs(s - within);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  const snapped = Math.min(totalSemis, octave * 12 + best);
  return lo * Math.pow(2, snapped / 12);
}
