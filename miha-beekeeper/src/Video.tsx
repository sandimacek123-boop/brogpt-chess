import React from 'react';
import {AbsoluteFill, Audio, continueRender, delayRender, staticFile, useCurrentFrame} from 'remotion';
import '@fontsource/playfair-display/400.css';
import '@fontsource/playfair-display/400-italic.css';
import '@fontsource/playfair-display/700.css';
import '@fontsource/montserrat/500.css';
import '@fontsource/montserrat/600.css';
import {H, SANS, SERIF, SUB, W, clamp, ease, hexGrid, hexPoints, lerp, ramp, window01} from './lib';
import {Anniversary, Autumn, BeeDay, Bled, Birth, Daughter, Dedek, Freedom, Grandkids, Market, OwnHives, Outro, Planica, Title, Wedding, type SceneProps} from './scenes';

// wait for every weight (incl. latin-ext for č š ž) before the first frame is captured
const fontsReady = delayRender('fonts');
Promise.all(
  ['400 40px "Playfair Display"', 'italic 400 40px "Playfair Display"', '700 40px "Playfair Display"', '500 20px Montserrat', '600 20px Montserrat'].map((font) => document.fonts.load(font, 'Miha čšž ŠČŽ')),
).then(() => continueRender(fontsReady));

const BORN = 1945;
const T = 24; // transition length in frames; every scene is fully on screen at its start frame
type Caption = {text: string; from: number; to: number};
type Chapter = {C: (p: SceneProps) => React.ReactElement; start: number; end: number; year?: number; hex?: boolean; captions?: Caption[]};

// one bar of the waltz = 2 s = 60 frames, so every chapter starts on a downbeat
const CHAPTERS: Chapter[] = [
  {C: Title, start: 0, end: 240},
  {C: Birth, start: 240, end: 480, year: 1945, hex: true, captions: [{text: 'Miha is born in a little village in *Gorenjska*, beneath the three peaks of Triglav.', from: 14, to: 232}]},
  {C: Dedek, start: 480, end: 780, year: 1952, captions: [
    {text: 'His *dedek* keeps bees. At seven, Miha holds his first honeycomb, and he is hooked for life.', from: 10, to: 150},
    {text: 'The *kranjska čebela*: the gentle Carniolan honeybee, born right here in Slovenia.', from: 156, to: 292},
  ]},
  {C: Planica, start: 780, end: 1020, year: 1960, captions: [{text: 'Every March he goes to *Planica* with his father, to watch the ski jumpers fly.', from: 10, to: 232}]},
  {C: Bled, start: 1020, end: 1260, year: 1964, captions: [{text: 'Summers at Lake Bled: rowing a *pletna* to the island, ringing the wishing bell, *kremšnita* with friends.', from: 10, to: 232}]},
  {C: Wedding, start: 1260, end: 1500, year: 1970, captions: [{text: 'He marries Marija in the church on the hill. The bells ring across the whole valley.', from: 10, to: 232}]},
  {C: Daughter, start: 1500, end: 1740, year: 1973, captions: [{text: 'Their daughter Ana is born. Miha plants a linden tree, a *lipa*, in front of the house for her.', from: 10, to: 232}]},
  {C: OwnHives, start: 1740, end: 2040, year: 1976, hex: true, captions: [
    {text: 'Miha builds his own *čebelnjak*: twenty hives, every front painted by hand.', from: 14, to: 150},
    {text: 'Each summer the jars line up on the bench. The honey tastes like linden, acacia and mountain meadow.', from: 156, to: 292},
  ]},
  {C: Market, start: 2040, end: 2280, year: 1985, captions: [{text: 'On Saturdays he sells honey at the market in Ljubljana. Regulars come back every week for his *med*.', from: 10, to: 232}]},
  {C: Freedom, start: 2280, end: 2520, year: 1991, captions: [{text: '25 June 1991. Slovenia declares independence. That night Miha opens a jar of his very best honey.', from: 10, to: 232}]},
  {C: Grandkids, start: 2520, end: 2760, year: 2005, captions: [{text: 'Now *he* is the dedek. He teaches his grandkids to move slowly, and to talk softly to the bees.', from: 10, to: 232}]},
  {C: BeeDay, start: 2760, end: 3000, year: 2018, hex: true, captions: [{text: 'The whole world celebrates the first World Bee Day, because Slovenia asked. Miha has been celebrating it his whole life.', from: 14, to: 232}]},
  {C: Anniversary, start: 3000, end: 3240, year: 2020, captions: [{text: 'Fifty years with Marija. The whole family under Ana\'s *lipa*, now taller than the house.', from: 10, to: 232}]},
  {C: Autumn, start: 3240, end: 3540, year: 2024, captions: [
    {text: 'Autumn 2024. Miha, 79, sits by his hives one last golden evening.', from: 10, to: 160},
    {text: 'He leaves forty hives, a valley full of flowers, and grandkids who still talk softly to the bees.', from: 166, to: 296},
  ]},
  {C: Outro, start: 3540, end: 3840, hex: true},
];
export const TOTAL = 3840; // in 30 fps animation frames = 128 s

const HEX = hexGrid(66);
const HexMask = ({id, p}: {id: string; p: number}) => (
  <mask id={id} maskUnits="userSpaceOnUse" x={0} y={0} width={W} height={H}>
    {HEX.map((c, i) => {
      const s = clamp((p * 1.7 - c.d) / 0.7);
      return s > 0 ? <polygon key={i} points={hexPoints(c.x, c.y, 67 * ease(s))} fill="#fff" /> : null;
    })}
  </mask>
);
const HexEdge = ({p}: {p: number}) => (
  <g>
    {HEX.map((c, i) => {
      const s = clamp((p * 1.7 - c.d) / 0.7);
      return s > 0 && s < 1 ? <polygon key={i} points={hexPoints(c.x, c.y, 64 * ease(s))} fill="none" stroke="#FFC94D" strokeWidth={4} opacity={Math.sin(s * Math.PI)} /> : null;
    })}
  </g>
);

/** Caption text that writes itself on word by word; *x* marks a gold italic Slovenian word. */
const Rich = ({text, t}: {text: string; t: number}) => {
  let em = false;
  let k = 0;
  return (
    <>
      {text.split(/(\s+)/).map((w, j) => {
        if (!w.trim()) return w;
        const o = ramp(t, k * 1.7, k * 1.7 + 12);
        k++;
        // one span per word (punctuation included) so a comma can never wrap onto its own line
        return (
          <span key={j} style={{display: 'inline-block', opacity: o, transform: `translateY(${(1 - o) * 10}px)`}}>
            {w.split('*').map((part, i) => {
              if (i > 0) em = !em;
              return part ? (
                <span key={i} style={em ? {color: '#FFD27A', fontStyle: 'italic'} : undefined}>
                  {part}
                </span>
              ) : null;
            })}
          </span>
        );
      })}
    </>
  );
};

const BeeIcon = () => (
  <svg width={34} height={26} viewBox="-20 -14 40 28">
    <ellipse cx={-1} cy={-9} rx={9} ry={5} fill="#fff" opacity={0.8} transform="rotate(-25 -1 -4)" />
    <ellipse cx={0} cy={0} rx={13} ry={8.5} fill="#F2B233" />
    <path d="M-4,-8 Q-7,0 -4,8 M4,-8.5 Q1,0 4,8.5" stroke="#2A1E14" strokeWidth={4} fill="none" />
    <circle cx={13} cy={0} r={6} fill="#2A1E14" />
  </svg>
);

export const Miha = () => {
  const frame = useCurrentFrame() / SUB;
  const active = CHAPTERS.map((c, i) => ({...c, i})).filter((c) => frame >= c.start - T && frame < c.end);
  const current = [...active].reverse()[0];
  const prevYear = CHAPTERS.slice(0, current.i).reverse().find((c) => c.year)?.year ?? BORN;
  const tp = clamp((frame - (current.start - T)) / T);
  const year = current.year ? Math.round(lerp(current.i === 1 ? BORN : prevYear, current.year, ease((frame - current.start + T) / 30))) : prevYear;
  const age = year - BORN;
  const hudOn = window01(frame, 240 - T, 3540, 24);
  const blackIn = 1 - ramp(frame, 0, 20);
  const blackOut = ramp(frame, TOTAL - 50, TOTAL - 4);

  const captions = active.flatMap((c) => (c.captions ?? []).map((cap, k) => ({...cap, key: `${c.i}-${k}`, o: window01(frame - c.start, cap.from, cap.to, 16), t: frame - c.start - cap.from})));
  const captionShade = Math.max(0, ...captions.map((c) => c.o));

  return (
    <AbsoluteFill style={{backgroundColor: '#05060c'}}>
      <Audio src={staticFile('music.wav')} />
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{position: 'absolute', inset: 0}}>
        <defs>
          {active.map((c) => c.hex && frame < c.start && <HexMask key={c.i} id={`hex${c.i}`} p={(frame - (c.start - T)) / T} />)}
        </defs>
        {active.map((c) => {
          const f = frame - c.start + T;
          const p = clamp(f / T);
          const node = <c.C f={f} dur={c.end - c.start + T} />;
          if (c.i === 0 || p >= 1) return <g key={c.i}>{node}</g>;
          return c.hex ? (
            <g key={c.i}>
              <g mask={`url(#hex${c.i})`}>{node}</g>
              <HexEdge p={p} />
            </g>
          ) : (
            <g key={c.i} opacity={ease(p)}>
              {node}
            </g>
          );
        })}
        <defs>
          <radialGradient id="vig" cx="50%" cy="50%" r="75%">
            <stop offset="0.55" stopColor="#000" stopOpacity={0} />
            <stop offset="1" stopColor="#000" stopOpacity={0.55} />
          </radialGradient>
          <linearGradient id="capShade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#0a0710" stopOpacity={0} />
            <stop offset="1" stopColor="#0a0710" stopOpacity={0.7} />
          </linearGradient>
        </defs>
        <rect width={W} height={H} fill="url(#vig)" />
        <rect y={H - 380} width={W} height={380} fill="url(#capShade)" opacity={Math.max(captionShade, hudOn * 0.5)} />
      </svg>

      {captions.map((c) => (
        <div
          key={c.key}
          style={{position: 'absolute', left: 210, right: 210, bottom: 128, textAlign: 'center', fontFamily: SERIF, fontSize: 46, lineHeight: 1.32, color: '#FFF8EC', opacity: c.o, textShadow: '0 2px 18px rgba(0,0,0,0.55)', textWrap: 'balance'}}
        >
          <Rich text={c.text} t={c.t} />
        </div>
      ))}

      <div style={{position: 'absolute', left: 84, top: 64, opacity: hudOn, textShadow: '0 2px 16px rgba(0,0,0,0.45)'}}>
        <div style={{fontFamily: SERIF, fontWeight: 700, fontSize: 84, lineHeight: 1, color: '#FFF6E5', fontVariantNumeric: 'tabular-nums'}}>{year}</div>
        <div style={{fontFamily: SANS, fontWeight: 600, fontSize: 19, letterSpacing: 6, color: '#FFD27A', marginTop: 12}}>MIHA · AGE {age}</div>
      </div>

      <div style={{position: 'absolute', left: 260, right: 260, bottom: 54, height: 30, opacity: hudOn}}>
        <div style={{position: 'absolute', left: 0, right: 0, top: 14, height: 2, background: 'rgba(255,255,255,0.3)'}} />
        <div style={{position: 'absolute', left: 0, width: `${(age / 79) * 100}%`, top: 13, height: 4, borderRadius: 2, background: '#F2B233'}} />
        {CHAPTERS.filter((c) => c.year).map((c, k) => (
          // labels alternate below/above the line so close years (2018, 2020) never collide
          <div key={c.year} style={{position: 'absolute', left: `${((c.year! - BORN) / 79) * 100}%`, top: k % 2 ? -22 : 8, transform: 'translateX(-50%)', textAlign: 'center', display: 'flex', flexDirection: k % 2 ? 'column-reverse' : 'column'}}>
            <div style={{width: 2, height: 14, margin: '0 auto', background: c.year! <= year ? '#F2B233' : 'rgba(255,255,255,0.45)'}} />
            <div style={{fontFamily: SANS, fontWeight: 600, fontSize: 13, letterSpacing: 2, color: 'rgba(255,255,255,0.75)', margin: k % 2 ? '0 0 6px' : '6px 0 0'}}>{c.year}</div>
          </div>
        ))}
        <div style={{position: 'absolute', left: `${(age / 79) * 100}%`, top: -10, transform: `translate(-50%,0) translateY(${Math.sin(frame / 6) * 2}px)`}}>
          <BeeIcon />
        </div>
      </div>

      <svg width={W} height={H} style={{position: 'absolute', inset: 0, mixBlendMode: 'overlay', opacity: 0.08}}>
        <filter id="grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={Math.floor(frame) % 12} /* grain at 30 fps like film, and kinder to the encoder */ />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width={W} height={H} filter="url(#grain)" />
      </svg>
      <AbsoluteFill style={{backgroundColor: '#000', opacity: Math.max(blackIn, blackOut)}} />
    </AbsoluteFill>
  );
};
