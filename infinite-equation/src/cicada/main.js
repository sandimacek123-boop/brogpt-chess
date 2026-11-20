// CICADA 3301 — a 15 s vertical edit with beat-locked impact frames.
// Deterministic: window.renderFrame(i) renders frame i of 900 (60 fps).
import * as THREE from 'three';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { clamp, lerp, seg, smooth, smoother, ease, rng, orbitPos } from '../util.js';
import { M, equationTexture, TextPlane, makeDofUniforms, loadOT, Text3D } from '../text.js';
import { GlowLine } from '../lines.js';
import { cicadaLines } from './insect.js';

const Q = new URLSearchParams(location.search);
const SCALE = +(Q.get('scale') || 1);
const W = Math.round(1080 * SCALE), H = Math.round(1920 * SCALE);
const FPS = 60, DUR = 15;
const SUB = +(Q.get('sub') || 1);
const SHUTTER = 0.5;
const BPM = +(Q.get('bpm') || 120);           // beat grid; everything is placed on beats
const BEAT = 60 / BPM;
const b = (n) => n * BEAT;                    // beat n -> seconds
const PI = Math.PI, TAU = PI * 2;

const C = {
  white: new THREE.Color('#f4f1ea'),
  red: new THREE.Color('#ff1f3d'),
  deepRed: new THREE.Color('#8a0a1c'),
  steel: new THREE.Color('#9fb4c8'),
};
const cc = (c, k) => C[c].clone().multiplyScalar(k);

// ------------------------------------------------------------------ renderer + post
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
document.body.appendChild(renderer.domElement);
if (Q.get('fit')) Object.assign(renderer.domElement.style, { height: '100vh', width: 'auto' });
const rtOpts = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: true };
const rtScene = new THREE.WebGLRenderTarget(W, H, { ...rtOpts, samples: SUB > 1 ? 0 : 4 });
const rtAccum = new THREE.WebGLRenderTarget(W, H, { ...rtOpts, depthBuffer: false });
const rtClean = new THREE.WebGLRenderTarget(W, H, { ...rtOpts, depthBuffer: false }); // pre-bloom copy for crisp impact frames
const scene = new THREE.Scene();
scene.background = new THREE.Color(0);
const camera = new THREE.PerspectiveCamera(50, W / H, 0.05, 400);
const RES = new THREE.Vector2(W, H);
const DOF = makeDofUniforms();
const LW = SCALE;
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.38, 0.35, 0.85);

const vsQuad = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const accumQuad = new FullScreenQuad(new THREE.ShaderMaterial({
  uniforms: { tSrc: { value: null }, uW: { value: 1 } },
  vertexShader: vsQuad,
  fragmentShader: 'uniform sampler2D tSrc; uniform float uW; varying vec2 vUv; void main(){ vec4 c = texture2D(tSrc, vUv); if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0); gl_FragColor = min(c, vec4(40.0)) * uW; }',
  blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
  blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor, depthTest: false, depthWrite: false, transparent: true,
}));

const copyQuad = new FullScreenQuad(new THREE.ShaderMaterial({
  uniforms: { tSrc: { value: null } }, vertexShader: vsQuad,
  fragmentShader: 'uniform sampler2D tSrc; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tSrc, vUv); }',
  depthTest: false, depthWrite: false,
}));

// The impact-frame compositor
const finalQuad = new FullScreenQuad(new THREE.ShaderMaterial({
  uniforms: {
    tSrc: { value: rtAccum.texture }, tClean: { value: rtClean.texture }, uRes: { value: RES }, uFrame: { value: 0 }, uFade: { value: 1 },
    uCA: { value: 0 }, uGlitch: { value: 0 }, uFlash: { value: 0 }, uLines: { value: 0 }, uSeed: { value: 0 },
    uStyle: { value: 0 }, uBlack: { value: 0 }, uCenter: { value: new THREE.Vector2(0.5, 0.5) }, uRed: { value: C.red },
  },
  vertexShader: vsQuad,
  fragmentShader: /* glsl */`
    uniform sampler2D tSrc; uniform sampler2D tClean; uniform vec2 uRes; uniform float uFrame; uniform float uFade; uniform float uCA;
    uniform float uGlitch; uniform float uFlash; uniform float uLines; uniform float uSeed; uniform float uStyle;
    uniform float uBlack; uniform vec2 uCenter; uniform vec3 uRed; varying vec2 vUv;
    vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
    vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
    float hash(vec2 p){ p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
    float h1(float x){ return hash(vec2(x, x * 0.37 + 11.3)); }
    vec3 grab(vec2 uv){ return texture2D(tSrc, clamp(uv, vec2(0.0005), vec2(0.9995))).rgb; }
    void main(){
      vec2 uv = vUv;
      // --- glitch: horizontal slice displacement (seeded by frame -> deterministic)
      float band = 0.0;
      if (uGlitch > 0.0) {
        float bh = mix(10.0, 70.0, h1(floor(uFrame / 2.0) + 3.0));
        float row = floor(uv.y * uRes.y / bh);
        float hr = hash(vec2(row, floor(uFrame / 2.0)));
        band = step(1.0 - 0.32 * uGlitch, hr);
        uv.x += band * (hash(vec2(row * 1.7 + 3.0, uFrame)) - 0.5) * 0.16 * uGlitch;
      }
      vec2 d = uv - uCenter;
      float ca = 0.0012 + uCA * 0.0055 + band * 0.012 * uGlitch;
      vec3 c = vec3(grab(uv + d * ca).r, grab(uv).g, grab(uv - d * ca).b);
      c = aces(c);
      float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(lum), c, 0.9);                       // cold, slightly desaturated grade
      c = pow(c, vec3(1.08));                           // crush the blacks a touch
      vec2 q = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
      c *= mix(0.45, 1.0, smoothstep(0.95, 0.2, length(q * vec2(1.25, 1.0))));
      c = toSRGB(c);
      // --- radial speed lines (manga impact), stable per impact seed
      vec2 dl = (vUv - uCenter) * vec2(uRes.x / uRes.y, 1.0);
      float ang = atan(dl.y, dl.x) / 6.2831853 + 0.5;
      float r = length(dl);
      float n = 260.0;
      float id = floor(ang * n), fr = fract(ang * n);
      float hA = h1(id + uSeed * 31.0), hB = h1(id * 1.31 + uSeed * 7.0), hC = h1(id * 0.77 + uSeed * 3.0);
      float wid = 0.08 + 0.55 * hB;
      float aa = 1.5 * n / (6.2831853 * max(r, 0.05) * uRes.y);
      float lineMask = step(0.55, hA) * (1.0 - smoothstep(wid - aa, wid + aa, abs(fr - 0.5) * 2.0));
      lineMask *= smoothstep(0.16 + 0.22 * hC, 0.34 + 0.22 * hC, r);
      float L = lineMask * uLines;
      // --- impact frame styles
      vec3 cl = aces(texture2D(tClean, clamp(uv, vec2(0.0005), vec2(0.9995))).rgb);
      float ink = smoothstep(0.2, 0.32, dot(toSRGB(cl), vec3(0.2126, 0.7152, 0.0722)));
      if (uStyle > 0.5 && uStyle < 1.5) c = vec3(1.0 - max(ink, L));                  // black ink on white
      else if (uStyle > 1.5 && uStyle < 2.5) c = uRed * max(ink, L);                   // red ink on black
      else if (uStyle > 2.5) c = vec3(max(ink, L));                                    // hard white on black
      else c += vec3(0.9, 0.95, 1.0) * L * 0.55;
      c += uFlash;
      c *= 0.965 + 0.035 * sin(gl_FragCoord.y * 1.5708);                               // scanlines
      c += (hash(gl_FragCoord.xy + vec2(uFrame * 17.31, uFrame * 3.7)) - 0.5) * 0.035; // grain
      c *= uFade * (1.0 - uBlack);
      gl_FragColor = vec4(c, 1.0);
    }`,
  depthTest: false, depthWrite: false,
}));

// ------------------------------------------------------------------ beat-locked impacts
// kinds: tick (glitch only) | mid | big | mega
const IMP = [
  [b(2), 'tick'], [b(4), 'tick'], [b(6), 'tick'], [b(7), 'tick'], [b(7.5), 'tick'],
  [b(8), 'big'], [b(9), 'mid'], [b(10), 'mid'], [b(11), 'mid'], [b(12), 'big'], [b(13), 'mid'],
  [b(14), 'mid'], [b(14.5), 'mid'], [b(15), 'mid'], [b(15.5), 'tick'],
  [b(16), 'mega'],
  [b(17), 'beat'], [b(18), 'mid'], [b(19), 'beat'], [b(20), 'big'], [b(21), 'beat'], [b(22), 'mid'], [b(23), 'beat'],
  [b(24), 'big'], [b(25), 'mid'], [b(25.5), 'mid'], [b(26), 'big'], [b(27), 'tick'],
  [b(28), 'mega'], [b(29), 'tick'], [b(29.5), 'tick'],
].map(([t, k], i) => ({ t, k, i }));
const AMP = {
  tick: { punch: 0.015, shake: 5, ca: 0.8, glitch: 1.0, gdur: 0.1, flash: 0, lines: 0 },
  beat: { punch: 0.05, shake: 9, ca: 0.6, glitch: 0, gdur: 0, flash: 0.06, lines: 0.35 },
  mid: { punch: 0.08, shake: 14, ca: 1.0, glitch: 0.5, gdur: 0.08, flash: 0.15, lines: 0.6 },
  big: { punch: 0.13, shake: 22, ca: 1.6, glitch: 0.7, gdur: 0.12, flash: 0.35, lines: 1 },
  mega: { punch: 0.2, shake: 36, ca: 2.4, glitch: 1.0, gdur: 0.2, flash: 0.6, lines: 1 },
};
// frame-exact impact styles: index = frames since impact
const STYLE = { mid: [1], big: [1, 2, 3], mega: [1, 2, 1, 3, 2], beat: [], tick: [] };

function impactState(t) {
  const s = { punch: 0, sx: 0, sy: 0, roll: 0, ca: 0, glitch: 0, flash: 0, lines: 0, seed: 0 };
  for (const im of IMP) {
    const dt = t - im.t;
    if (dt < 0 || dt > 1.2) continue;
    const A = AMP[im.k];
    s.punch += A.punch * (1 - ease.outExpo(dt / 0.45));
    const sh = A.shake * Math.exp(-dt * 10) * SCALE;
    s.sx += sh * Math.sin(dt * 87 + im.i * 1.7);
    s.sy += sh * Math.cos(dt * 71 + im.i * 2.3);
    s.roll += (A.shake / 900) * Math.exp(-dt * 8) * Math.sin(dt * 53 + im.i);
    s.ca += A.ca * Math.exp(-dt * 9);
    if (dt < A.gdur) s.glitch = Math.max(s.glitch, A.glitch);
    s.flash += A.flash * Math.exp(-dt * 22);
    const l = A.lines * (dt < 0.1 ? 1 : Math.exp(-(dt - 0.1) * 14));
    if (l > s.lines) { s.lines = l; s.seed = im.i; }
  }
  return s;
}
function frameStyle(frame) {
  for (const im of IMP) {
    const f0 = Math.round(im.t * FPS), k = frame - f0;
    if ((im.k === 'big' || im.k === 'mega') && k === -1) return { style: 0, black: 1, seed: im.i };
    const st = STYLE[im.k];
    if (k >= 0 && k < st.length) return { style: st[k], black: 0, seed: im.i };
  }
  return { style: 0, black: 0, seed: 0 };
}

// ------------------------------------------------------------------ helpers
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
function line(polys, o, parent = scene) { const l = new GlowLine(polys, RES, DOF, { ...o, width: (o.width ?? 3) * LW }); parent.add(l); return l; }
function plane(box, emWorld, o = {}) {
  const tp = new TextPlane(equationTexture(box, { emPx: Math.max(60, 190 * SCALE), emWorld, padEm: 0.25 }), DOF, { glow: 0.12, ...o });
  tp.u.uReveal.value = 1; scene.add(tp); return tp;
}
const T = M.t;
function fitPlane(box, maxW, maxEm, o) {
  const em = Math.min(maxEm, maxW / box.w);
  return plane(box, em, o);
}

// ------------------------------------------------------------------ build
const E = {};
async function build() {
  await Promise.all(['40px "Anton"', '40px "JetBrains Mono"', '700 40px "JetBrains Mono"', '40px "Noto Sans Runic"', '40px "KaTeX_Main"']
    .map((s) => document.fonts.load(s, 'ᚠ3A')));
  const anton = await loadOT('node_modules/@fontsource/anton/files/anton-latin-400-normal.woff');

  // studio env: cold white strips + a red kicker
  const env = new THREE.Scene();
  const strip = (w, h, p, c, k) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), side: THREE.DoubleSide })); m.position.copy(p); m.lookAt(0, 0, 0); env.add(m); };
  strip(10, 1.5, V(0, 7, 3), '#ffffff', 3); strip(1.2, 9, V(-7, 0, 2), '#ff2040', 3); strip(1.4, 8, V(7, 1, 3), '#dfe8ff', 2.5); strip(5, 5, V(0, 0, 9), '#ffffff', 0.8);
  const envMap = new THREE.PMREMGenerator(renderer).fromScene(env, 0.03).texture;
  scene.add(new THREE.AmbientLight(0xffffff, 0.05));
  const key = new THREE.DirectionalLight(0xffffff, 1.0); key.position.set(3, 4, 6); scene.add(key);

  // ---- hex rain backdrop (procedural columns sampling a seeded glyph sheet)
  {
    const R = rng(3301), cols = 36, rows = 72, c = document.createElement('canvas');
    c.width = 36 * 28; c.height = 72 * 28;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.font = '22px "JetBrains Mono"'; ctx.textAlign = 'center';
    const HEX = '0123456789ABCDEF';
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) ctx.fillText(HEX[Math.floor(R() * 16)], i * 28 + 14, j * 28 + 22);
    const tex = new THREE.CanvasTexture(c); tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.wrapT = THREE.RepeatWrapping;
    const m = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: tex }, uTime: { value: 0 }, uOpacity: { value: 0 }, uC: { value: cc('red', 0.9) }, uC2: { value: cc('white', 0.5) } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */`
        uniform sampler2D uMap; uniform float uTime; uniform float uOpacity; uniform vec3 uC; uniform vec3 uC2; varying vec2 vUv;
        float h(float x){ return fract(sin(x * 127.1) * 43758.5453); }
        void main(){
          float col = floor(vUv.x * 36.0);
          float sp = 0.05 + h(col) * 0.12;
          float v = fract(vUv.y + uTime * sp);
          float g = texture2D(uMap, vec2(vUv.x, v), 0.6).a;
          float head = fract(-uTime * (0.12 + h(col + 7.0) * 0.25) + h(col + 3.0));
          float dy = fract(vUv.y - head);
          float trail = exp(-dy * 9.0) * step(0.15, h(col + 11.0));
          vec3 c = mix(uC, uC2, exp(-dy * 60.0));
          float a = g * (0.06 + trail) * uOpacity;
          gl_FragColor = vec4(c * a, a);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    E.rain = new THREE.Mesh(new THREE.PlaneGeometry(34, 58), m);
    E.rain.position.set(0, 0, -16); scene.add(E.rain);
  }

  // ---- the cicada
  {
    const L = cicadaLines();
    E.cicada = new THREE.Group(); scene.add(E.cicada);
    E.cBody = line(L.body, { width: 2.6, color: cc('white', 1.3), halo: 0.35, head: 1.4 }, E.cicada);
    E.cEyes = line(L.eyes, { width: 3.4, color: cc('red', 3.0), halo: 0.6 }, E.cicada);
    E.wings = [[L.wingR, L.veinR, 1], [L.wingL, L.veinL, -1]].map(([w, v, s]) => {
      const pivot = new THREE.Group(); pivot.position.set(s * L.shoulder.x, L.shoulder.y, 0); E.cicada.add(pivot);
      const inner = new THREE.Group(); inner.position.set(-s * L.shoulder.x, -L.shoulder.y, 0); pivot.add(inner);
      const outline = line(w, { width: 2.4, color: cc('white', 1.2), halo: 0.35, head: 1.4 }, inner);
      const veins = line(v, { width: 1.5, color: cc('steel', 1.1), color2: cc('red', 1.2), halo: 0.2 }, inner);
      return { pivot, outline, veins, s };
    });
    // points sampled along the art for the disintegration
    const pts = [];
    const add = (pls, kind) => pls.forEach((pl) => pl.forEach((p, i) => { if (i % 2 === 0) pts.push([p.clone(), kind]); }));
    add(L.body, 0); add(L.wingR, 1); add(L.wingL, 1); add(L.veinR, 1); add(L.veinL, 1); add(L.eyes, 2);
    E.cPts = pts;
  }

  // ---- particles: ambient dust + cicada dust (bursts on impacts, disintegrates)
  {
    const R = rng(1033);
    const nDust = 5000, nC = E.cPts.length, n = nDust + nC;
    const base = new Float32Array(n * 3), dir = new Float32Array(n * 3), seed = new Float32Array(n * 4), colr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      let p, kind;
      if (i < nDust) { p = V((R() * 2 - 1) * 10, (R() * 2 - 1) * 14, -14 + R() * 18); kind = R() < 0.25 ? 2 : 0; }
      else { const [q, k] = E.cPts[i - nDust]; p = q; kind = k; }
      base.set([p.x, p.y, p.z], i * 3);
      const d = V(p.x + (R() - 0.5) * 0.8, p.y - 0.2 + (R() - 0.5) * 0.8, (R() - 0.5) * 2.5).normalize();
      dir.set([d.x, d.y, d.z], i * 3);
      seed.set([R(), R(), R(), i < nDust ? 0 : 1], i * 4);
      const c = kind === 2 ? C.red : kind === 1 ? C.steel : C.white;
      colr.set([c.r, c.g, c.b], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(base, 3));
    g.setAttribute('aDir', new THREE.BufferAttribute(dir, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    g.setAttribute('aCol', new THREE.BufferAttribute(colr, 3));
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uShock: { value: 0 }, uExplode: { value: 0 }, uCMat: { value: new THREE.Matrix4() }, uDust: { value: 0 }, uCDust: { value: 0 }, uViewH: { value: H }, uFocus: DOF.uFocus, uAperture: DOF.uAperture },
      vertexShader: /* glsl */`
        attribute vec3 aDir; attribute vec4 aSeed; attribute vec3 aCol;
        uniform float uTime; uniform float uShock; uniform float uExplode; uniform mat4 uCMat; uniform float uDust; uniform float uCDust;
        uniform float uViewH; uniform float uFocus; uniform float uAperture;
        varying vec3 vCol; varying float vA; varying float vSharp;
        void main(){
          vec3 p;
          float a;
          if (aSeed.w < 0.5) {
            vec3 drift = vec3(sin(uTime*0.4 + aSeed.x*40.0), cos(uTime*0.33 + aSeed.y*40.0), 0.0) * 0.25;
            vec3 rad = normalize(position + vec3(0.001)) * uShock * (0.5 + aSeed.z);
            p = position + drift + rad;
            a = uDust * (0.35 + 0.65 * aSeed.y);
          } else {
            vec3 w = (uCMat * vec4(position, 1.0)).xyz;
            float e = uExplode;
            vec3 wobble = vec3(sin(uTime*3.0 + aSeed.x*60.0), cos(uTime*2.6 + aSeed.y*60.0), sin(uTime*2.2 + aSeed.z*60.0)) * 0.03;
            p = w + wobble + aDir * e * (2.0 + aSeed.z * 7.0) + vec3(0.0, -e * e * 1.2, 0.0);
            a = uCDust * (0.6 + 0.4 * aSeed.x) * (1.0 - smoothstep(0.6, 1.0, e * (0.6 + aSeed.y * 0.5)));
          }
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float depth = -mv.z;
          float base = (0.022 + aSeed.z * 0.03) * uViewH * 1.07 / max(depth, 0.2);
          float coc = uAperture * abs(depth - uFocus) / max(depth, 0.2) * uViewH * 0.025;
          float size = max(base, 1.0) + coc;
          gl_PointSize = min(size, 70.0);
          vA = a * (max(base, 1.0) * max(base, 1.0)) / (size * size) * smoothstep(0.2, 1.0, depth);
          vSharp = clamp(base / size, 0.0, 1.0);
          vCol = aCol;
        }`,
      fragmentShader: /* glsl */`
        varying vec3 vCol; varying float vA; varying float vSharp;
        void main(){ vec2 d = gl_PointCoord * 2.0 - 1.0; float r = dot(d, d); if (r > 1.0) discard;
          float a = mix(smoothstep(1.0, 0.8, r) * 0.6, exp(-r * 5.0), vSharp) * vA; gl_FragColor = vec4(vCol * a * 1.6, a); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    E.dust = new THREE.Points(g, m); E.dust.frustumCulled = false; scene.add(E.dust);
  }

  // ---- rune rings: the Gematria Primus (29 runes <-> first 29 primes)
  {
    const RUNES = ['ᚠ', 'ᚢ', 'ᚦ', 'ᚩ', 'ᚱ', 'ᚳ', 'ᚷ', 'ᚹ', 'ᚻ', 'ᚾ', 'ᛁ', 'ᛄ', 'ᛇ', 'ᛈ', 'ᛉ', 'ᛋ', 'ᛏ', 'ᛒ', 'ᛖ', 'ᛗ', 'ᛚ', 'ᛝ', 'ᛟ', 'ᛞ', 'ᚪ', 'ᚫ', 'ᚣ', 'ᛡ', 'ᛠ'];
    const PR = []; for (let n = 2; PR.length < 29; n++) { let p = true; for (let k = 2; k * k <= n; k++) if (n % k === 0) { p = false; break; } if (p) PR.push(n); }
    E.RUNES = RUNES; E.PR = PR;
    const S = 2048, c = document.createElement('canvas'); c.width = c.height = S;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.translate(S / 2, S / 2);
    for (let i = 0; i < 29; i++) {
      const a = (i / 29) * TAU;
      ctx.save(); ctx.rotate(a); ctx.font = '120px "Noto Sans Runic"'; ctx.fillText(RUNES[i], 0, -880); ctx.restore();
      ctx.save(); ctx.rotate(a); ctx.font = '700 54px "JetBrains Mono"'; ctx.fillText(String(PR[i]), 0, -740); ctx.restore();
    }
    ctx.lineWidth = 4; ctx.strokeStyle = '#fff';
    for (const r of [960, 800, 690]) { ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke(); }
    for (let i = 0; i < 29; i++) { const a = (i / 29 + 0.5 / 29) * TAU; ctx.beginPath(); ctx.moveTo(Math.sin(a) * 805, -Math.cos(a) * 805); ctx.lineTo(Math.sin(a) * 955, -Math.cos(a) * 955); ctx.stroke(); }
    const tex = new THREE.CanvasTexture(c); tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.anisotropy = 8;
    const eq = { texture: tex, w: 7.2, h: 7.2 };
    E.ring1 = new TextPlane(eq, DOF, { color: cc('white', 1.0), color2: cc('red', 1.4), glow: 0.1 });
    E.ring2 = new TextPlane(eq, DOF, { color: cc('red', 1.3), color2: cc('red', 1.3), glow: 0.1 });
    for (const r of [E.ring1, E.ring2]) { r.u.uReveal.value = 1; scene.add(r); }
  }

  // ---- terminal
  {
    const c = document.createElement('canvas'); c.width = 1400; c.height = 460;
    const tex = new THREE.CanvasTexture(c); tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
    E.term = new TextPlane({ texture: tex, w: 4.3, h: 4.3 * 460 / 1400 }, DOF, { color: cc('white', 1.1), glow: 0.06 });
    E.term.u.uReveal.value = 1; E.termCtx = c.getContext('2d'); E.termTex = tex; E.termKey = '';
    scene.add(E.term);
  }

  // ---- word cards (each: main word + red ghost + optional caption)
  const card = (word, fam, maxW, maxEm, caption, colr = 'white') => {
    const box = T(word, fam);
    const main = fitPlane(box, maxW, maxEm, { color: cc(colr, colr === 'red' ? 1.25 : 1.05), glow: 0.04 });
    const ghost = fitPlane(box, maxW, maxEm, { color: cc('red', 0.95), glow: 0.0 });
    const cap = caption ? fitPlane(T(caption, 'mono'), 4.2, 0.23, { color: cc('white', 1.0), glow: 0.0 }) : null;
    return { main, ghost, cap, h: main.eq.h };
  };
  const SEQ = [
    [b(8), b(9), '3301', 'anton', 3.2, 2.4, 'a prime number.'],
    [b(9), b(10), 'PRIME', 'anton', 3.5, 1.5, 'reversed: 1033. also prime.'],
    [b(10), b(11), 'STEGANOGRAPHY', 'anton', 3.5, 1.3, 'messages hidden inside images'],
    [b(11), b(12), 'PGP', 'anton', 3.5, 2.2, 'every message cryptographically signed'],
    [b(12), b(13), 'LIBER PRIMUS', 'anton', 3.5, 1.4, 'a book written in runes'],
    [b(13), b(14), 'ᚠ ᚢ ᚦ ᚩ ᚱ', 'runic', 3.4, 1.4, 'runes = primes: 2 · 3 · 5 · 7 · 11'],
    [b(14), b(14.5), '2012', 'anton', 3.5, 1.9, null],
    [b(14.5), b(15), '2013', 'anton', 3.5, 1.9, null],
    [b(15), b(15.5), '2014', 'anton', 3.5, 1.9, null],
    [b(15.5), b(16), '?', 'anton', 3.5, 2.6, null, 'red'],
    [b(25), b(25.5), 'WHO', 'anton', 3.5, 2.0, null],
    [b(25.5), b(26), 'ARE', 'anton', 3.5, 2.0, null],
    [b(26), b(27.5), 'THEY?', 'anton', 3.5, 2.0, null, 'red'],
  ];
  E.cards = SEQ.map(([t0, t1, word, fam, maxW, maxEm, caption, colr]) => ({ t0, t1, ...card(word, fam, maxW, maxEm, caption, colr) }));
  // finale: STILL / UNSOLVED.
  E.fin1 = fitPlane(T('STILL', 'anton'), 3.0, 1.4, { color: cc('white', 1.05), glow: 0.03 });
  E.fin2 = fitPlane(T('UNSOLVED.', 'anton'), 3.5, 1.4, { color: cc('red', 1.3), glow: 0.03 });
  E.fin2g = fitPlane(T('UNSOLVED.', 'anton'), 3.5, 1.4, { color: cc('white', 0.55), glow: 0.0 });

  // ---- 3D titles for the drop
  const chrome = () => new THREE.MeshStandardMaterial({ color: new THREE.Color('#e9edf2'), metalness: 0.95, roughness: 0.26, envMap, envMapIntensity: 0.9, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.08, transparent: true, opacity: 0 });
  const redMetal = () => new THREE.MeshStandardMaterial({ color: new THREE.Color('#ff3348'), metalness: 0.85, roughness: 0.3, envMap, envMapIntensity: 1.1, emissive: new THREE.Color('#ff1030'), emissiveIntensity: 0.35, transparent: true, opacity: 0 });
  E.tCicada = new Text3D(anton, 'CICADA', { size: 1, depth: 0.16, bevel: 0.012, makeMaterial: chrome, tracking: 0.08 });
  E.tCicada.scale.setScalar(4.3 / E.tCicada.width); E.tCicada.position.set(0, 2.95, 0.4); scene.add(E.tCicada);
  E.t3301 = new Text3D(anton, '3301', { size: 1, depth: 0.18, bevel: 0.012, makeMaterial: redMetal, tracking: 0.06 });
  E.t3301.scale.setScalar(2.9 / E.t3301.width); E.t3301.position.set(0, -3.15, 0.4); scene.add(E.t3301);
}

// ------------------------------------------------------------------ terminal text
const TERM = [
  [0.35, '> incoming transmission'],
  [1.15, '> date    2012-01-04'],
  [1.85, '> origin  unknown'],
  [2.55, '> payload hidden in plain sight'],
];
function drawTerminal(t) {
  const CPS = 34;
  const lines = TERM.map(([t0, s]) => (t < t0 ? '' : s.slice(0, Math.floor((t - t0) * CPS))));
  // scramble into hex just before the first hit
  const scr = seg(t, b(7.2), b(8));
  let out = lines;
  if (scr > 0) {
    const R = rng(Math.floor(t * 30) + 7), HEX = '0123456789abcdef';
    out = lines.map((l) => [...l].map((ch) => (ch !== ' ' && R() < scr ? HEX[Math.floor(R() * 16)] : ch)).join(''));
  }
  let last = 0; out.forEach((l, i) => { if (l.length) last = i; });
  const cursorOn = Math.floor(t / (BEAT / 2)) % 2 === 0;
  const key = out.join('|') + cursorOn;
  if (key === E.termKey) return;
  E.termKey = key;
  const ctx = E.termCtx, Wc = 1400, Hc = 460;
  ctx.clearRect(0, 0, Wc, Hc);
  ctx.fillStyle = '#fff'; ctx.font = '700 64px "JetBrains Mono"'; ctx.textBaseline = 'alphabetic';
  out.forEach((l, i) => ctx.fillText(l, 20, 90 + i * 108));
  if (cursorOn) { const w = ctx.measureText(out[last]).width; ctx.fillRect(28 + w, 90 + last * 108 - 52, 36, 62); }
  E.termTex.needsUpdate = true;
}

// ------------------------------------------------------------------ camera
const rig = (tx, ty, tz, yaw, pitch, dist, roll = 0) => ({ tx, ty, tz, yaw, pitch, dist, roll });
const RIGS = [
  [0, b(8.6), (t) => { const u = ease.inOutSine(seg(t, 0, b(8))); return rig(0, 0.6, 0, 0.06 * Math.sin(t * 0.5), lerp(0.05, 0.0, u), lerp(14, 10.5, u), lerp(-0.04, 0, u)); }],
  [b(7.6), b(16.4), (t) => { const u = seg(t, b(8), b(16)); return rig(0, 0.2, 0, lerp(-0.1, 0.1, ease.inOutSine(u)), 0.0, lerp(10.2, 9.4, u)); }],
  [b(15.8), b(24.4), (t) => { const u = ease.inOutSine(seg(t, b(16), b(24))); return rig(0, 0.0, 0, lerp(-0.42, 0.42, u), lerp(0.14, -0.06, u), lerp(10.6, 9.8, u), 0.04 * Math.sin(t * 0.8)); }],
  [b(23.8), 15, (t) => { const u = seg(t, b(24), 15); return rig(0, 0.1, 0, lerp(0.42, 0.55, u), lerp(-0.06, 0.02, u), lerp(9.8, 12.5, ease.outExpo(u * 1.6))); }],
];
function camAt(t) {
  let cur = null;
  for (let i = 0; i < RIGS.length; i++) {
    const [s, , fn] = RIGS[i];
    if (t < s && i > 0) break;
    const r = fn(t);
    if (!cur) { cur = r; continue; }
    const w = smoother(seg(t, s, RIGS[i - 1][1]));
    const o = {}; for (const k in cur) o[k] = lerp(cur[k], r[k], w); cur = o;
  }
  return cur;
}

// ------------------------------------------------------------------ timeline
const tmpM = new THREE.Matrix4();
let SHAKE = { x: 0, y: 0 };
function update(t) {
  const imp = impactState(t);
  const c = camAt(t);
  const target = V(c.tx, c.ty, c.tz);
  orbitPos(target, c.yaw, c.pitch, c.dist, camera.position);
  const roll = c.roll + imp.roll;
  camera.up.set(Math.sin(roll), Math.cos(roll), 0);
  camera.lookAt(target);
  camera.fov = 50 / (1 + imp.punch);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  SHAKE = { x: imp.sx, y: imp.sy };
  DOF.uFocus.value = c.dist; DOF.uAperture.value = 0.3;

  const drop = t >= b(16) && t < b(24);
  const pre = t < b(8);

  // ---- hex rain
  E.rain.material.uniforms.uTime.value = t;
  E.rain.material.uniforms.uOpacity.value = pre ? lerp(0, 0.55, seg(t, 0.2, 2.0)) : drop ? 0.65 : 0.4;
  E.rain.lookAt(camera.position);

  // ---- terminal
  drawTerminal(t);
  E.term.position.set(0, -2.75, 2.0);
  E.term.face(camera);
  E.term.u.uOpacity.value = smooth(seg(t, 0.25, 0.45)) * (t < b(8) ? 1 : 0);
  E.term.u.uBlur.value = 0;
  E.term.visible = t < b(8);

  // ---- cicada
  {
    const cd = E.cicada;
    const intro = t < b(16);
    const s = intro ? lerp(1.25, 1.18, seg(t, 0, b(16))) : 1.0 + 0.05 * (1 - ease.outExpo(seg(t, b(16), b(17))));
    cd.scale.setScalar(s);
    cd.position.set(0, intro ? 0.9 : 0.05, intro ? -1.5 : 0);
    cd.rotation.set(intro ? 0.15 * Math.sin(t * 0.4) : 0, intro ? 0.25 * Math.sin(t * 0.3) : 0.12 * Math.sin((t - b(16)) * 1.1), 0);
    const draw = ease.inOutCubic(seg(t, 0.5, b(7.6)));
    const prog = intro ? draw : 1;
    let op = intro ? (t < b(8) ? 0.75 : 0.22) : 1;
    const explode = ease.outCubic(seg(t, b(24), b(24) + 0.9));
    op *= 1 - smooth(seg(t, b(24), b(24) + 0.12));
    for (const l of [E.cBody, E.cEyes, ...E.wings.flatMap((w) => [w.outline, w.veins])]) {
      l.u.uProgress.value = prog; l.u.uOpacity.value = op; l.visible = op > 0.002;
    }
    E.cEyes.u.uOpacity.value = op * (intro ? 0.8 : 1 + 0.6 * Math.exp(-((t - b(16)) % BEAT) * 6));
    // wing flare on the drop + a flutter on every beat
    const flare = drop ? (1 - ease.outExpo(seg(t, b(16), b(16) + 0.8))) : 0;
    const beatPhase = ((t % BEAT) + BEAT) % BEAT;
    const flutter = drop ? 0.1 * Math.exp(-beatPhase * 7) : 0;
    for (const w of E.wings) {
      w.pivot.rotation.set(0, w.s * (0.35 + 0.08 * Math.sin(t * 1.3) + flare * 0.9 + flutter), w.s * (-0.05 - flare * 0.25 - flutter));
    }
    cd.updateMatrixWorld();
    // particles bound to the cicada (matrix frozen at the moment it shatters)
    const P = E.dust.material.uniforms;
    P.uTime.value = t;
    P.uExplode.value = explode;
    P.uCMat.value.copy(cd.matrixWorld);
    P.uCDust.value = drop ? 0.25 : t >= b(24) ? 1.2 : 0.1 * draw;
    P.uDust.value = smooth(seg(t, 0.1, 1.5)) * (drop ? 1.2 : 0.8);
    P.uShock.value = 3.2 * ease.outExpo(seg(t, b(16), b(16) + 1.2)) * (1 - smooth(seg(t, b(23), b(25)))) + 2.0 * ease.outExpo(seg(t, b(24), b(24) + 1.4));
  }

  // ---- rune rings
  {
    const a = ease.outExpo(seg(t, b(16), b(16) + 0.6));
    const o = smooth(seg(t, b(24), b(24) + 0.35));
    const sc = lerp(0.55, 1, a) * (1 + o * 0.6);
    E.ring1.scale.setScalar(sc); E.ring2.scale.setScalar(sc * 0.72);
    E.ring1.position.set(0, 0.05, 0); E.ring2.position.set(0, 0.05, 0);
    E.ring1.rotation.set(1.2, 0, 0); E.ring1.rotateZ(-t * 0.35);
    E.ring2.rotation.set(-1.05, 0.35, 0); E.ring2.rotateZ(t * 0.5);
    const op = a * (1 - o) * 0.6;
    E.ring1.u.uOpacity.value = op; E.ring2.u.uOpacity.value = op * 0.8;
    E.ring1.visible = E.ring2.visible = op > 0.002;
  }

  // ---- word cards: hard cuts on the beat, slam-in scale, red ghost split
  for (const cd of E.cards) {
    const on = t >= cd.t0 && t < cd.t1;
    for (const p of [cd.main, cd.ghost, cd.cap]) if (p) p.visible = on;
    if (!on) continue;
    const dt = t - cd.t0;
    const slam = 1 + 0.22 * (1 - ease.outExpo(dt / 0.25)) + 0.05 * dt;
    const yMain = cd.cap ? 0.35 : 0.1;
    cd.main.position.set(0, yMain, 1.2); cd.main.scale.setScalar(slam); cd.main.face(camera);
    cd.main.u.uOpacity.value = 1; cd.main.u.uBlur.value = 0;
    const split = 0.05 + 0.18 * Math.exp(-dt * 9);
    cd.ghost.position.set(split, yMain - split * 0.4, 1.15); cd.ghost.scale.setScalar(slam * 1.01); cd.ghost.face(camera);
    cd.ghost.u.uOpacity.value = 0.7;
    if (cd.cap) {
      const ca = ease.outCubic(seg(dt, 0.06, 0.2));
      cd.cap.position.set(0, yMain - cd.h * 0.55 - 0.35 + (1 - ca) * -0.15, 1.2); cd.cap.face(camera);
      cd.cap.u.uOpacity.value = ca * 0.95;
      cd.cap.u.uReveal.value = ease.outCubic(seg(dt, 0.04, 0.3));
    }
  }

  // ---- 3D titles on the drop
  for (const [tx, d0, yz] of [[E.tCicada, 0, 2.95], [E.t3301, 0.06, -3.15]]) {
    const g = tx.glyphs, n = g.length;
    const outE = ease.inCubic(seg(t, b(24), b(24) + 0.5));
    g.forEach((L, i) => {
      const k = ease.outExpo(seg(t, b(16) + d0 + i * 0.025, b(16) + d0 + i * 0.025 + 0.45));
      const side = i - (n - 1) / 2;
      L.pivot.position.set(L.baseX + side * outE * 0.8, (1 - k) * 0.6 + outE * (side % 2 ? 1 : -1) * 0.6, (1 - k) * 3 + outE * 3);
      L.pivot.rotation.set((1 - k) * -0.9 + outE * side * 0.5, outE * side * 0.6, 0);
      L.mat.opacity = k * (1 - outE);
      L.mat.visible = L.mat.opacity > 0.002;
    });
    tx.visible = t >= b(16) && t < b(25);
    const beatPhase = ((t % BEAT) + BEAT) % BEAT;
    tx.scale.setScalar(tx.userData.s0 ?? (tx.userData.s0 = tx.scale.x));
    tx.scale.multiplyScalar(1 + 0.025 * Math.exp(-beatPhase * 9) * (drop ? 1 : 0));
    tx.lookAt(camera.position.clone().setY(tx.position.y));
  }

  // ---- finale: STILL / UNSOLVED.
  {
    const on1 = t >= b(28), dt = t - b(28);
    const slam = 1 + 0.25 * (1 - ease.outExpo(dt / 0.28)) + 0.04 * Math.max(0, dt);
    E.fin1.position.set(0, 0.75, 1.2); E.fin1.scale.setScalar(slam); E.fin1.face(camera);
    E.fin2.position.set(0, -0.45, 1.2); E.fin2.scale.setScalar(slam); E.fin2.face(camera);
    const sp = 0.05 + 0.2 * Math.exp(-Math.max(0, dt) * 8);
    E.fin2g.position.set(-sp, -0.45 + sp * 0.3, 1.15); E.fin2g.scale.setScalar(slam); E.fin2g.face(camera);
    E.fin1.u.uOpacity.value = on1 ? 1 : 0; E.fin2.u.uOpacity.value = on1 ? 1 : 0; E.fin2g.u.uOpacity.value = on1 ? 0.6 : 0;
    E.fin1.visible = E.fin2.visible = E.fin2g.visible = on1;
  }
}

// ------------------------------------------------------------------ frame rendering
let CUTS = [];
const halton = (i, bb) => { let f = 1, r = 0; while (i > 0) { f /= bb; r += f * (i % bb); i = Math.floor(i / bb); } return r; };
function renderAt(frame) {
  const tc = frame / FPS;
  renderer.setRenderTarget(rtAccum);
  renderer.setClearColor(0x000000, 1);
  renderer.clear();
  // the shutter never straddles a hard cut: if a cut falls inside it, open the shutter at the cut
  let lo = tc - SHUTTER / 2 / FPS, hi = tc + SHUTTER / 2 / FPS;
  for (const c of CUTS) if (c > lo && c <= tc + 1e-9) { lo = c; hi = c + SHUTTER / FPS; }
  for (let s = 0; s < SUB; s++) {
    const ts = SUB > 1 ? clamp(lerp(lo, hi, (s + 0.5) / SUB), 0, DUR - 1e-4) : tc;
    update(ts);
    const jx = SUB > 1 ? halton(s + 1, 2) - 0.5 : 0, jy = SUB > 1 ? halton(s + 1, 3) - 0.5 : 0;
    camera.setViewOffset(W, H, jx + SHAKE.x, jy + SHAKE.y, W, H);
    renderer.setRenderTarget(rtScene);
    renderer.clear();
    renderer.render(scene, camera);
    accumQuad.material.uniforms.tSrc.value = rtScene.texture;
    accumQuad.material.uniforms.uW.value = 1 / SUB;
    renderer.setRenderTarget(rtAccum);
    renderer.autoClear = false;
    accumQuad.render(renderer);
    renderer.autoClear = true;
  }
  copyQuad.material.uniforms.tSrc.value = rtAccum.texture;
  renderer.setRenderTarget(rtClean); copyQuad.render(renderer);
  bloom.render(renderer, null, rtAccum, 0, false);
  const imp = impactState(tc), fs = frameStyle(frame), U = finalQuad.material.uniforms;
  U.uFrame.value = frame;
  U.uCA.value = imp.ca;
  U.uGlitch.value = Math.max(imp.glitch, seg(tc, 14.55, 14.95));
  U.uFlash.value = fs.style ? 0 : imp.flash;
  U.uLines.value = fs.style ? 1 : imp.lines;
  U.uSeed.value = fs.style ? fs.seed : imp.seed;
  U.uStyle.value = fs.style;
  U.uBlack.value = fs.black;
  U.uFade.value = 1 - smooth(seg(tc, 14.7, 14.95));
  renderer.setRenderTarget(null);
  finalQuad.render(renderer);
}

window.renderFrame = (i) => { renderAt(i); renderer.getContext().finish(); return true; };
window.grab = (type = 'image/png', q) => renderer.domElement.toDataURL(type, q);
window.META = { W, H, FPS, DUR, FRAMES: 900, SUB, BPM };

build().then(() => {
  CUTS = [...new Set([...E.cards.flatMap((c) => [c.t0, c.t1]), b(8), b(16), b(24), b(28)])];
  window.READY = true; window.E = E; window.SCENE = scene; // debug handles
  const t0 = Q.get('t');
  if (t0 != null) renderAt(Math.round(+t0 * FPS));
  if (Q.get('play')) {
    let fr = 0; const hud = document.getElementById('hud');
    const loop = () => { renderAt(fr); hud.textContent = (fr / FPS).toFixed(2) + 's'; fr = (fr + 1) % 900; requestAnimationFrame(loop); };
    loop();
  }
}).catch((e) => { window.ERROR = String(e && e.stack || e); console.error(e); });
