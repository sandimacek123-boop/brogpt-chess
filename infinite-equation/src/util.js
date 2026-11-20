// Deterministic helpers: easing, interpolation, seeded random, colours.
import * as THREE from 'three';

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const seg = (t, a, b) => clamp((t - a) / (b - a));
export const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
export const smoother = (x) => { x = clamp(x); return x * x * x * (x * (x * 6 - 15) + 10); };

export const ease = {
  inOutSine: (x) => -(Math.cos(Math.PI * clamp(x)) - 1) / 2,
  outSine: (x) => Math.sin((clamp(x) * Math.PI) / 2),
  inSine: (x) => 1 - Math.cos((clamp(x) * Math.PI) / 2),
  inCubic: (x) => clamp(x) ** 3,
  outCubic: (x) => 1 - (1 - clamp(x)) ** 3,
  inOutCubic: (x) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2; },
  outQuart: (x) => 1 - (1 - clamp(x)) ** 4,
  inOutQuart: (x) => { x = clamp(x); return x < 0.5 ? 8 * x ** 4 : 1 - (-2 * x + 2) ** 4 / 2; },
  outQuint: (x) => 1 - (1 - clamp(x)) ** 5,
  inOutQuint: (x) => { x = clamp(x); return x < 0.5 ? 16 * x ** 5 : 1 - (-2 * x + 2) ** 5 / 2; },
  outExpo: (x) => { x = clamp(x); return x === 1 ? 1 : 1 - 2 ** (-10 * x); },
  inOutExpo: (x) => {
    x = clamp(x);
    if (x === 0 || x === 1) return x;
    return x < 0.5 ? 2 ** (20 * x - 10) / 2 : (2 - 2 ** (-20 * x + 10)) / 2;
  },
};

// fade window: rises a→b, holds, falls c→d
export const win = (t, a, b, c, d, e = smooth) => {
  if (t <= a || t >= d) return 0;
  if (t < b) return e((t - a) / (b - a));
  if (t > c) return 1 - e((t - c) / (d - c));
  return 1;
};

// Seeded PRNG (mulberry32) — identical sequence on every run.
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Palette (linear-space HDR colours are built from these sRGB hex values)
export const PAL = {
  gold: new THREE.Color('#e9c27a'),
  deepGold: new THREE.Color('#c8913a'),
  ivory: new THREE.Color('#f5eee0'),
  blue: new THREE.Color('#3fb2ff'),
  cyan: new THREE.Color('#7fd8ff'),
};
export const col = (name, k = 1) => PAL[name].clone().multiplyScalar(k);

// Orbit camera parameters -> position
export function orbitPos(target, yaw, pitch, dist, out = new THREE.Vector3()) {
  return out.set(
    target.x + dist * Math.sin(yaw) * Math.cos(pitch),
    target.y + dist * Math.sin(pitch),
    target.z + dist * Math.cos(yaw) * Math.cos(pitch),
  );
}

// Digits of pi via Machin's formula with BigInt: pi = 16 atan(1/5) - 4 atan(1/239)
export function piDigits(n) {
  const guard = 12n;
  const scale = 10n ** (BigInt(n) + guard);
  const atanInv = (x) => {
    const xb = BigInt(x), x2 = xb * xb;
    let term = scale / xb, sum = term, k = 1n, sign = -1n;
    while (term !== 0n) {
      term /= x2;
      const add = term / (2n * k + 1n);
      sum += sign * add;
      sign = -sign; k++;
    }
    return sum;
  };
  const pi = 16n * atanInv(5) - 4n * atanInv(239);
  const s = (pi / 10n ** guard).toString(); // "31415926..."
  return s[0] + '.' + s.slice(1, n);
}
