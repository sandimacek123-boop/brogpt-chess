// Fact file for the second 15 seconds. Every line is taken from the official
// Project Real site (projectreal.gg) as checked on 2026-11-17. Nothing here is
// a claim that was not published there.

import type {SceneId} from '../config';

export const BEAT_FRAMES = 90; // 1.5 s per beat at 60 fps
export const FACTS_FRAMES = 900; // 15 s
export const FACTS_COMPOSITION_ID = 'RealCrosshairFacts';

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
    label: '01 · PUBLIC RELEASE',
    head: () => ['MAY 15, 2026'],
    sub: 'Real went public on this date. The first research started in 2024.',
    src: 'projectreal.gg/en/about',
    scene: 'D',
  },
  {
    label: '02 · COMMUNITY',
    head: (e) => [`${Math.round(327 * e)}K+`],
    sub: 'community members, as listed on the official About page.',
    src: 'projectreal.gg/en/about',
    scene: 'A',
  },
  {
    label: '03 · COMPATIBILITY',
    head: (e) => [`sUNC ${Math.round(100 * e)}%`],
    sub: 'Real column of the official comparison table.',
    src: 'projectreal.gg · comparison',
    scene: 'C',
    bars: [
      {label: 'sUNC', value: 1.0, shown: '100%'},
      {label: 'UNC', value: 0.99, shown: '99%'},
    ],
  },
  {
    label: '04 · FREE PLAN',
    head: () => ['$0'],
    sub: 'A new 24-hour key every 23 hours. Full access on one device.',
    src: 'projectreal.gg/en/pricing',
    scene: 'D',
  },
  {
    label: '05 · PLUS KEY',
    head: (e) => [`$${(2.99 * e).toFixed(2)}`],
    sub: '7 days, no ad-steps. Redeemed with a key, not a subscription.',
    src: 'projectreal.gg/en/pricing',
    scene: 'A',
  },
  {
    label: '06 · HOW IT WORKS',
    head: () => ['KEYS, NOT', 'SUBSCRIPTIONS'],
    sub: 'Plus and Pro keys come only from verified resellers.',
    src: 'projectreal.gg/en/pricing#redeem',
    scene: 'C',
  },
  {
    label: '07 · INJECTION',
    head: () => ['UNDER 5 SEC'],
    sub: 'Scripts that run with under 5 s injection speed, per the official homepage.',
    src: 'projectreal.gg',
    scene: 'D',
  },
  {
    label: '08 · WORKSPACE',
    head: () => ['EXECUTOR', '+ SCRIPTHUB'],
    sub: 'Cloud scripts, account tools and theme presets in one app.',
    src: 'projectreal.gg/en/about',
    scene: 'A',
  },
  {
    label: '09 · OFFICIAL DOMAINS',
    head: () => ['projectreal.gg'],
    sub: 'Also listed: projectreal.live · projectreal.net · realest.gg',
    src: 'projectreal.gg (footer)',
    scene: 'C',
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
