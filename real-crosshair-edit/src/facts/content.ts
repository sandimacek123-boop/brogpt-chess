// Fact file for the second 15 seconds. The facts come from the owner's info
// (the Real Discord), as provided by the project owner on 2026-11-17. The
// website projectreal.gg is NOT the source for these lines; it is shown only
// where the owner asked for it (the outro links).

import type {SceneId} from '../config';

export const BEAT_FRAMES = 90; // 1.5 s per beat at 60 fps
export const FACTS_FRAMES = 900; // 15 s
export const FACTS_COMPOSITION_ID = 'RealCrosshairFacts';

export const SOURCE_LABEL = 'Real Discord';

export type FactBeat = {
  kind?: 'card' | 'end';
  label: string;
  head: (e: number) => string[]; // e = eased count-up progress 0..1
  sub: string;
  src: string;
  scene: SceneId;
  bars?: Array<{label: string; value: number; shown: string}>;
};

export const FACT_BEATS: FactBeat[] = [
  {
    label: '01 · RELEASE',
    head: () => ['MAY 13, 2026'],
    sub: 'Real released on this date.',
    src: SOURCE_LABEL,
    scene: 'D',
  },
  {
    label: '02 · DETECTION',
    head: () => ['UNDETECTED'],
    sub: 'Real is undetected.',
    src: SOURCE_LABEL,
    scene: 'A',
  },
  {
    label: '03 · SCORE',
    head: (e) => [`MYRIAD ${Math.round(99 * e)}`],
    sub: 'Myriad score 99.',
    src: SOURCE_LABEL,
    scene: 'C',
  },
  {
    label: '04 · COMPATIBILITY',
    head: (e) => [`UNC ${Math.round(100 * e)}`, `sUNC ${Math.round(100 * e)}`],
    sub: 'UNC 100 and sUNC 100.',
    src: SOURCE_LABEL,
    scene: 'D',
  },
  {
    label: '05 · KEY SYSTEM',
    head: () => ['ONLY 1', 'KEY SYSTEM'],
    sub: 'One key system, no more.',
    src: SOURCE_LABEL,
    scene: 'C',
  },
  {
    label: '06 · PRICE',
    head: (e) => [`$${(2.99 * e).toFixed(2)}`],
    sub: 'Keys cost $2.99.',
    src: SOURCE_LABEL,
    scene: 'A',
  },
  {
    label: '07 · PAYMENT',
    head: () => ['CRYPTO', 'ACCEPTED'],
    sub: 'Crypto payments are supported.',
    src: SOURCE_LABEL,
    scene: 'D',
  },
  {
    label: '08 · STATUS',
    head: () => ['weao.xyz'],
    sub: 'Listed on weao.xyz.',
    src: SOURCE_LABEL,
    scene: 'C',
  },
  {
    label: '09 · OWNERS',
    head: () => ['MARKO · BYTECODE', '0xD · DADDY MARKO'],
    sub: 'The owners of Real.',
    src: SOURCE_LABEL,
    scene: 'A',
  },
  {
    kind: 'end',
    label: '10 · JOIN',
    head: () => ['projectreal.gg'],
    sub: '',
    src: 'projectreal.gg · discord.gg/projectreal',
    scene: 'BRAND',
  },
];
