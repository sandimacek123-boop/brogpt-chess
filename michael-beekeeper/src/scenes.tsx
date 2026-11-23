// The eleven chapters of Michael's life. Each scene gets its local frame f
// (f = 24 when it is fully on screen) and its duration, and returns SVG.
import React from 'react';
import {
  Bee, BeeHouse, Church, CombFrame, Falling, Flowers, Forest, Glow, Grad, Hive, HoneyJar, House, Kozolec, Mist, Motes, Person, RoundTree,
  SANS, SERIF, Sky, Spruce, Stars, Sun, Swarm, Triglav, W, H, clamp, easeOut, hexGrid, hexPoints, lerp, makeRidge, ramp, rng,
} from './lib';

export type SceneProps = {f: number; dur: number};

const Cam = ({f, dur, z0 = 1, z1 = 1.08, ox = W / 2, oy = H / 2, children}: SceneProps & {z0?: number; z1?: number; ox?: number; oy?: number; children: React.ReactNode}) => {
  const s = lerp(z0, z1, f / dur);
  return <g transform={`translate(${ox},${oy}) scale(${s}) translate(${-ox},${-oy})`}>{children}</g>;
};
/** parallax: shifts a layer sideways as the scene progresses */
const Par = ({f, dur, d, children}: SceneProps & {d: number; children: React.ReactNode}) => <g transform={`translate(${(0.5 - f / dur) * d},0)`}>{children}</g>;

const Rays = ({id, x, y, color, opacity, f}: {id: string; x: number; y: number; color: string; opacity: number; f: number}) => (
  <>
    <defs>
      <radialGradient id={id} cx={x} cy={y} r={1400} gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor={color} stopOpacity={opacity} />
        <stop offset="1" stopColor={color} stopOpacity={0} />
      </radialGradient>
    </defs>
    {[0, 1, 2, 3, 4].map((k) => {
      const a = (110 + k * 13 + Math.sin(f / 50 + k) * 2) * (Math.PI / 180);
      const b = a + (0.05 + (k % 2) * 0.035);
      return <polygon key={k} points={`${x},${y} ${x + Math.cos(a) * 2200},${y + Math.sin(a) * 2200} ${x + Math.cos(b) * 2200},${y + Math.sin(b) * 2200}`} fill={`url(#${id})`} />;
    })}
  </>
);

// ================================================================== 1. title
const t1 = {far: makeRidge(11, 640, 110, 0.7, 0.8), mid: makeRidge(12, 790, 80, 0.4, 1.1), near: makeRidge(13, 930, 50, 0.1, 1.6)};
export const Title = ({f, dur}: SceneProps) => {
  const dawn = ramp(f, 0, 210);
  const bee = (t: number): [number, number] => {
    const u = clamp(t);
    return [lerp(-120, 1500, easeOut(u)) + Math.sin(u * 14) * 30 * (1 - u), 290 + Math.sin(u * 9) * 110 * (1 - u) + (1 - u) * 80];
  };
  const bt = (f - 30) / 130;
  const [bx, by] = f < 160 ? bee(bt) : [1500 + Math.sin((f - 160) / 9) * 26, 290 + Math.sin((f - 160) / 6) * 14];
  const [bx2, by2] = f < 160 ? bee(bt + 0.01) : [1500 + Math.sin((f - 159) / 9) * 26, 290 + Math.sin((f - 159) / 6) * 14];
  const trail = Array.from({length: 40}, (_, i) => bee(bt - 0.4 + i * 0.01)).filter((_, i) => bt - 0.4 + i * 0.01 > 0);
  return (
    <Cam f={f} dur={dur} z0={1.06} z1={1}>
      <Sky id="t1s" stops={[[0, '#121834'], [0.42, '#3D3462'], [0.72, '#B56A80'], [1, '#F4B37A']]} />
      <Stars seed={5} n={160} opacity={1 - dawn * 0.9} f={f} maxY={520} />
      <Sun id="t1sun" x={1380} y={lerp(800, 610, dawn)} r={46} core="#FFE2B0" glow="#FFB070" />
      <Par f={f} dur={dur} d={20}>
        <path d={t1.far.d} fill="#6E5D8C" />
      </Par>
      <Par f={f} dur={dur} d={40}>
        <Triglav x={960} y={900} s={0.9} rock="#7A6A98" shade="#5A4C7A" snow={`rgb(${246},${lerp(200, 224, dawn)},${lerp(214, 226, dawn)})`} snowShade="#CFA9C3" />
        <Mist id="t1m" y={720} h={120} color="#F5C6B8" opacity={0.4} f={f} />
      </Par>
      <Par f={f} dur={dur} d={80}>
        <path d={t1.mid.d} fill="#3F3560" />
        <Forest seed={14} ridge={t1.mid} n={70} h={70} color="#3F3560" />
      </Par>
      <Par f={f} dur={dur} d={140}>
        <path d={t1.near.d} fill="#211B36" />
        <Forest seed={15} ridge={t1.near} n={90} h={120} color="#211B36" />
      </Par>
      <rect x={-200} y={-200} width={W + 400} height={H + 400} fill="#0B0F22" opacity={0.5 * (1 - dawn)} />
      <g opacity={ramp(f, 40, 85)} transform={`translate(960,${lerp(300, 290, ramp(f, 40, 120))})`}>
        <text textAnchor="middle" fontFamily={SERIF} fontWeight={700} fontSize={170} letterSpacing={lerp(60, 26, ramp(f, 40, 140))} fill="#FFF4E3" style={{filter: 'drop-shadow(0 6px 30px rgba(40,10,40,0.55))'}}>
          MICHAEL
        </text>
      </g>
      <text x={960} y={370} textAnchor="middle" fontFamily={SANS} fontWeight={600} fontSize={26} letterSpacing={14} fill="#FFE2B8" opacity={ramp(f, 80, 115)}>
        1945 — 2024
      </text>
      <text x={960} y={428} textAnchor="middle" fontFamily={SERIF} fontStyle="italic" fontSize={38} fill="#FFF4E3" opacity={ramp(f, 105, 140)}>
        a Slovenian life among the bees
      </text>
      {trail.length > 1 && <polyline points={trail.map(([x, y]) => `${x},${y}`).join(' ')} fill="none" stroke="#FFD27A" strokeWidth={3} strokeDasharray="2 12" strokeLinecap="round" opacity={0.75} />}
      {f > 30 && <Bee x={bx} y={by} s={1.6} rot={(Math.atan2(by2 - by, bx2 - bx) * 180) / Math.PI} f={f} />}
    </Cam>
  );
};

// ================================================================== 2. birth 1945
const t2 = {far: makeRidge(21, 520, 120, 0.75, 0.7), mid: makeRidge(22, 610, 60, 0.3, 1.2), hill: makeRidge(23, 735, 45, 0, 2.4, 3), near: makeRidge(24, 870, 35, 0, 3, 3)};
export const Birth = ({f, dur}: SceneProps) => {
  const houses = [
    {x: 470, s: 0.62},
    {x: 640, s: 0.7},
    {x: 905, s: 0.86, glow: true},
    {x: 1110, s: 0.66},
  ];
  return (
    <Cam f={f} dur={dur} z0={1} z1={1.13} ox={905} oy={640}>
      <Sky id="t2s" stops={[[0, '#86BCE3'], [0.55, '#CFE6F0'], [1, '#F8E7C6']]} />
      <Sun id="t2sun" x={1560} y={190} r={52} core="#FFF7DE" glow="#FFE6A6" />
      <Par f={f} dur={dur} d={16}>
        <path d={t2.far.d} fill="#A3B8CF" />
        <Triglav x={660} y={590} s={0.62} rock="#93A9C3" shade="#7A92B0" snow="#FFFFFF" snowShade="#DCE6F0" />
        <Mist id="t2m" y={590} h={110} color="#FFFFFF" opacity={0.55} f={f} />
      </Par>
      <Par f={f} dur={dur} d={34}>
        <path d={t2.mid.d} fill="#5F8A6A" />
        <Forest seed={25} ridge={t2.mid} n={120} h={60} color="#436F50" />
      </Par>
      <Par f={f} dur={dur} d={56}>
        <path d={t2.hill.d} fill="#8DB463" />
        <Church x={1330} y={t2.hill.yAt(1330) + 18} s={0.78} />
        {[300, 780, 1010, 1520, 1680].map((x, i) => (
          <RoundTree key={x} x={x} y={t2.hill.yAt(x) + 22} h={110 + (i % 2) * 30} leaf="#4F7F3E" leaf2="#5E9148" seed={i + 3} />
        ))}
        {houses.map((hs, i) => (
          <House key={hs.x} x={hs.x} y={t2.hill.yAt(hs.x) + 26} s={hs.s} f={f + i * 20} glow={hs.glow ? 0.5 + 0.5 * Math.sin(f / 9) : 0} seed={i} />
        ))}
        <Glow id="t2g" x={905 - 34 * 0.86} y={t2.hill.yAt(905) + 26 - 45 * 0.86} r={70} color="#FFD27A" opacity={0.5 + 0.3 * Math.sin(f / 9)} />
      </Par>
      <Par f={f} dur={dur} d={100}>
        <path d={t2.near.d} fill="#6E9C49" />
        <Kozolec x={70} y={t2.near.yAt(200) + 30} s={0.9} />
        <Flowers seed={26} ridge={t2.near} n={160} colors={['#FFFFFF', '#F7D44C', '#C9A0DC', '#F28C8C']} size={4.5} />
      </Par>
    </Cam>
  );
};

// ================================================================== 3. dedek's bees 1952
const t3 = {far: makeRidge(31, 500, 110, 0.75, 0.75), hill: makeRidge(32, 650, 40, 0, 2, 3), ground: makeRidge(33, 780, 25, 0, 3, 3)};
export const Dedek = ({f, dur}: SceneProps) => (
  <Cam f={f} dur={dur} z0={1.02} z1={1.1} ox={980} oy={600}>
    <Sky id="t3s" stops={[[0, '#93C2DE'], [0.5, '#F2DDB2'], [1, '#F6C88A']]} />
    <Sun id="t3sun" x={1700} y={150} r={50} core="#FFF4D6" glow="#FFD98C" />
    <Par f={f} dur={dur} d={14}>
      <path d={t3.far.d} fill="#AEB9C6" />
      <Mist id="t3m" y={540} h={90} color="#FFF3DD" opacity={0.6} f={f} />
    </Par>
    <Par f={f} dur={dur} d={30}>
      <path d={t3.hill.d} fill="#86A95B" />
      {[120, 330, 1420, 1600, 1810].map((x, i) => (
        <RoundTree key={x} x={x} y={t3.hill.yAt(x) + 30} h={150 + (i % 3) * 25} leaf="#5B8A3F" leaf2="#6E9C4A" dots="#D9443A" seed={i + 11} />
      ))}
    </Par>
    <Par f={f} dur={dur} d={60}>
      <path d={t3.ground.d} fill="#6E9B47" />
      <Flowers seed={34} ridge={t3.ground} n={120} colors={['#FFFFFF', '#F7D44C', '#B48FD8']} size={4.5} />
      <BeeHouse x={720} y={805} s={1.15} seed={3} />
      <Person x={1170} y={815} h={250} look={{skin: '#E6C1A0', top: '#4E6E8E', bottom: '#3B3B45', hair: '#D9D9D9', hat: '#8A7350', hunch: 5}} flip arm={25} />
      <Person x={1060} y={820} h={150} child look={{skin: '#F0CBA5', top: '#C8553D', bottom: '#2E4A7A', hair: '#6B4A2B'}} flip arm={95 + Math.sin(f / 12) * 6} holding={<CombFrame f={f} />} />
      <Swarm seed={3} n={16} cx={720} cy={610} rx={340} ry={130} f={f} s={0.9} />
      <Swarm seed={4} n={5} cx={980} cy={630} rx={70} ry={50} f={f} s={0.75} speed={1.4} />
    </Par>
    <Rays id="t3r" x={1700} y={150} color="#FFF1C8" opacity={0.22} f={f} />
    <Motes seed={35} n={50} f={f} />
  </Cam>
);

// ================================================================== 4. Lake Bled 1964
const WATER = 660;
const t4 = {far: makeRidge(41, 430, 160, 0.82, 0.7), mid: makeRidge(42, 610, 55, 0.2, 1.4)};
const BledLand = ({f}: {f: number}) => (
  <>
    <path d={t4.far.d} fill="#93B2CE" />
    <path d={t4.mid.d} fill="#3F6E58" />
    <Forest seed={43} ridge={t4.mid} n={150} h={55} color="#2F5A46" />
    {/* castle cliff */}
    <path d="M1360,672 L1410,520 L1440,420 L1470,330 L1600,318 L1700,330 L1760,380 L1820,470 L1920,560 L1960,672 Z" fill="#7B7C70" />
    <path d="M1470,330 L1520,322 L1500,450 L1460,560 L1410,672 L1360,672 L1410,520 L1440,420 Z" fill="#666759" />
    <Forest seed={44} ridge={{d: '', yAt: (x) => (x < 1700 ? 9999 : 400 + (x - 1700) * 0.9)}} n={40} h={60} color="#2F5A46" x0={1700} x1={1960} />
    <g transform="translate(1500,322)">
      <rect x={0} y={-70} width={180} height={70} fill="#EDE6D6" />
      <polygon points="-8,-68 188,-68 176,-100 4,-100" fill="#A2463A" />
      <rect x={140} y={-130} width={36} height={130} fill="#E3DACA" />
      <polygon points="134,-128 182,-128 158,-170" fill="#A2463A" />
      <rect x={20} y={-46} width={12} height={16} fill="#4a4652" />
      <rect x={60} y={-46} width={12} height={16} fill="#4a4652" />
      <rect x={100} y={-46} width={12} height={16} fill="#4a4652" />
      <rect x={-20} y={-30} width={30} height={30} fill="#DCD2C2" />
    </g>
    {/* the island with its church */}
    <path d={`M600,${WATER + 4} Q640,${WATER - 40} 720,${WATER - 62} Q820,${WATER - 84} 920,${WATER - 60} Q1000,${WATER - 40} 1040,${WATER + 4} Z`} fill="#3F7A44" />
    {[650, 700, 990, 1010].map((x, i) => (
      <RoundTree key={x} x={x} y={WATER - 10 - (i % 2) * 20} h={90 + i * 6} leaf="#2F6A3A" leaf2="#3B7A45" seed={i + 40} />
    ))}
    <Church x={800} y={WATER - 66} s={0.62} f={f} />
    <path d={`M760,${WATER} L780,${WATER - 40} L800,${WATER - 66}`} stroke="#EDE6D6" strokeWidth={6} fill="none" />
  </>
);
export const Bled = ({f, dur}: SceneProps) => {
  const bx = lerp(150, 560, f / dur);
  return (
    <Cam f={f} dur={dur} z0={1} z1={1.07} ox={800} oy={620}>
      <Sky id="t4s" stops={[[0, '#5AA6DC'], [0.6, '#BCDFF2'], [1, '#EAF4F2']]} />
      <Sun id="t4sun" x={1130} y={120} r={44} core="#FFFBEA" glow="#FFF0B8" />
      <BledLand f={f} />
      <defs>
        <Grad id="t4w" stops={[[0, '#4C93B8'], [0.4, '#2F7AA3'], [1, '#1B5579']]} />
        <clipPath id="t4c">
          <rect x={-200} y={WATER} width={W + 400} height={H} />
        </clipPath>
      </defs>
      <rect x={-200} y={WATER} width={W + 400} height={H} fill="url(#t4w)" />
      <g clipPath="url(#t4c)" opacity={0.32}>
        <g transform={`translate(0,${WATER * 2}) scale(1,-1)`}>
          <BledLand f={f} />
        </g>
      </g>
      {Array.from({length: 26}, (_, i) => {
        const y = WATER + 8 + i * i * 0.65;
        const off = (f * (0.6 + (i % 4) * 0.2) + i * 137) % 400;
        return <line key={i} x1={-200 + off} y1={y} x2={W + 200} y2={y} stroke="#fff" strokeOpacity={0.12 + (i % 3) * 0.05} strokeWidth={1 + i * 0.08} strokeDasharray={`${60 + i * 6} ${90 + i * 9}`} />;
      })}
      {/* pletna boat */}
      <g transform={`translate(${bx},${790 + Math.sin(f / 14) * 3})`}>
        <path d="M-260,0 L-200,-40 L-160,-40" stroke="#fff" strokeOpacity={0.4} strokeWidth={3} fill="none" />
        {[0, 1, 2].map((k) => (
          <path key={k} d={`M${-230 - k * 60},${10 + k * 6} q-40,6 -80,0`} stroke="#fff" strokeOpacity={0.35 - k * 0.1} strokeWidth={3} fill="none" />
        ))}
        <Person x={-150} y={-36} h={110} look={{skin: '#E6C1A0', top: '#2B2F3A', bottom: '#2B2F3A', hair: '#3a2a1e'}} />
        <line x1={-135} y1={-80} x2={-200} y2={20} stroke="#5a3b26" strokeWidth={4} />
        <Person x={-40} y={-36} h={80} look={{skin: '#E6C1A0', top: '#F4F1EA', bottom: '#3F4A6B', hair: '#5B3A22'}} arm={40} />
        <Person x={0} y={-36} h={76} look={{skin: '#F0CBA5', top: '#E07A5F', dress: true, hair: '#7A4A2A'}} flip />
        <Person x={40} y={-36} h={80} look={{skin: '#E0B890', top: '#5B8DB8', bottom: '#3B3B45', hair: '#2a1a12'}} flip />
        <path d="M-80,-118 L90,-118 L110,-100 L-100,-100 Z" fill="#C8333A" />
        {[0, 1, 2, 3, 4].map((k) => (
          <rect key={k} x={-88 + k * 40} y={-110} width={20} height={10} fill="#fff" />
        ))}
        <line x1={-90} y1={-100} x2={-90} y2={-38} stroke="#5a3b26" strokeWidth={3} />
        <line x1={100} y1={-100} x2={100} y2={-38} stroke="#5a3b26" strokeWidth={3} />
        <path d="M-180,-40 L170,-40 Q200,-40 210,-62 L230,-58 Q215,0 160,0 L-150,0 Q-190,0 -200,-30 Z" fill="#6B4526" />
        <path d="M-180,-40 L170,-40 Q200,-40 210,-62" stroke="#3a2416" strokeWidth={4} fill="none" />
      </g>
      <RoundTree x={20} y={1000} h={520} leaf="#2C5A35" leaf2="#376B40" seed={47} />
    </Cam>
  );
};

// ================================================================== 5. wedding 1970
const t5 = {far: makeRidge(51, 520, 110, 0.7, 0.8), hill: makeRidge(52, 700, 70, 0, 2.2, 3), ground: makeRidge(53, 800, 20, 0, 3, 3)};
export const Wedding = ({f, dur}: SceneProps) => (
  <Cam f={f} dur={dur} z0={1.08} z1={1} ox={900} oy={600}>
    <Sky id="t5s" stops={[[0, '#9AC3E8'], [0.6, '#F5D2D0'], [1, '#FCE8D8']]} />
    <Sun id="t5sun" x={420} y={180} r={46} core="#FFF8EC" glow="#FFE0D0" />
    <Par f={f} dur={dur} d={16}>
      <path d={t5.far.d} fill="#B7C4DA" />
    </Par>
    <Par f={f} dur={dur} d={36}>
      <path d={t5.hill.d} fill="#8DBA66" />
      <Church x={1150} y={t5.hill.yAt(1150) + 24} s={1.05} f={f} ring={1 - ramp(f, 150, 220)} />
      {[260, 620, 1640, 1820].map((x, i) => (
        <RoundTree key={x} x={x} y={t5.hill.yAt(x) + 30} h={180 + (i % 2) * 40} leaf="#F2B3C0" leaf2="#F8CFD8" trunk="#6b4a3a" seed={i + 50} />
      ))}
      {[1060, 1290, 1330, 1380].map((x, i) => (
        <Person key={x} x={x} y={t5.hill.yAt(x) + 30} h={70} look={{skin: '#E6C1A0', top: ['#5B8DB8', '#9D6B9E', '#6A994E', '#E07A5F'][i], dress: i % 2 === 1, bottom: '#3b3b45', hair: '#4a3020'}} flip={i > 0} />
      ))}
    </Par>
    <Par f={f} dur={dur} d={70}>
      <path d={t5.ground.d} fill="#76A653" />
      <Flowers seed={54} ridge={t5.ground} n={120} colors={['#FFFFFF', '#F7C4D0', '#F7D44C']} size={4.5} />
      <Person x={820} y={820} h={225} look={{skin: '#F0CBA5', top: '#FFFFFF', dress: true, veil: '#FFFFFF', hair: '#7A4A2A'}} arm={-25} />
      <Person x={900} y={820} h={240} look={{skin: '#E6C1A0', top: '#2B2F3A', bottom: '#2B2F3A', hair: '#5B3A22'}} flip arm={-25} />
      <circle cx={845} cy={743} r={9} fill="#F4E1C1" />
      <circle cx={850} cy={735} r={6} fill="#E8534A" />
    </Par>
    <Falling seed={55} n={70} f={f} colors={['#F8C9D4', '#FFFFFF', '#F2A7B8']} size={8} />
  </Cam>
);

// ================================================================== 6. his own bee house 1976
const t6 = {far: makeRidge(61, 520, 120, 0.75, 0.75), hill: makeRidge(62, 660, 40, 0.1, 1.8, 3), ground: makeRidge(63, 780, 20, 0, 3, 3)};
const BigPanel = ({x, y, w, h, reveal}: {x: number; y: number; w: number; h: number; reveal: number}) => (
  <g>
    <defs>
      <clipPath id="t6p">
        {Array.from({length: 7}, (_, i) => {
          const r = clamp(reveal * 7 - i * 0.85);
          return <rect key={i} x={x} y={y + (i * h) / 7 - 4} width={w * r} height={h / 7 + 8} rx={14} />;
        })}
      </clipPath>
    </defs>
    <rect x={x - 22} y={y - 22} width={w + 44} height={h + 44} fill="#F7EEDC" />
    <rect x={x} y={y} width={w} height={h} fill="#E9DFC9" />
    <g clipPath="url(#t6p)">
      <rect x={x} y={y} width={w} height={h} fill="#6FA3CF" />
      <circle cx={x + w * 0.78} cy={y + h * 0.24} r={h * 0.11} fill="#F7D04B" />
      <Triglav x={x + w * 0.42} y={y + h * 0.72} s={w / 1500} rock="#F4F1EA" shade="#D8D3CA" snow="#FFFFFF" />
      <path d={`M${x},${y + h * 0.78} Q${x + w * 0.5},${y + h * 0.5} ${x + w},${y + h * 0.74} L${x + w},${y + h} L${x},${y + h} Z`} fill="#4E8A3A" />
      <Church x={x + w * 0.74} y={y + h * 0.7} s={w / 1800} />
      <Bee x={x + w * 0.3} y={y + h * 0.78} s={w / 140} rot={-12} f={0} />
      {[0.08, 0.92].map((k) => (
        <g key={k}>
          <circle cx={x + w * k} cy={y + h * 0.88} r={h * 0.05} fill="#C62F2F" />
          <circle cx={x + w * k} cy={y + h * 0.88} r={h * 0.02} fill="#F7D04B" />
        </g>
      ))}
    </g>
    <rect x={x} y={y} width={w} height={h} fill="none" stroke="#9A3B2F" strokeWidth={10} />
  </g>
);
export const OwnHives = ({f, dur}: SceneProps) => {
  const slide = easeOut((f - 40) / 40);
  const jars = Math.floor(clamp((f - 70) / 120) * 6);
  return (
    <Cam f={f} dur={dur} z0={1} z1={1.05}>
      <Sky id="t6s" stops={[[0, '#7CAFD6'], [0.55, '#F4C98C'], [1, '#F1A35E']]} />
      <Sun id="t6sun" x={300} y={260} r={50} core="#FFF0C8" glow="#FFC77A" />
      <Par f={f} dur={dur} d={14}>
        <path d={t6.far.d} fill="#A49EB4" />
      </Par>
      <Par f={f} dur={dur} d={30}>
        <path d={t6.hill.d} fill="#7E9B55" />
        <Forest seed={64} ridge={t6.hill} n={60} h={70} color="#506E3C" x0={1200} />
      </Par>
      <Par f={f} dur={dur} d={50}>
        <path d={t6.ground.d} fill="#6E9343" />
        <Flowers seed={65} ridge={t6.ground} n={90} colors={['#FFFFFF', '#F7D44C', '#E8786A']} size={4.5} />
        <BeeHouse x={520} y={800} s={1.1} seed={7} rows={4} cols={5} />
        <Person x={880} y={805} h={235} look={{skin: '#E6C1A0', top: '#F4F1EA', bottom: '#3F4A6B', hair: '#5B3A22'}} flip arm={70 + Math.sin(f / 6) * 8} holding={<g><rect x={-1.2} y={-13} width={2.4} height={13} fill="#5a3b26" /><rect x={-1.8} y={-18} width={3.6} height={6} rx={1.5} fill="#C8333A" /></g>} />
        <rect x={1020} y={765} width={330} height={14} fill="#6b4526" />
        <rect x={1035} y={779} width={12} height={30} fill="#4c3020" />
        <rect x={1323} y={779} width={12} height={30} fill="#4c3020" />
        {Array.from({length: jars}, (_, i) => (
          <HoneyJar key={i} x={1060 + i * 52} y={765} s={0.8} cloth={i % 2 ? '#C8333A' : '#2E6AB0'} />
        ))}
        <Swarm seed={6} n={14} cx={520} cy={530} rx={300} ry={160} f={f} s={0.85} />
      </Par>
      <g transform={`translate(${lerp(560, 0, slide)},0) rotate(-3 1560 380)`} opacity={slide}>
        <rect x={1260} y={160} width={610} height={440} fill="#000" opacity={0.18} transform="translate(12,16)" />
        <BigPanel x={1282} y={182} w={566} h={396} reveal={clamp((f - 70) / 170)} />
        <text x={1565} y={650} textAnchor="middle" fontFamily={SERIF} fontStyle="italic" fontSize={34} fill="#FFF8EC" style={{filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.4))'}}>
          panjska končnica · painted hive front
        </text>
      </g>
    </Cam>
  );
};

// ================================================================== 7. independence 1991
const CoatOfArms = ({x, y, s}: {x: number; y: number; s: number}) => {
  const star = (cx: number, cy: number, r: number) =>
    Array.from({length: 12}, (_, i) => {
      const a = (Math.PI / 6) * i - Math.PI / 2;
      const rr = i % 2 ? r * 0.5 : r;
      return `${cx + Math.cos(a) * rr},${cy + Math.sin(a) * rr}`;
    }).join(' ');
  return (
    <g transform={`translate(${x},${y}) scale(${s})`}>
      <defs>
        <clipPath id="t7arms">
          <path d="M0,0 H60 V50 Q60,72 30,80 Q0,72 0,50 Z" />
        </clipPath>
      </defs>
      <path d="M0,0 H60 V50 Q60,72 30,80 Q0,72 0,50 Z" fill="#0B4EA2" />
      <g clipPath="url(#t7arms)">
        <polygon points="-2,64 16,40 22,46 30,26 38,46 44,40 62,64 62,90 -2,90" fill="#fff" />
        <path d="M0,62 q7.5,-5 15,0 t15,0 t15,0 t15,0 M0,70 q7.5,-5 15,0 t15,0 t15,0 t15,0" stroke="#0B4EA2" strokeWidth={3} fill="none" />
      </g>
      <polygon points={star(21, 11, 5)} fill="#F7D04B" />
      <polygon points={star(39, 11, 5)} fill="#F7D04B" />
      <polygon points={star(30, 20, 5)} fill="#F7D04B" />
      <path d="M0,0 H60 V50 Q60,72 30,80 Q0,72 0,50 Z" fill="none" stroke="#E21E26" strokeWidth={3.5} />
    </g>
  );
};
const SloFlag = ({x, y, w, f}: {x: number; y: number; w: number; f: number}) => {
  const h = w / 2;
  const N = 40;
  const wave = (u: number) => Math.sin(u * 2.6 * Math.PI - f * 0.17) * 16 * u + u * 18;
  const pts = (row: number) => Array.from({length: N + 1}, (_, i) => [x + (i / N) * w * (1 - 0.04 * Math.sin(f * 0.1)), y + row + wave(i / N)] as const);
  const band = (a: number, b: number, color: string) => {
    const top = pts(a);
    const bot = pts(b).reverse();
    return <polygon points={[...top, ...bot].map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join(' ')} fill={color} />;
  };
  const au = 0.22;
  return (
    <g>
      {band(0, h / 3, '#FFFFFF')}
      {band(h / 3, (2 * h) / 3, '#0B4EA2')}
      {band((2 * h) / 3, h, '#E21E26')}
      <g transform={`translate(0,${wave(au)})`}>
        <CoatOfArms x={x + w * 0.17} y={y + h * 0.1} s={(h * 0.42) / 80} />
      </g>
      {Array.from({length: N}, (_, i) => {
        const slope = wave((i + 1) / N) - wave(i / N);
        const top = pts(0);
        const bot = pts(h);
        return <polygon key={i} points={`${top[i][0]},${top[i][1]} ${top[i + 1][0]},${top[i + 1][1]} ${bot[i + 1][0]},${bot[i + 1][1]} ${bot[i][0]},${bot[i][1]}`} fill={slope > 0 ? '#000' : '#fff'} opacity={Math.min(0.28, Math.abs(slope) * 0.09)} />;
      })}
    </g>
  );
};
const t7 = {far: makeRidge(71, 600, 120, 0.75, 0.8), town: makeRidge(72, 830, 30, 0, 2, 3)};
const BURSTS = [
  [20, 640, 250, '#FFFFFF'], [55, 1500, 220, '#4F8CFF'], [85, 760, 180, '#FF4D5A'], [120, 1650, 330, '#FFFFFF'], [150, 420, 330, '#4F8CFF'], [175, 1000, 150, '#FF4D5A'], [205, 560, 300, '#FFFFFF'], [230, 1420, 160, '#4F8CFF'],
] as const;
export const Freedom = ({f, dur}: SceneProps) => {
  const flagY = lerp(720, 300, easeOut((f - 24) / 110));
  return (
    <Cam f={f} dur={dur} z0={1.04} z1={1}>
      <Sky id="t7s" stops={[[0, '#060A1D'], [0.6, '#152049'], [1, '#2D3767']]} />
      <Stars seed={7} n={200} opacity={0.9} f={f} maxY={700} />
      {BURSTS.map(([t0, bx, by, col], k) => {
        const lt = f - t0;
        if (lt < -22 || lt > 75) return null;
        if (lt < 0) {
          const u = (lt + 22) / 22;
          return <circle key={k} cx={bx} cy={lerp(900, by, easeOut(u))} r={3} fill="#FFE6B0" />;
        }
        const u = easeOut(lt / 45);
        const fade = 1 - clamp(lt / 75);
        return (
          <g key={k} opacity={fade}>
            <Glow id={`t7b${k}`} x={bx} y={by} r={260 * u + 20} color={col} opacity={0.35 * (1 - clamp(lt / 20))} />
            {Array.from({length: 28}, (_, i) => {
              const a = (i / 28) * Math.PI * 2 + k;
              const rr = 190 * u;
              const gy = lt * lt * 0.025;
              const px = bx + Math.cos(a) * rr;
              const py = by + Math.sin(a) * rr + gy;
              return <line key={i} x1={bx + Math.cos(a) * rr * 0.82} y1={by + Math.sin(a) * rr * 0.82 + gy * 0.8} x2={px} y2={py} stroke={col} strokeWidth={3.5} strokeLinecap="round" />;
            })}
          </g>
        );
      })}
      <path d={t7.far.d} fill="#141B38" />
      <path d={t7.town.d} fill="#0E1329" />
      {[150, 330, 470, 1480, 1640, 1790].map((x, i) => (
        <g key={x}>
          <House x={x} y={t7.town.yAt(x) + 30} s={0.55 + (i % 2) * 0.1} smoke={false} wall="#121833" roof="#0B0F22" wood="#121833" />
          <rect x={x - 25} y={t7.town.yAt(x) + 30 - 30} width={12} height={15} fill="#FFD27A" opacity={0.85} />
        </g>
      ))}
      <Church x={1240} y={t7.town.yAt(1240) + 30} s={0.65} wall="#121833" roof="#0B0F22" shade="#121833" dark="#FFD27A" />
      <rect x={1176} y={250} width={10} height={720} fill="#C9C3B5" />
      <circle cx={1181} cy={248} r={9} fill="#E8D48A" />
      <SloFlag x={1186} y={flagY} w={440} f={f} />
      <rect x={-200} y={960} width={W + 400} height={200} fill="#070A17" />
      {Array.from({length: 26}, (_, i) => {
        const r = rng(700 + i);
        const x = 40 + i * 72 + r() * 30;
        return <Person key={i} x={x} y={1000 + r() * 30} h={150 + r() * 50} look={{}} arm={i % 3 === 0 ? 150 + Math.sin(f / 8 + i) * 15 : 0} flip={i % 2 === 0} />;
      })}
      <Glow id="t7jar" x={262} y={835} r={110} color="#FFB43A" opacity={0.8} />
      <Person x={230} y={975} h={230} look={{}} arm={60} holding={<HoneyJar x={0} y={6} s={0.38} />} />
      <Person x={305} y={975} h={212} look={{dress: true}} flip />
    </Cam>
  );
};

// ================================================================== 8. grandkids 2005
const t8 = {far: makeRidge(81, 520, 120, 0.75, 0.75), mid: makeRidge(82, 640, 50, 0.2, 1.5), ground: makeRidge(83, 775, 25, 0, 3, 3)};
export const Grandkids = ({f, dur}: SceneProps) => (
  <Cam f={f} dur={dur} z0={1} z1={1.08} ox={900} oy={620}>
    <Sky id="t8s" stops={[[0, '#64AEE3'], [0.6, '#BEE2F5'], [1, '#EEF6E2']]} />
    <Sun id="t8sun" x={1650} y={170} r={50} core="#FFFBEA" glow="#FFF0B8" />
    <Par f={f} dur={dur} d={14}>
      <path d={t8.far.d} fill="#9EB6CF" />
      <Triglav x={1380} y={560} s={0.55} rock="#93A9C3" shade="#7A92B0" snow="#FFFFFF" snowShade="#DCE6F0" />
    </Par>
    <Par f={f} dur={dur} d={30}>
      <path d={t8.mid.d} fill="#78A657" />
      <Forest seed={84} ridge={t8.mid} n={50} h={60} color="#466F3C" x0={900} />
      <Kozolec x={160} y={t8.mid.yAt(300) + 60} s={0.62} />
    </Par>
    <Par f={f} dur={dur} d={60}>
      <path d={t8.ground.d} fill="#6FA046" />
      <Flowers seed={85} ridge={t8.ground} n={260} colors={['#FFFFFF', '#F7D44C', '#F7D44C', '#E03B3B', '#B48FD8']} size={5} />
      {[340, 520, 700].map((x, i) => (
        <Hive key={x} x={x} y={795} s={1.1} seed={i * 3 + 20} />
      ))}
      <Person x={1130} y={805} h={240} look={{skin: '#E6C1A0', top: '#F4F1EA', bottom: '#C9B48A', hair: '#C8C8C8', hat: '#F4F1EA', beeVeil: true}} flip arm={55} holding={<CombFrame f={f} w={26} h={18} />} />
      <Person x={960} y={810} h={140} child look={{skin: '#F0CBA5', top: '#F2C14E', bottom: '#3F6EA8', hair: '#8A5A2B', hat: '#F4F1EA', beeVeil: true}} arm={70 + Math.sin(f / 10) * 10} />
      <Person x={1290} y={812} h={124} child look={{skin: '#F0CBA5', top: '#E07A5F', dress: true, hair: '#C08A4A'}} flip arm={30} />
      <Swarm seed={8} n={14} cx={540} cy={650} rx={280} ry={90} f={f} s={0.85} />
      <Swarm seed={9} n={4} cx={1050} cy={650} rx={90} ry={50} f={f} s={0.75} />
    </Par>
    <Motes seed={86} n={30} f={f} />
  </Cam>
);

// ================================================================== 9. World Bee Day 2018
export const BeeDay = ({f, dur}: SceneProps) => {
  const cx = 960;
  const cy = 540;
  const R = 210;
  const rot = lerp(-40, 30, f / dur) * (Math.PI / 180);
  const proj = (lat: number, lon: number) => {
    const la = (lat * Math.PI) / 180;
    const lo = (lon * Math.PI) / 180 - rot;
    return {x: cx + R * Math.cos(la) * Math.sin(lo), y: cy - R * Math.sin(la), z: Math.cos(la) * Math.cos(lo)};
  };
  const meridians = Array.from({length: 12}, (_, k) => {
    const pts: string[] = [];
    for (let lat = -90; lat <= 90; lat += 6) {
      const p = proj(lat, k * 30);
      if (p.z > 0) pts.push(`${p.x.toFixed(1)},${p.y.toFixed(1)}`);
    }
    return pts.join(' ');
  });
  const si = proj(46.1, 14.8);
  const orbit = Array.from({length: 11}, (_, i) => {
    const a = (f / 40) + (i / 11) * Math.PI * 2;
    const ox = Math.cos(a) * 340;
    const oy = Math.sin(a) * 90;
    const tilt = -0.2;
    return {x: cx + ox * Math.cos(tilt) - oy * Math.sin(tilt), y: cy + ox * Math.sin(tilt) + oy * Math.cos(tilt), front: Math.sin(a) > 0, a};
  });
  const beeAt = (o: (typeof orbit)[number], i: number) => <Bee key={i} x={o.x} y={o.y} s={1.15} rot={((o.a + Math.PI / 2) * 180) / Math.PI - 11} f={f + i} />;
  return (
    <Cam f={f} dur={dur} z0={1.05} z1={1}>
      <defs>
        <radialGradient id="t9bg" cx="50%" cy="50%" r="70%">
          <stop offset="0" stopColor="#FFD45E" />
          <stop offset="1" stopColor="#E3851E" />
        </radialGradient>
        <radialGradient id="t9globe" cx="38%" cy="32%" r="75%">
          <stop offset="0" stopColor="#5FB0E0" />
          <stop offset="1" stopColor="#1B4F86" />
        </radialGradient>
      </defs>
      <rect x={-200} y={-200} width={W + 400} height={H + 400} fill="url(#t9bg)" />
      {hexGrid(62).map((c, i) => (
        <polygon key={i} points={hexPoints(c.x, c.y, 58)} fill="none" stroke="#FFF1B8" strokeWidth={3} opacity={0.12 + 0.12 * Math.sin(f / 15 - c.d * 8)} />
      ))}
      <Glow id="t9glow" x={cx} y={cy} r={420} color="#FFF6D0" opacity={0.6} />
      {orbit.filter((o) => !o.front).map((o, i) => beeAt(o, i))}
      <circle cx={cx} cy={cy} r={R} fill="url(#t9globe)" />
      {[-60, -30, 0, 30, 60].map((lat) => {
        const y = cy - R * Math.sin((lat * Math.PI) / 180);
        const hw = R * Math.cos((lat * Math.PI) / 180);
        return <line key={lat} x1={cx - hw} y1={y} x2={cx + hw} y2={y} stroke="#BFE3FF" strokeOpacity={0.35} strokeWidth={2} />;
      })}
      {meridians.map((pts, k) => pts && <polyline key={k} points={pts} fill="none" stroke="#BFE3FF" strokeOpacity={0.35} strokeWidth={2} />)}
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="#FFF6D0" strokeWidth={4} opacity={0.6} />
      {si.z > 0.05 && (
        <g opacity={clamp(si.z * 3)}>
          <circle cx={si.x} cy={si.y} r={10 + ((f % 40) / 40) * 30} fill="none" stroke="#FFD45E" strokeWidth={3} opacity={1 - (f % 40) / 40} />
          <path d={`M${si.x},${si.y} l-11,-22 a12.5,12.5 0 1 1 22,0 z`} fill="#E21E26" stroke="#fff" strokeWidth={2.5} />
          <circle cx={si.x} cy={si.y - 30} r={4.5} fill="#fff" />
          <text x={si.x + 22} y={si.y - 28} fontFamily={SANS} fontWeight={600} fontSize={20} letterSpacing={4} fill="#fff">
            SLOVENIJA
          </text>
        </g>
      )}
      {orbit.filter((o) => o.front).map((o, i) => beeAt(o, i + 20))}
      <text x={cx} y={175} textAnchor="middle" fontFamily={SERIF} fontWeight={700} fontSize={84} fill="#3A2410" opacity={ramp(f, 30, 60)}>
        20 May · World Bee Day
      </text>
      <text x={cx} y={228} textAnchor="middle" fontFamily={SANS} fontWeight={600} fontSize={21} letterSpacing={5} fill="#5A3A16" opacity={ramp(f, 50, 80)}>
        PROPOSED BY SLOVENIA · ANTON JANŠA'S BIRTHDAY
      </text>
    </Cam>
  );
};

// ================================================================== 10. last autumn 2024
const t10 = {far: makeRidge(101, 600, 130, 0.75, 0.75), mid: makeRidge(102, 720, 60, 0.25, 1.4), ground: makeRidge(103, 805, 18, 0, 3, 3)};
export const Autumn = ({f, dur}: SceneProps) => {
  const gone = ramp(f, 185, 245);
  const sunY = lerp(560, 700, f / dur);
  const land = clamp((f - 220) / 60);
  const bench = {x: 930, y: 815};
  return (
    <Cam f={f} dur={dur} z0={1} z1={1.1} ox={930} oy={700}>
      <Sky id="t10s" stops={[[0, '#2E2A5A'], [0.45, '#AE4F78'], [0.75, '#F08A4B'], [1, '#FFC56E']]} />
      <Sun id="t10sun" x={1400} y={sunY} r={60} core="#FFE3A0" glow="#FF9E5A" />
      <Par f={f} dur={dur} d={14}>
        <path d={t10.far.d} fill="#6B3B66" />
        <Mist id="t10m" y={650} h={110} color="#FFB08A" opacity={0.35} f={f} />
      </Par>
      <Par f={f} dur={dur} d={30}>
        <path d={t10.mid.d} fill="#47284D" />
        <Forest seed={104} ridge={t10.mid} n={90} h={80} color="#C9792F" />
        <Forest seed={105} ridge={t10.mid} n={40} h={70} color="#E3A33B" sink={0.5} />
      </Par>
      <Par f={f} dur={dur} d={50}>
        <path d={t10.ground.d} fill="#2B1C30" />
        <BeeHouse x={470} y={820} s={0.95} seed={7} rows={4} cols={5} wood="#5A3A2A" dark="#2A1A12" roof="#2E1E18" shade={0.4} />
        <Spruce x={1700} y={830} h={300} color="#E3A33B" trunk="#5a3b26" />
        <Spruce x={1820} y={840} h={360} color="#C9792F" trunk="#5a3b26" />
        {/* bench */}
        <rect x={bench.x - 110} y={bench.y - 62} width={220} height={12} rx={3} fill="#4a2e22" />
        <rect x={bench.x - 110} y={bench.y - 100} width={220} height={10} rx={3} fill="#4a2e22" />
        <rect x={bench.x - 96} y={bench.y - 100} width={10} height={100} fill="#3a2218" />
        <rect x={bench.x + 86} y={bench.y - 100} width={10} height={100} fill="#3a2218" />
        <g opacity={1 - gone}>
          <g transform={`translate(${bench.x - 10},${bench.y})`}>
            <rect x={-6} y={-70} width={46} height={11} rx={5} fill="#3A3046" />
            <rect x={30} y={-70} width={10} height={70} rx={4} fill="#3A3046" />
            <rect x={16} y={-70} width={10} height={70} rx={4} fill="#3A3046" />
          </g>
          <Person x={bench.x - 14} y={bench.y + 30} h={200} look={{skin: '#C99A7A', top: '#6A4F5E', bottom: 'transparent', hair: '#E6E6E6', hat: '#4A3A30', hunch: 12}} arm={30} />
          <line x1={bench.x + 30} y1={bench.y - 80} x2={bench.x + 52} y2={bench.y} stroke="#5a3b26" strokeWidth={5} strokeLinecap="round" />
        </g>
        {land > 0 && <Bee x={lerp(bench.x + 300, bench.x + 20, easeOut(land))} y={lerp(bench.y - 260, bench.y - 76, easeOut(land)) + Math.sin(f / 4) * 6 * (1 - land)} s={1.1} rot={land < 1 ? 200 : 180} f={land < 1 ? f : 0} />}
        <Swarm seed={10} n={6} cx={470} cy={540} rx={260} ry={100} f={f} s={0.8} />
      </Par>
      <rect x={-200} y={-200} width={W + 400} height={H + 400} fill="#1A0F2A" opacity={ramp(f, 180, 300) * 0.35} />
      <Falling seed={106} n={45} f={f} colors={['#E3A33B', '#F2C14E', '#C9792F']} size={9} speed={0.7} />
      <Motes seed={107} n={30} f={f} color="#FFD9A0" />
    </Cam>
  );
};

// ================================================================== 11. outro
const t11 = {far: makeRidge(111, 840, 70, 0.5, 1)};
export const Outro = ({f, dur}: SceneProps) => (
  <Cam f={f} dur={dur} z0={1} z1={1.06}>
    <Sky id="t11s" stops={[[0, '#04060E'], [0.6, '#0D1430'], [1, '#1D2446']]} />
    <Stars seed={11} n={260} opacity={1} f={f} maxY={800} />
    <Glow id="t11g" x={960} y={760} r={700} color="#F2B233" opacity={0.18} />
    <Triglav x={960} y={980} s={1.0} rock="#0B1022" shade="#080C1A" snow="#2C3458" snowShade="#232A49" />
    <path d={t11.far.d} fill="#070A16" />
    {hexGrid(70).filter((c) => c.y > 760).map((c, i) => (
      <polygon key={i} points={hexPoints(c.x, c.y, 66)} fill="none" stroke="#F2B233" strokeWidth={2} opacity={ramp(f, 40, 120) * 0.25 * (1 - Math.abs(c.x - 960) / 1100) * (0.6 + 0.4 * Math.sin(f / 18 + c.x / 90))} />
    ))}
    {Array.from({length: 14}, (_, i) => {
      const r = rng(1100 + i);
      const x = r() * W;
      const y = 420 + r() * 520;
      const px = x + Math.sin(f / (30 + r() * 20) + i) * 40;
      const py = y + Math.cos(f / (40 + r() * 20) + i) * 25;
      return <Glow key={i} id={`t11f${i}`} x={px} y={py} r={16} color="#FFD27A" opacity={0.5 + 0.5 * Math.sin(f / 10 + i)} />;
    })}
    <g opacity={ramp(f, 30, 75)}>
      <text x={960} y={330} textAnchor="middle" fontFamily={SERIF} fontWeight={700} fontSize={150} letterSpacing={lerp(50, 22, ramp(f, 30, 160))} fill="#FFF4E3">
        MICHAEL
      </text>
    </g>
    <text x={960} y={405} textAnchor="middle" fontFamily={SANS} fontWeight={600} fontSize={26} letterSpacing={14} fill="#F2C46A" opacity={ramp(f, 60, 95)}>
      1945 — 2024
    </text>
    <text x={960} y={490} textAnchor="middle" fontFamily={SERIF} fontStyle="italic" fontSize={46} fill="#FFF4E3" opacity={ramp(f, 90, 125)}>
      čebelar · dedek · Slovenec
    </text>
    <text x={960} y={540} textAnchor="middle" fontFamily={SANS} fontWeight={500} fontSize={20} letterSpacing={6} fill="#C9C3D8" opacity={ramp(f, 110, 145)}>
      BEEKEEPER · GRANDFATHER · SLOVENIAN
    </text>
    <Bee x={960 + Math.sin(f / 20) * 160} y={620 + Math.sin(f / 13) * 30} s={1.3} rot={Math.cos(f / 20) > 0 ? 0 : 180} f={f} />
  </Cam>
);

