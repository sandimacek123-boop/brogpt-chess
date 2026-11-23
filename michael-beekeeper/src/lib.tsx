// Drawing primitives for the Michael film: everything is plain SVG, seeded and
// frame-deterministic, so the same frame always renders the same picture.
import React from 'react';

export const W = 1920;
export const H = 1080;
export const FPS = 30;
export const SERIF = '"Playfair Display", Georgia, serif';
export const SANS = 'Montserrat, Arial, sans-serif';

export const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const ease = (t: number) => {
  t = clamp(t);
  return t * t * (3 - 2 * t);
};
export const easeOut = (t: number) => 1 - Math.pow(1 - clamp(t), 3);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** 0→1 between frames a and b, smoothstepped */
export const ramp = (f: number, a: number, b: number) => ease((f - a) / (b - a));
/** fade in over [a, a+len], out over [b-len, b] */
export const window01 = (f: number, a: number, b: number, len = 18) => Math.min(ramp(f, a, a + len), 1 - ramp(f, b - len, b));

// ------------------------------------------------------------------ terrain
export type Ridge = {d: string; yAt: (x: number) => number};
/** A mountain/hill silhouette. sharp=0 → rolling hills, sharp=1 → alpine ridges. */
export const makeRidge = (seed: number, baseY: number, amp: number, sharp = 0.6, scale = 1, octaves = 6): Ridge => {
  const r = rng(seed);
  const ph = Array.from({length: octaves}, () => r() * Math.PI * 2);
  const yAt = (x: number) => {
    let y = 0;
    let a = 1;
    let fr = 1 / (700 * scale);
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      const s = Math.sin(x * fr * Math.PI * 2 + ph[o]);
      y += a * ((1 - sharp) * s + sharp * (1 - 2 * Math.abs(s)));
      norm += a;
      a *= 0.48;
      fr *= 2.05;
    }
    return baseY - (y / norm) * amp;
  };
  const pts: string[] = [];
  for (let x = -260; x <= W + 260; x += 8) pts.push(`${x},${yAt(x).toFixed(1)}`);
  return {d: `M-260,${H + 300} L${pts.join(' L')} L${W + 260},${H + 300} Z`, yAt};
};

export const Grad = ({id, stops, x2 = 0, y2 = 1}: {id: string; stops: [number, string, number?][]; x2?: number; y2?: number}) => (
  <linearGradient id={id} x1="0" y1="0" x2={x2} y2={y2}>
    {stops.map(([o, c, a], i) => (
      <stop key={i} offset={o} stopColor={c} stopOpacity={a ?? 1} />
    ))}
  </linearGradient>
);

export const Sky = ({id, stops}: {id: string; stops: [number, string][]}) => (
  <>
    <defs>
      <Grad id={id} stops={stops} />
    </defs>
    <rect x={-400} y={-400} width={W + 800} height={H + 800} fill={`url(#${id})`} />
  </>
);

export const Glow = ({id, x, y, r, color, opacity = 1}: {id: string; x: number; y: number; r: number; color: string; opacity?: number}) => (
  <>
    <defs>
      <radialGradient id={id}>
        <stop offset="0" stopColor={color} stopOpacity={opacity} />
        <stop offset="0.35" stopColor={color} stopOpacity={opacity * 0.35} />
        <stop offset="1" stopColor={color} stopOpacity={0} />
      </radialGradient>
    </defs>
    <circle cx={x} cy={y} r={r} fill={`url(#${id})`} />
  </>
);

export const Sun = ({id, x, y, r, core, glow}: {id: string; x: number; y: number; r: number; core: string; glow: string}) => (
  <>
    <Glow id={id} x={x} y={y} r={r * 7} color={glow} opacity={0.75} />
    <circle cx={x} cy={y} r={r} fill={core} />
  </>
);

export const Stars = ({seed, n, opacity, f, maxY = 600}: {seed: number; n: number; opacity: number; f: number; maxY?: number}) => {
  const r = rng(seed);
  return (
    <g opacity={opacity}>
      {Array.from({length: n}, (_, i) => {
        const x = r() * W;
        const y = r() * maxY;
        const s = 0.6 + r() * 1.6;
        const tw = 0.55 + 0.45 * Math.sin(f / 9 + r() * 20);
        return <circle key={i} cx={x} cy={y} r={s} fill="#fff" opacity={tw} />;
      })}
    </g>
  );
};

/** Horizontal band of drifting mist */
export const Mist = ({id, y, h, color, opacity, f, speed = 0.3}: {id: string; y: number; h: number; color: string; opacity: number; f: number; speed?: number}) => (
  <>
    <defs>
      <Grad id={id} stops={[[0, color, 0], [0.5, color, opacity], [1, color, 0]]} />
    </defs>
    {[0, 1, 2].map((k) => (
      <ellipse key={k} cx={((k * 820 + f * speed * (k + 1)) % (W + 1200)) - 300} cy={y + (k - 1) * h * 0.18} rx={760} ry={h / 2} fill={`url(#${id})`} />
    ))}
  </>
);

/** Triglav, the three-headed mountain, base centred at (x, y). */
export const Triglav = ({x, y, s = 1, rock, shade, snow, snowShade}: {x: number; y: number; s?: number; rock: string; shade: string; snow: string; snowShade?: string}) => (
  <g transform={`translate(${x},${y}) scale(${s}) translate(-500,-500)`}>
    <path d="M-120,500 L60,400 L170,340 L250,300 L330,232 L372,262 L410,240 L455,150 L500,86 L540,128 L590,196 L628,226 L672,212 L715,246 L800,306 L900,370 L1120,500 Z" fill={rock} />
    <path d="M500,86 L540,128 L590,196 L628,226 L600,300 L560,380 L520,300 L505,200 Z M672,212 L715,246 L800,306 L900,370 L1120,500 L760,500 L700,360 Z M330,232 L372,262 L360,320 L320,380 L330,300 Z" fill={shade} />
    <path d="M455,150 L500,86 L540,128 L572,172 L545,190 L528,170 L508,205 L488,180 L466,200 L446,176 Z M330,232 L372,262 L360,276 L344,266 L326,284 L312,252 Z M672,212 L700,234 L686,248 L668,238 L650,254 L645,226 Z" fill={snow} />
    {snowShade && <path d="M500,86 L540,128 L572,172 L545,190 L528,170 L512,140 Z M672,212 L700,234 L686,248 L676,230 Z" fill={snowShade} />}
    <path d="M250,300 L330,232 L312,252 L290,300 L262,318 Z M628,226 L672,212 L645,226 L640,262 Z" fill={snow} opacity={0.55} />
  </g>
);

// ------------------------------------------------------------------ flora
export const Spruce = ({x, y, h, color, trunk = '#3b2a1e'}: {x: number; y: number; h: number; color: string; trunk?: string}) => {
  const w = h * 0.46;
  let d = '';
  for (let i = 0; i < 4; i++) {
    const ty = y - h + i * h * 0.19;
    const tw = w * (0.42 + i * 0.2);
    d += `M${x},${ty} L${x + tw / 2},${ty + h * 0.34} L${x - tw / 2},${ty + h * 0.34} Z `;
  }
  return (
    <g>
      <rect x={x - h * 0.03} y={y - h * 0.14} width={h * 0.06} height={h * 0.14} fill={trunk} />
      <path d={d} fill={color} />
    </g>
  );
};

/** A band of conifers along a ridge line */
export const Forest = ({seed, ridge, n, h, color, x0 = -200, x1 = W + 200, sink = 0.3}: {seed: number; ridge: Ridge; n: number; h: number; color: string; x0?: number; x1?: number; sink?: number}) => {
  const r = rng(seed);
  const trees = Array.from({length: n}, () => {
    const x = x0 + r() * (x1 - x0);
    return {x, y: ridge.yAt(x) + h * sink + r() * h * 0.25, h: h * (0.65 + r() * 0.6)};
  }).sort((a, b) => a.y - b.y);
  return (
    <g>
      {trees.map((t, i) => (
        <Spruce key={i} x={t.x} y={t.y} h={t.h} color={color} trunk={color} />
      ))}
    </g>
  );
};

/** Round deciduous tree (orchard, cherry blossom, autumn larch-ish). */
export const RoundTree = ({x, y, h, leaf, leaf2, trunk = '#5a3b26', dots, seed = 1}: {x: number; y: number; h: number; leaf: string; leaf2?: string; trunk?: string; dots?: string; seed?: number}) => {
  const r = rng(seed);
  const cr = h * 0.33;
  const blobs = Array.from({length: 7}, () => [(r() - 0.5) * cr * 1.4, (r() - 0.5) * cr * 0.9, cr * (0.5 + r() * 0.35)]);
  return (
    <g>
      <path d={`M${x - h * 0.04},${y} L${x - h * 0.025},${y - h * 0.55} L${x + h * 0.025},${y - h * 0.55} L${x + h * 0.04},${y} Z`} fill={trunk} />
      {blobs.map(([bx, by, br], i) => (
        <circle key={i} cx={x + bx} cy={y - h * 0.62 + by} r={br} fill={i < 4 || !leaf2 ? leaf : leaf2} />
      ))}
      {dots &&
        Array.from({length: 14}, (_, i) => (
          <circle key={`d${i}`} cx={x + (r() - 0.5) * cr * 1.7} cy={y - h * 0.62 + (r() - 0.5) * cr * 1.2} r={h * 0.018} fill={dots} />
        ))}
    </g>
  );
};

export const Flowers = ({seed, ridge, n, colors, x0 = -100, x1 = W + 100, depth = 220, size = 5}: {seed: number; ridge: Ridge; n: number; colors: string[]; x0?: number; x1?: number; depth?: number; size?: number}) => {
  const r = rng(seed);
  return (
    <g>
      {Array.from({length: n}, (_, i) => {
        const x = x0 + r() * (x1 - x0);
        const dy = r() * depth;
        const s = size * (0.5 + (dy / depth) * 0.9);
        return <circle key={i} cx={x} cy={ridge.yAt(x) + 10 + dy} r={s} fill={colors[Math.floor(r() * colors.length)]} />;
      })}
    </g>
  );
};

// ------------------------------------------------------------------ buildings
/** Gorenjska house: white walls, wooden gable and balcony full of geraniums. Origin: bottom centre. */
export const House = ({x, y, s = 1, f = 0, smoke = true, glow = 0, wall = '#F4EEE2', roof = '#463631', wood = '#9A673C', seed = 0}: {x: number; y: number; s?: number; f?: number; smoke?: boolean; glow?: number; wall?: string; roof?: string; wood?: string; seed?: number}) => (
  <g transform={`translate(${x},${y}) scale(${s})`}>
    <rect x={44} y={-212} width={18} height={60} fill="#6d5c54" />
    <rect x={-70} y={-122} width={140} height={122} fill={wall} />
    <rect x={-70} y={-122} width={140} height={14} fill="#000" opacity={0.08} />
    <polygon points="-70,-120 0,-178 70,-120" fill={wood} />
    {[-40, -20, 0, 20, 40].map((gx) => (
      <line key={gx} x1={gx} y1={-120} x2={gx} y2={-120 - (70 - Math.abs(gx)) * 0.83} stroke="#000" strokeOpacity={0.15} strokeWidth={2} />
    ))}
    <polyline points="-92,-108 0,-196 92,-108" stroke={roof} strokeWidth={22} fill="none" strokeLinejoin="miter" />
    <rect x={-64} y={-104} width={128} height={7} fill="#6b4526" />
    {Array.from({length: 13}, (_, i) => (
      <rect key={i} x={-62 + i * 9.8} y={-97} width={4.5} height={22} fill="#7c5230" />
    ))}
    <rect x={-64} y={-77} width={128} height={6} fill="#6b4526" />
    {Array.from({length: 11}, (_, i) => (
      <g key={`fl${i}`}>
        <circle cx={-56 + i * 11.2} cy={-107} r={6} fill="#3f7a3a" />
        <circle cx={-56 + i * 11.2 + ((i * 7 + seed) % 5) - 2} cy={-111} r={4.6} fill={i % 3 === 1 ? '#e8534a' : '#d4352f'} />
      </g>
    ))}
    {[-46, 22].map((wx, i) => (
      <g key={wx}>
        <rect x={wx} y={-60} width={24} height={30} fill={glow && i === 0 ? '#FFD27A' : '#3B3A44'} />
        {glow > 0 && i === 0 && <rect x={wx} y={-60} width={24} height={30} fill="#FFF3C4" opacity={glow * 0.6} />}
        <rect x={wx - 9} y={-61} width={8} height={32} fill="#3f6b48" />
        <rect x={wx + 25} y={-61} width={8} height={32} fill="#3f6b48" />
        <line x1={wx + 12} y1={-60} x2={wx + 12} y2={-30} stroke={wall} strokeWidth={2} />
      </g>
    ))}
    <path d="M-12,0 V-34 Q0,-44 12,-34 V0 Z" fill="#6b4526" />
    {smoke &&
      Array.from({length: 7}, (_, k) => {
        const ph = (f / 70 + k / 7) % 1;
        return <circle key={`s${k}`} cx={53 + ph * 46 + Math.sin(ph * 6 + k) * 8} cy={-218 - ph * 150} r={8 + ph * 24} fill="#fff" opacity={(1 - ph) * 0.35} />;
      })}
  </g>
);

/** Slovenian village church: white nave, red roof, tall pointed bell tower. Origin: bottom-left of the tower. */
export const Church = ({x, y, s = 1, f = 0, ring = 0, wall = '#F6F1E7', roof = '#B4463A', shade = '#DCD2C2', dark = '#3D3B48'}: {x: number; y: number; s?: number; f?: number; ring?: number; wall?: string; roof?: string; shade?: string; dark?: string}) => (
  <g transform={`translate(${x},${y}) scale(${s})`}>
    <rect x={0} y={-96} width={190} height={96} fill={wall} />
    <rect x={0} y={-96} width={190} height={10} fill="#000" opacity={0.07} />
    <polygon points="-10,-94 200,-94 186,-152 4,-152" fill={roof} />
    <rect x={190} y={-82} width={42} height={82} fill={shade} />
    <polygon points="186,-80 238,-80 216,-116 198,-116" fill={roof} />
    {[34, 86, 138].map((wx) => (
      <path key={wx} d={`M${wx},-28 v-34 a10,10 0 0 1 20,0 v34 z`} fill={dark} />
    ))}
    <rect x={-58} y={-240} width={62} height={240} fill={wall} />
    <rect x={-8} y={-240} width={12} height={240} fill="#000" opacity={0.06} />
    <path d="M-44,-196 v-22 a6,6 0 0 1 12,0 v22 z M-22,-196 v-22 a6,6 0 0 1 12,0 v22 z" fill={dark} />
    <circle cx={-27} cy={-160} r={12} fill="#fff" stroke={dark} strokeWidth={2.5} />
    <path d="M-27,-160 v-8 M-27,-160 h6" stroke={dark} strokeWidth={2} />
    <polygon points="-65,-238 11,-238 -27,-370" fill={roof} />
    <polygon points="-27,-370 11,-238 -6,-238" fill="#000" opacity={0.12} />
    <path d="M-27,-370 v-26 M-36,-386 h18" stroke="#C9A24A" strokeWidth={3.5} />
    <path d="M-40,0 V-36 a13,13 0 0 1 26,0 V0 Z" fill="#6b4526" />
    {ring > 0 &&
      [0, 1, 2].map((k) => {
        const ph = (f / 24 + k / 3) % 1;
        return (
          <g key={k} opacity={(1 - ph) * ring * 0.8} fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round">
            <path d={`M${-27 - 30 - ph * 70},${-230} a${40 + ph * 70},${40 + ph * 70} 0 0 1 0,${30 + ph * 30}`} transform={`translate(0,${-ph * 10})`} />
            <path d={`M${-27 + 30 + ph * 70},${-230} a${40 + ph * 70},${40 + ph * 70} 0 0 0 0,${30 + ph * 30}`} transform={`translate(0,${-ph * 10})`} />
          </g>
        );
      })}
  </g>
);

/** Kozolec (toplar): the Slovenian double hayrack. Origin: bottom-left. */
export const Kozolec = ({x, y, s = 1, hay = '#D8B55B', wood = '#7e5230', dark = '#4c3020', roof = '#4E3B2E'}: {x: number; y: number; s?: number; hay?: string; wood?: string; dark?: string; roof?: string}) => (
  <g transform={`translate(${x},${y}) scale(${s})`}>
    {[1, 2].map((b) => (
      <rect key={b} x={b * 112 + 12} y={-150} width={100} height={84} fill={hay} />
    ))}
    <rect x={12} y={-118} width={100} height={52} fill={hay} />
    {[0, 1, 2, 3].map((p) => (
      <rect key={p} x={p * 112} y={-196} width={12} height={196} fill={dark} />
    ))}
    {Array.from({length: 9}, (_, r) => (
      <rect key={r} x={-4} y={-34 - r * 17} width={352} height={5} fill={wood} />
    ))}
    <polygon points="-30,-190 378,-190 360,-232 -12,-232" fill={roof} />
    <rect x={-30} y={-194} width={408} height={6} fill="#000" opacity={0.25} />
  </g>
);

/** One painted hive front (panjska končnica) with a little folk motif. */
export const Panel = ({x, y, w, h, seed}: {x: number; y: number; w: number; h: number; seed: number}) => {
  const r = rng(seed * 31 + 7);
  const bgs = ['#E9C46A', '#5B8DB8', '#C8553D', '#6A994E', '#F4E1C1', '#9D6B9E', '#E07A5F'];
  const bg = bgs[Math.floor(r() * bgs.length)];
  const motif = Math.floor(r() * 6);
  const cx = x + w / 2;
  const cy = y + h * 0.45;
  const u = Math.min(w, h);
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={bg} />
      <rect x={x + 2.5} y={y + 2.5} width={w - 5} height={h - 5} fill="none" stroke="#000" strokeOpacity={0.25} strokeWidth={2} />
      {motif === 0 && (
        <>
          <circle cx={cx + u * 0.2} cy={cy - u * 0.08} r={u * 0.14} fill="#F7D04B" />
          <path d={`M${x + 3},${y + h * 0.75} Q${cx},${y + h * 0.35} ${x + w - 3},${y + h * 0.75} Z`} fill="#4E7A3A" />
        </>
      )}
      {motif === 1 && <path d={`M${cx},${cy + u * 0.22} l${-u * 0.22},${-u * 0.2} a${u * 0.11},${u * 0.11} 0 0 1 ${u * 0.22},${-u * 0.08} a${u * 0.11},${u * 0.11} 0 0 1 ${u * 0.22},${u * 0.08} z`} fill="#C62F2F" />}
      {motif === 2 && (
        <>
          <rect x={cx - 2} y={cy} width={4} height={u * 0.25} fill="#5a3b26" />
          <polygon points={`${cx},${cy - u * 0.28} ${cx + u * 0.18},${cy + u * 0.05} ${cx - u * 0.18},${cy + u * 0.05}`} fill="#2F6B3A" />
        </>
      )}
      {motif === 3 && (
        <>
          <circle cx={cx - u * 0.14} cy={cy - u * 0.14} r={u * 0.07} fill="#F1D7B8" />
          <rect x={cx - u * 0.2} y={cy - u * 0.06} width={u * 0.12} height={u * 0.3} rx={3} fill="#B23A48" />
          <circle cx={cx + u * 0.14} cy={cy - u * 0.14} r={u * 0.07} fill="#F1D7B8" />
          <rect x={cx + u * 0.08} y={cy - u * 0.06} width={u * 0.12} height={u * 0.3} rx={3} fill="#2E4A7A" />
        </>
      )}
      {motif === 4 &&
        [0, 1, 2, 3, 4].map((k) => (
          <circle key={k} cx={cx + Math.cos((k / 5) * 6.28) * u * 0.12} cy={cy + Math.sin((k / 5) * 6.28) * u * 0.12} r={u * 0.08} fill={k % 2 ? '#fff' : '#F2C14E'} />
        ))}
      {motif === 5 && (
        <>
          <rect x={cx - u * 0.15} y={cy - u * 0.05} width={u * 0.3} height={u * 0.25} fill="#FBF6EC" />
          <polygon points={`${cx - u * 0.19},${cy - u * 0.04} ${cx},${cy - u * 0.24} ${cx + u * 0.19},${cy - u * 0.04}`} fill="#B4463A" />
        </>
      )}
      <rect x={cx - w * 0.16} y={y + h - 9} width={w * 0.32} height={5} rx={2.5} fill="#1d130c" />
      <rect x={cx - w * 0.22} y={y + h - 3} width={w * 0.44} height={4} fill="#5a3b26" />
    </g>
  );
};

/** Čebelnjak: a Slovenian bee house with stacked AŽ hives and painted fronts. Origin: bottom centre. */
export const BeeHouse = ({x, y, s = 1, seed = 1, rows = 3, cols = 6, wood = '#7A4E2D', dark = '#3A2616', roof = '#4a3426', shade = 0}: {x: number; y: number; s?: number; seed?: number; rows?: number; cols?: number; wood?: string; dark?: string; roof?: string; shade?: number}) => {
  const cw = 70;
  const ch = 44;
  const gx = 7;
  const gy = 10;
  const iw = cols * (cw + gx) + gx;
  const ih = rows * (ch + gy) + gy;
  const w = iw + 44;
  const top = -(ih + 70);
  return (
    <g transform={`translate(${x},${y}) scale(${s})`}>
      <rect x={-w / 2 + 14} y={-40} width={14} height={40} fill={dark} />
      <rect x={w / 2 - 28} y={-40} width={14} height={40} fill={dark} />
      <rect x={-w / 2} y={top} width={w} height={-top - 40} fill={wood} />
      {Array.from({length: Math.floor(w / 22)}, (_, i) => (
        <line key={i} x1={-w / 2 + 11 + i * 22} y1={top} x2={-w / 2 + 11 + i * 22} y2={-40} stroke="#000" strokeOpacity={0.12} strokeWidth={2} />
      ))}
      <rect x={-iw / 2} y={top + 30} width={iw} height={ih} fill={dark} />
      {Array.from({length: rows}, (_, r) =>
        Array.from({length: cols}, (_, c) => (
          <Panel key={`${r}-${c}`} x={-iw / 2 + gx + c * (cw + gx)} y={top + 30 + gy + r * (ch + gy)} w={cw} h={ch} seed={seed * 100 + r * cols + c} />
        )),
      )}
      {shade > 0 && <rect x={-iw / 2} y={top + 30} width={iw} height={ih} fill="#2A1630" opacity={shade} />}
      <rect x={-w / 2 - 8} y={-46} width={w + 16} height={10} fill={dark} />
      <polygon points={`${-w / 2 - 40},${top + 6} ${w / 2 + 40},${top + 6} ${w / 2 - 6},${top - 62} ${-w / 2 + 6},${top - 62}`} fill={roof} />
      {Array.from({length: 4}, (_, i) => (
        <line key={`sh${i}`} x1={-w / 2 - 30 + i * 9} y1={top - 8 - i * 14} x2={w / 2 + 30 - i * 9} y2={top - 8 - i * 14} stroke="#000" strokeOpacity={0.18} strokeWidth={2} />
      ))}
      <rect x={-w / 2 - 40} y={top + 2} width={w + 80} height={8} fill="#000" opacity={0.25} />
    </g>
  );
};

/** A single wooden hive box on a stand (for meadow scenes). Origin: bottom centre. */
export const Hive = ({x, y, s = 1, seed = 1}: {x: number; y: number; s?: number; seed?: number}) => (
  <g transform={`translate(${x},${y}) scale(${s})`}>
    <rect x={-40} y={-40} width={8} height={40} fill="#4c3020" />
    <rect x={32} y={-40} width={8} height={40} fill="#4c3020" />
    <rect x={-50} y={-110} width={100} height={72} fill="#8a5a33" />
    <rect x={-56} y={-122} width={112} height={14} fill="#5a3b26" />
    <Panel x={-44} y={-102} w={88} h={58} seed={seed} />
  </g>
);

export const HoneyJar = ({x, y, s = 1, cloth = '#C8333A', fill = '#E39B1B'}: {x: number; y: number; s?: number; cloth?: string; fill?: string}) => (
  <g transform={`translate(${x},${y}) scale(${s})`}>
    <rect x={-26} y={-66} width={52} height={66} rx={10} fill={fill} />
    <rect x={-26} y={-66} width={52} height={66} rx={10} fill="none" stroke="#fff" strokeOpacity={0.35} strokeWidth={3} />
    <rect x={-18} y={-56} width={7} height={40} rx={3.5} fill="#fff" opacity={0.4} />
    <rect x={-14} y={-40} width={28} height={18} rx={3} fill="#F7EBD3" />
    <rect x={-22} y={-74} width={44} height={10} fill="#d9c7a8" />
    <path d="M-30,-74 Q0,-92 30,-74 L24,-62 Q0,-70 -24,-62 Z" fill={cloth} />
    <path d="M-30,-74 Q0,-92 30,-74" stroke="#fff" strokeWidth={2} strokeDasharray="4 4" fill="none" opacity={0.7} />
  </g>
);

// ------------------------------------------------------------------ creatures
/** Faces +x. Wings are drawn semi-transparent in two positions for a motion-blur flutter. */
export const Bee = ({x, y, s = 1, rot = 0, f = 0}: {x: number; y: number; s?: number; rot?: number; f?: number}) => {
  const left = Math.abs(((rot % 360) + 540) % 360 - 180) < 90;
  const tf = left ? `translate(${x},${y}) rotate(${rot - 180}) scale(${-s},${s})` : `translate(${x},${y}) rotate(${rot}) scale(${s})`;
  const up = f % 2 === 0;
  return (
    <g transform={tf}>
      <ellipse cx={-1} cy={-10} rx={10} ry={5.5} fill="#fff" opacity={up ? 0.75 : 0.35} transform="rotate(-28 -1 -4)" />
      <ellipse cx={3} cy={-8} rx={8} ry={4.5} fill="#fff" opacity={up ? 0.35 : 0.7} transform="rotate(8 3 -3)" />
      <ellipse cx={0} cy={0} rx={13} ry={8.5} fill="#F2B233" />
      <path d="M-4,-8 Q-7,0 -4,8 M4,-8.5 Q1,0 4,8.5" stroke="#2A1E14" strokeWidth={4} fill="none" />
      <polygon points="-12,-1.6 -18,0 -12,1.6" fill="#2A1E14" />
      <circle cx={13} cy={0} r={6.2} fill="#2A1E14" />
      <path d="M16,-4 q4,-7 8,-6 M15,-5 q2,-8 6,-9" stroke="#2A1E14" strokeWidth={1.6} fill="none" />
    </g>
  );
};

export const beePath = (seed: number, cx: number, cy: number, rx: number, ry: number) => {
  const r = rng(seed);
  const a1 = r() * 6.28;
  const a2 = r() * 6.28;
  const w1 = 0.55 + r() * 0.8;
  const w2 = 0.8 + r() * 1.2;
  const scale = 0.65 + r() * 0.55;
  const pos = (t: number): [number, number] => [cx + rx * Math.sin(t * w1 + a1) * (0.7 + 0.3 * Math.cos(t * 0.37 + a2)), cy + ry * Math.sin(t * w2 + a2) * (0.75 + 0.25 * Math.sin(t * 0.5))];
  return {pos, scale};
};

export const Swarm = ({seed, n, cx, cy, rx, ry, f, s = 1, speed = 1}: {seed: number; n: number; cx: number; cy: number; rx: number; ry: number; f: number; s?: number; speed?: number}) => (
  <g>
    {Array.from({length: n}, (_, i) => {
      const {pos, scale} = beePath(seed * 97 + i, cx, cy, rx, ry);
      const t = (f / FPS) * speed;
      const [x, y] = pos(t);
      const [x2, y2] = pos(t + 0.03);
      return <Bee key={i} x={x} y={y} s={s * scale} rot={(Math.atan2(y2 - y, x2 - x) * 180) / Math.PI} f={f + i} />;
    })}
  </g>
);

/** Floating pollen / dust motes in sunlight */
export const Motes = ({seed, n, f, color = '#FFF2C2', area = [0, 0, W, H]}: {seed: number; n: number; f: number; color?: string; area?: number[]}) => {
  const r = rng(seed);
  const [ax, ay, aw, ah] = area;
  return (
    <g>
      {Array.from({length: n}, (_, i) => {
        const x = ax + ((r() * aw + f * (0.3 + r() * 0.6)) % aw);
        const y = ay + ((r() * ah - f * (0.15 + r() * 0.3) + ah * 10) % ah);
        const rr = 1.2 + r() * 2.6;
        const tw = 0.4 + 0.6 * Math.abs(Math.sin(f / 20 + i));
        return <circle key={i} cx={x} cy={y} r={rr} fill={color} opacity={tw * 0.8} />;
      })}
    </g>
  );
};

/** Falling leaves or petals */
export const Falling = ({seed, n, f, colors, size = 10, area = [0, -100, W, H + 200], speed = 1}: {seed: number; n: number; f: number; colors: string[]; size?: number; area?: number[]; speed?: number}) => {
  const r = rng(seed);
  const [ax, ay, aw, ah] = area;
  return (
    <g>
      {Array.from({length: n}, (_, i) => {
        const vy = (0.8 + r() * 1.4) * speed;
        const y = ay + ((r() * ah + f * vy) % ah);
        const sway = Math.sin(f / (20 + r() * 25) + r() * 6) * 40;
        const x = ax + ((r() * aw + f * 0.6 * speed) % aw) + sway;
        const rot = f * (2 + r() * 4) + r() * 360;
        const sz = size * (0.6 + r() * 0.8);
        return <ellipse key={i} cx={x} cy={y} rx={sz} ry={sz * 0.5 * (0.4 + 0.6 * Math.abs(Math.cos(rot / 40)))} transform={`rotate(${rot} ${x} ${y})`} fill={colors[i % colors.length]} />;
      })}
    </g>
  );
};

// ------------------------------------------------------------------ people
export type Look = {skin?: string; top?: string; bottom?: string; hair?: string; hat?: string; dress?: boolean; veil?: string; beeVeil?: boolean; cane?: boolean; hunch?: number};
const SIL = '#241C2B';
/** Minimal storybook figure. Origin at the feet; h = height in px; unit space is 100 tall. */
export const Person = ({x, y, h, look = {}, child = false, f = 0, walk = 0, flip = false, arm = 0, holding}: {x: number; y: number; h: number; look?: Look; child?: boolean; f?: number; walk?: number; flip?: boolean; arm?: number; holding?: React.ReactNode}) => {
  const skin = look.skin ?? SIL;
  const top = look.top ?? SIL;
  const bottom = look.bottom ?? SIL;
  const hair = look.hair ?? skin;
  const hunch = look.hunch ?? 0;
  const head = child ? {cy: -84, r: 13} : {cy: -90, r: 8.5};
  const shoulder = child ? -70 : -79;
  const hip = child ? -40 : -46;
  const sw = walk ? Math.sin((f / FPS) * Math.PI * 2 * 1.4) * 14 * walk : 0;
  return (
    <g transform={`translate(${x},${y}) scale(${(flip ? -1 : 1) * (h / 100)},${h / 100})`}>
      <g transform={`rotate(${sw} 0 ${hip})`}>
        <rect x={-8.5} y={hip - 1} width={7} height={-hip + 1} rx={3} fill={bottom} />
      </g>
      <g transform={`rotate(${-sw} 0 ${hip})`}>
        <rect x={1.5} y={hip - 1} width={7} height={-hip + 1} rx={3} fill={bottom} />
      </g>
      <g transform={`rotate(${hunch} 0 ${hip})`}>
        {look.veil && <path d={`M-4,${head.cy - 8} Q-26,${head.cy + 30} -22,-6 L-6,-6 Z`} fill={look.veil} opacity={0.85} />}
        {look.dress ? (
          <path d={`M-10,${shoulder} Q0,${shoulder - 4} 10,${shoulder} L12,${hip} L19,-8 L-19,-8 L-12,${hip} Z`} fill={top} />
        ) : (
          <path d={`M-12,${shoulder} Q0,${shoulder - 4} 12,${shoulder} L10.5,${hip + 2} L-10.5,${hip + 2} Z`} fill={top} />
        )}
        <path d={`M-11,${shoulder + 2} L-14,${hip - 2}`} stroke={top} strokeWidth={5.5} strokeLinecap="round" transform={`rotate(${-sw * 0.8} -11 ${shoulder + 2})`} />
        <path d={`M11,${shoulder + 2} L14,${hip - 2}`} stroke={top} strokeWidth={5.5} strokeLinecap="round" transform={`rotate(${-arm + sw * 0.8} 11 ${shoulder + 2})`} />
        {holding && <g transform={`rotate(${-arm} 11 ${shoulder + 2}) translate(14,${hip - 2})`}>{holding}</g>}
        <rect x={-3} y={head.cy + head.r - 3} width={6} height={shoulder - head.cy - head.r + 5} fill={skin} />
        {look.hair && <circle cx={-1.5} cy={head.cy - 1} r={head.r + 1.2} fill={hair} />}
        <circle cx={0.8} cy={head.cy + 0.5} r={head.r} fill={skin} />
        {look.hair && <path d={`M${-head.r - 0.5},${head.cy} a${head.r + 0.5},${head.r + 0.5} 0 0 1 ${head.r * 2 + 1},-2 q-${head.r},-${head.r * 0.4} -${head.r * 2 + 1},2 z`} fill={hair} />}
        {look.hat && (
          <>
            <ellipse cx={0.5} cy={head.cy - head.r * 0.55} rx={head.r * 1.9} ry={head.r * 0.32} fill={look.hat} />
            <rect x={-head.r * 0.85} y={head.cy - head.r * 1.45} width={head.r * 1.8} height={head.r * 0.95} rx={2} fill={look.hat} />
          </>
        )}
        {look.beeVeil && <path d={`M${-head.r * 1.8},${head.cy - head.r * 0.5} L${-head.r * 1.4},${head.cy + head.r * 1.5} L${head.r * 1.6},${head.cy + head.r * 1.5} L${head.r * 2},${head.cy - head.r * 0.5} Z`} fill="#f4f1ea" opacity={0.45} />}
        {look.cane && <line x1={14} y1={hip - 2} x2={20} y2={0} stroke="#5a3b26" strokeWidth={2.6} strokeLinecap="round" />}
      </g>
    </g>
  );
};

/** A golden honeycomb frame, held by a figure */
export const CombFrame = ({w = 34, h = 24, f = 0}: {w?: number; h?: number; f?: number}) => (
  <g transform={`translate(${-w / 2},${-h})`}>
    <rect x={0} y={0} width={w} height={h} fill="#8a5a33" />
    <rect x={2} y={2} width={w - 4} height={h - 4} fill="#E9A23B" />
    {Array.from({length: 12}, (_, i) => (
      <circle key={i} cx={4 + (i % 6) * 5.2 + (Math.floor(i / 6) % 2) * 2.6} cy={6 + Math.floor(i / 6) * 9} r={2} fill="#F7CD6B" opacity={0.6 + 0.4 * Math.sin(f / 8 + i)} />
    ))}
  </g>
);

// ------------------------------------------------------------------ honeycomb
export const hexPoints = (cx: number, cy: number, r: number) =>
  Array.from({length: 6}, (_, i) => {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  }).join(' ');

export const hexGrid = (r: number) => {
  const w = Math.sqrt(3) * r;
  const cells: {x: number; y: number; d: number}[] = [];
  for (let row = -1; row * 1.5 * r < H + r * 2; row++) {
    for (let col = -1; col * w < W + w; col++) {
      const x = col * w + (row % 2 ? w / 2 : 0);
      const y = row * 1.5 * r;
      cells.push({x, y, d: Math.hypot(x - W / 2, y - H / 2) / Math.hypot(W / 2, H / 2)});
    }
  }
  return cells;
};
