// THE INFINITE EQUATION — deterministic, frame-addressable WebGL film.
// window.renderFrame(i) renders frame i (0..899) of the 15 s, 60 fps sequence.
import * as THREE from 'three';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { clamp, lerp, seg, smooth, smoother, ease, win, PAL, col, orbitPos, piDigits } from './util.js';
import { M, equationTexture, TextPlane, DynamicLabel, makeDofUniforms, loadOT, Text3D, extrudeGlyph } from './text.js';
import { GlowLine, GlowDot } from './lines.js';
import { makeParticles } from './particles.js';
import { makeDigits, helixPoints } from './digits.js';

const Q = new URLSearchParams(location.search);
const SCALE = +(Q.get('scale') || 1);
const W = Math.round(1080 * SCALE), H = Math.round(1920 * SCALE);
const FPS = 60, DUR = 15, FRAMES = 900;
const SUB = +(Q.get('sub') || 1);          // temporal sub-samples (motion blur + AA)
const SHUTTER = 0.5;                       // 180° shutter
const PI = Math.PI, TAU = Math.PI * 2;
const ZF = -48;                            // z of the finale composition
const RF = 1.85;                           // radius of the folded circle
const f = (x) => x * x;                    // the function of the film

// ------------------------------------------------------------------ renderer
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
document.body.appendChild(renderer.domElement);
if (Q.get('fit')) Object.assign(renderer.domElement.style, { height: '100vh', width: 'auto' });

const rtOpts = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: true };
const rtScene = new THREE.WebGLRenderTarget(W, H, { ...rtOpts, samples: SUB > 1 ? 0 : 4 });
const rtAccum = new THREE.WebGLRenderTarget(W, H, { ...rtOpts, depthBuffer: false });

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
const camera = new THREE.PerspectiveCamera(50, W / H, 0.05, 400);
const RES = new THREE.Vector2(W, H);
const DOF = makeDofUniforms();
const LW = SCALE; // line width scale for previews

// ------------------------------------------------------------------ post
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.42, 0.32, 0.82);
const accumQuad = new FullScreenQuad(new THREE.ShaderMaterial({
  uniforms: { tSrc: { value: null }, uW: { value: 1 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: 'uniform sampler2D tSrc; uniform float uW; varying vec2 vUv; void main(){ vec4 c = texture2D(tSrc, vUv); if (any(isnan(c)) || any(isinf(c))) c = vec4(0.0); gl_FragColor = min(c, vec4(40.0)) * uW; }',
  blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
  blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor, depthTest: false, depthWrite: false, transparent: true,
}));
const finalQuad = new FullScreenQuad(new THREE.ShaderMaterial({
  uniforms: { tSrc: { value: rtAccum.texture }, uFade: { value: 1 }, uExposure: { value: 1.0 }, uRes: { value: RES } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: /* glsl */`
    uniform sampler2D tSrc; uniform float uFade; uniform float uExposure; uniform vec2 uRes; varying vec2 vUv;
    vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
    vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
    float hash(vec2 p){ p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
    void main(){
      vec2 d = vUv - 0.5;
      vec2 off = d * 0.0022;
      vec3 c;
      c.r = texture2D(tSrc, vUv + off).r;
      c.g = texture2D(tSrc, vUv).g;
      c.b = texture2D(tSrc, vUv - off).b;
      // faint deep-navy atmosphere so the black has depth
      float rad = length(d * vec2(1.0, 0.75));
      c += vec3(0.0025, 0.004, 0.009) * smoothstep(0.75, 0.0, rad);
      c = aces(c * uExposure);
      float vig = smoothstep(1.05, 0.25, length(d * vec2(1.15, 0.9)));
      c *= mix(0.55, 1.0, vig);
      c = toSRGB(c) * uFade;
      c += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
      gl_FragColor = vec4(c, 1.0);
    }`,
  depthTest: false, depthWrite: false,
}));

// ------------------------------------------------------------------ helpers
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const linspace = (a, b, n) => Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));
const segPts = (a, b, n = 2) => linspace(0, 1, n).map((u) => a.clone().lerp(b, u));
function line(polys, o) { const l = new GlowLine(polys, RES, DOF, { ...o, width: (o.width ?? 3) * LW }); scene.add(l); return l; }
function eqPlane(box, emWorld, o = {}) {
  const tp = new TextPlane(equationTexture(box, { emPx: Math.max(60, 170 * SCALE), emWorld }), DOF, o);
  scene.add(tp); return tp;
}

// The plot mapping: flat (with zoom/pan) -> folded into a circle.
const plot = { S: 1.25, gx: 0, gy: -1.2, fold: 0, spin: 0, zs: 1 };
function P(x, y, z = 0, out = new THREE.Vector3()) {
  const k = plot.fold;
  if (k <= 0) return out.set(plot.gx + plot.S * x, plot.gy + plot.S * y, z);
  const e = ease.inOutCubic(k);
  const L = lerp(plot.S, TAU * RF, e);
  const Sv = lerp(plot.S, 0.62, e);
  const kap = (k * TAU) / L;
  const s = (x - 0.5) * L, h = y * Sv;
  const a = kap * s;
  let lx = Math.sin(a) / kap + h * Math.sin(a);
  let ly = (Math.cos(a) - 1) / kap + h * Math.cos(a);
  const rot = lerp(0, 0.9, e) + plot.spin;
  const cr = Math.cos(rot), sr = Math.sin(rot);
  const rx = lx * cr - ly * sr, ry = lx * sr + ly * cr;
  // anchor: baseline centre moves so that the closed circle is centred on the origin
  const R = L / (TAU * Math.max(k, 1e-4));
  const cx = R * sr, cy = -R * cr;           // rotated local circle centre (0,-R)
  const ax0 = plot.gx + plot.S * 0.5, ay0 = plot.gy;
  const ax = lerp(ax0, -cx, e), ay = lerp(ay0, -cy, e);
  return out.set(ax + rx, ay + ry, z * lerp(1, 0.55, e));
}

// ------------------------------------------------------------------ environment for metals
function studioEnv() {
  const env = new THREE.Scene();
  env.background = new THREE.Color(0x000000);
  const strip = (w, h, pos, c, k) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.copy(pos); m.lookAt(0, 0, 0); env.add(m);
  };
  strip(10, 2.2, V(0, 7, 3), '#fff4e2', 3.2);
  strip(1.2, 9, V(-7, 0, 2), '#5ab8ff', 2.6);
  strip(1.6, 8, V(7, 1, 3), '#ffc870', 3.2);
  strip(8, 1.2, V(0, -6, 4), '#ffe2b0', 1.5);
  strip(4, 4, V(0, 2, -8), '#fff1dc', 2.0);
  strip(1.0, 6, V(3, 4, 7), '#ffffff', 2.4);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(env, 0.035);
  return rt.texture;
}

// ------------------------------------------------------------------ build
let E = {};
async function build() {
  await Promise.all([
    'italic 40px "KaTeX_Math"', '40px "KaTeX_Main"', '40px "KaTeX_Size1"', '40px "KaTeX_Size2"',
    '600 40px "Cormorant Garamond"', '300 40px "Inter"',
  ].map((s) => document.fonts.load(s)));
  const [gar, kmath] = await Promise.all([
    loadOT('node_modules/@fontsource/cormorant-garamond/files/cormorant-garamond-latin-600-normal.woff'),
    loadOT('node_modules/katex/dist/fonts/KaTeX_Math-Italic.ttf'),
  ]);
  const envMap = studioEnv();

  scene.add(new THREE.AmbientLight(0xffffff, 0.08));
  const key = new THREE.DirectionalLight(0xfff0d8, 1.2); key.position.set(3, 4, 6); scene.add(key);
  const rim = new THREE.DirectionalLight(0x58b4ff, 0.8); rim.position.set(-5, 1, -3); scene.add(rim);
  const sweep = new THREE.PointLight(0xffe0a8, 0, 8, 1.5); scene.add(sweep);
  E.key = key; E.rim = rim; E.sweep = sweep;

  // ---- particles
  E.particles = makeParticles(9000, PAL, DOF, H);
  scene.add(E.particles);

  // ---- golden circle
  const circ = linspace(0, 1, 361).map((u) => V(2.2 * Math.cos(PI / 2 - TAU * u), 2.2 * Math.sin(PI / 2 - TAU * u), 0));
  E.ring = line([circ], { width: 4.5, color: col('gold', 2.2), halo: 0.45, head: 1.5 });
  E.ringBase = circ;

  // ---- title MATHEMATICS (true 3D lettering)
  const goldMat = (emis = 0.22) => () => new THREE.MeshStandardMaterial({
    color: new THREE.Color('#f3dfb4'), metalness: 0.65, roughness: 0.42, envMap, envMapIntensity: 1.0,
    emissive: new THREE.Color('#e7b866'), emissiveIntensity: emis, transparent: true, opacity: 0,
  });
  E.title = new Text3D(gar, 'MATHEMATICS', { size: 0.62, depth: 0.07, bevel: 0.008, makeMaterial: goldMat(0.3), tracking: 0.12 });
  E.title.scale.setScalar(3.55 / E.title.width);
  E.title.userData.s = E.title.scale.x;
  E.title.position.set(0, 0, 0.25);
  scene.add(E.title);

  // ---- polar grid on the floor (xz plane)
  const polar = [];
  for (const r of [1, 2]) polar.push(linspace(0, 1, 181).map((u) => V(r * Math.cos(TAU * u), 0, r * Math.sin(TAU * u))));
  for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; polar.push(segPts(V(0.25 * Math.cos(a), 0, 0.25 * Math.sin(a)), V(3.3 * Math.cos(a), 0, 3.3 * Math.sin(a)), 24)); }
  E.polar = line(polar, { width: 1.4, color: col('ivory', 0.55), halo: 0.2, opacity: 0, endFade: 0.08 });

  // ---- axes (3D -> 2D graph axes)
  const axPts = () => [Array.from({ length: 48 }, () => V()), Array.from({ length: 48 }, () => V()), Array.from({ length: 48 }, () => V())];
  E.axPolys = axPts();
  E.axX = line([E.axPolys[0]], { width: 2.4, color: col('gold', 1.3), halo: 0.3, endFade: 0.1 });
  E.axY = line([E.axPolys[1]], { width: 2.4, color: col('ivory', 1.2), halo: 0.3, endFade: 0.1 });
  E.axZ = line([E.axPolys[2]], { width: 2.4, color: col('blue', 1.6), halo: 0.3, endFade: 0.1 });
  E.lblX = eqPlane(M.t('x', 'math'), 0.42, { color: col('gold', 1.4) });
  E.lblY = eqPlane(M.t('y', 'math'), 0.42, { color: col('ivory', 1.3) });
  E.lblZ = eqPlane(M.t('z', 'math'), 0.42, { color: col('blue', 1.6) });
  // right triangle 3-4-5 in the xy plane (scaled 0.4): legs b = 1.6, a = 1.2, c = 2.0
  const tri = [[V(0, 0, 0), V(1.6, 0, 0), V(1.6, 1.2, 0), V(0, 0, 0)]].map((p) => {
    const out = []; for (let i = 0; i < p.length - 1; i++) out.push(...segPts(p[i], p[i + 1], 30).slice(i ? 1 : 0)); return out;
  });
  E.tri = line(tri, { width: 2.6, color: col('cyan', 1.6), halo: 0.35, head: 1 });
  E.triSq = line([[V(1.38, 0, 0), V(1.38, 0.22, 0), V(1.6, 0.22, 0)]], { width: 1.6, color: col('cyan', 1.2), halo: 0.2 });
  E.lblA = eqPlane(M.t('a', 'math'), 0.36, { color: col('cyan', 1.5) });
  E.lblB = eqPlane(M.t('b', 'math'), 0.36, { color: col('cyan', 1.5) });
  E.lblC = eqPlane(M.t('c', 'math'), 0.36, { color: col('cyan', 1.5) });

  // ---- the two great equations
  const T = M.t, sp = M.sp;
  const PRIME = { w: 0.3, asc: 0.8, desc: 0, draw(ctx, x, y, em) {
    ctx.beginPath(); ctx.moveTo(x + 0.17 * em, y - 0.76 * em); ctx.lineTo(x + 0.3 * em, y - 0.74 * em);
    ctx.lineTo(x + 0.11 * em, y - 0.38 * em); ctx.lineTo(x + 0.07 * em, y - 0.39 * em); ctx.closePath(); ctx.fill(); } };
  E.euler = eqPlane(M.row(M.sup(T('e', 'math'), M.row(T('i', 'math', 0.72), T('π', 'math', 0.72)), 0.03, 0.44), sp(0.24), T('+'), sp(0.24), T('1'), sp(0.3), T('='), sp(0.3), T('0')),
    0.66, { color: col('gold', 1.3), color2: col('ivory', 1.25), glow: 0.16 });
  E.pyth = eqPlane(M.row(M.sup(T('a', 'math'), T('2', 'main', 0.7)), sp(0.24), T('+'), sp(0.24), M.sup(T('b', 'math'), T('2', 'main', 0.7)), sp(0.3), T('='), sp(0.3), M.sup(T('c', 'math'), T('2', 'main', 0.7))),
    0.6, { color: col('ivory', 1.25), color2: col('cyan', 1.4), glow: 0.16 });

  // ---- floating mathematical language (all identities are exact)
  const sqrt = (b) => ({ w: b.w + 0.9, asc: b.asc + 0.15, desc: b.desc, draw(ctx, x, y, em) {
    T('√').draw(ctx, x, y + 0.04 * em, em); b.draw(ctx, x + 0.86 * em, y, em);
    ctx.fillRect(x + 0.8 * em, y - (b.asc + 0.12) * em, (b.w + 0.1) * em, 0.045 * em); } });
  const floatDefs = [
    [M.row(T('Σ'), M.sub(sp(0), T('n=1', 'main', 0.55), 0, 0.42), sp(0.12), M.frac(T('1'), M.sup(T('n', 'math'), T('2', 'main', 0.7))), sp(0.25), T('='), sp(0.25), M.frac(M.sup(T('π', 'math'), T('2', 'main', 0.7)), T('6'))), -2.1, 1.7, -6, 0.42],
    [M.row(M.sup(T('sin'), T('2', 'main', 0.7)), T('θ', 'math'), sp(0.2), T('+'), sp(0.2), M.sup(T('cos'), T('2', 'main', 0.7)), T('θ', 'math'), sp(0.25), T('='), sp(0.25), T('1')), 2.3, -1.3, -7.5, 0.4],
    [M.row(T('φ', 'math'), sp(0.25), T('='), sp(0.25), M.frac(M.row(T('1'), sp(0.15), T('+'), sp(0.15), sqrt(T('5'))), T('2'))), -2.6, -2.0, -4.5, 0.38],
    [M.row(M.frac(T('d'), M.row(T('d'), T('x', 'math'))), sp(0.1), M.sup(T('e'), T('x', 'math', 0.7)), sp(0.25), T('='), sp(0.25), M.sup(T('e'), T('x', 'math', 0.7))), 2.6, 2.6, -5, 0.4],
    [T('∞'), -3.6, 4.2, -9, 0.9], [T('∂'), 4.0, 4.6, -8, 0.8], [T('∇'), -3.0, -4.6, -6, 0.75],
    [T('θ', 'math'), 1.4, 0.4, -10, 0.9], [T('λ', 'math'), -0.8, -3.9, -11, 0.9], [T('Δ'), 3.8, -3.8, -9, 0.8],
    [T('∫', 'size1'), 2.4, 0.5, 4.0, 0.5], [T('π', 'math'), -2.0, 0.9, 4.6, 0.45], [T('Σ'), -3.3, 5.6, -7, 0.6],
    [T('√'), -2.6, -5.6, -6, 0.7], [T('i', 'math'), 3.1, 1.2, -3, 0.5], [T('e', 'math'), -3.4, 2.6, -3.5, 0.55],
  ];
  E.floaters = floatDefs.map(([box, x, y, z, em], i) => {
    const tp = eqPlane(box, em, { color: (i % 3 === 0 ? col('gold', 1.2) : i % 3 === 1 ? col('ivory', 1.0) : col('blue', 1.4)), glow: 0.4 });
    tp.position.set(x, y, z); tp.userData = { x, y, z, i, spin: (i % 2 ? 1 : -1) * (0.25 + (i % 5) * 0.07) };
    return tp;
  });

  // ---- graph grid (plot space)
  E.gridDef = [];
  for (let x = -1.5; x <= 1.51; x += 0.5) if (Math.abs(x) > 1e-6) E.gridDef.push([[x, -2.75], [x, 3.6]]);
  for (let y = -2.5; y <= 3.51; y += 0.5) if (Math.abs(y) > 1e-6) E.gridDef.push([[-1.75, y], [1.75, y]]);
  E.gridPolys = E.gridDef.map(() => [V(), V()]);
  E.grid = line(E.gridPolys, { width: 1.1, color: new THREE.Color(0.18, 0.32, 0.5), halo: 0.15, opacity: 0, endFade: 0.12 });
  E.tickPolys = [-1, 1, 2, 3, -1.5].map(() => [V(), V()]);
  E.ticks = line(E.tickPolys, { width: 1.8, color: col('ivory', 0.9), halo: 0.2, opacity: 0 });

  // ---- f(x) = x^2
  E.curveX = linspace(-1.75, 1.75, 351);
  E.curvePts = E.curveX.map(() => V());
  E.curve = line([E.curvePts], { width: 5, color: col('gold', 2.0), color2: col('gold', 2.0), halo: 0.5, head: 2.0 });
  E.baseX = linspace(0, 1, 121);
  E.basePts = E.baseX.map(() => V());
  E.baseline = line([E.basePts], { width: 3, color: col('ivory', 1.6), halo: 0.4, opacity: 0 });

  // ---- tangent, derivative trace, connector, dots
  E.tanPts = linspace(0, 1, 40).map(() => V());
  E.tangent = line([E.tanPts], { width: 3.6, color: col('ivory', 1.9), halo: 0.45, endFade: 0.22 });
  E.dPts = linspace(0, 1, 160).map(() => V());
  E.deriv = line([E.dPts], { width: 4, color: col('blue', 2.2), halo: 0.5, head: 1.5 });
  E.connPts = [V(), V()];
  E.conn = line([E.connPts], { width: 1.6, color: col('ivory', 0.9), halo: 0.1, dash: 7 });
  E.dotF = new GlowDot(0.55, col('ivory', 2.5)); scene.add(E.dotF);
  E.dotD = new GlowDot(0.5, col('blue', 3.0)); scene.add(E.dotD);

  // ---- calculus equations
  E.eqF = eqPlane(M.row(T('f', 'math'), sp(0.06), T('('), T('x', 'math'), T(')'), sp(0.28), T('='), sp(0.28), M.sup(T('x', 'math'), T('2', 'main', 0.7))),
    0.62, { color: col('gold', 1.35), glow: 0.16 });
  E.eqFp = eqPlane(M.row(M.row(T('f', 'math'), PRIME), sp(0.04), T('('), T('x', 'math'), T(')'), sp(0.28), T('='), sp(0.28), T('2'), T('x', 'math')),
    0.62, { color: col('blue', 1.7), glow: 0.16 });
  const fmt = (v) => (v < 0 ? '−' : '') + Math.abs(v).toFixed(2);
  E.slope = new DynamicLabel((s) => M.row(T('m', 'math'), sp(0.2), T('='), sp(0.2), T('2'), M.sub(T('x', 'math'), T('0', 'main', 0.7), 0, 0.15), sp(0.2), T('='), sp(0.2), T(s)),
    '−0.00', DOF, { color: col('ivory', 1.5), tex: { emPx: Math.max(60, 150 * SCALE), emWorld: 0.36 } });
  scene.add(E.slope); E.fmt = fmt;

  // ---- integration
  E.eqInt = eqPlane(M.row(M.int(T('0', 'main', 0.7), T('1', 'main', 0.7)), M.sup(T('x', 'math'), T('2', 'main', 0.7)), sp(0.17), T('d'), T('x', 'math'), sp(0.3), T('='), sp(0.3), M.frac(T('1'), T('3'))),
    0.6, { color: col('gold', 1.35), color2: col('ivory', 1.3), glow: 0.16 });
  E.sumLbl = new DynamicLabel((s) => { const [a, b] = s.split('|'); return M.row(T('n', 'math'), sp(0.2), T(a === '∞' ? '→' : '='), sp(0.2), T(a), sp(0.9), T('Σ'), sp(0.2), T(a === '∞' ? '→' : '≈'), sp(0.2), b === '1/3' ? M.frac(T('1'), T('3')) : T(b)); },
    '128|0.33333', DOF, { color: col('ivory', 1.4), tex: { emPx: Math.max(60, 150 * SCALE), emWorld: 0.34 } });
  scene.add(E.sumLbl);
  E.lbl0 = eqPlane(T('0'), 0.34, { color: col('ivory', 1.2) });
  E.lbl1 = eqPlane(T('1'), 0.34, { color: col('ivory', 1.2) });

  // surface sheet: the curve swept along z
  const NU = 141, NW = 9;
  {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(NU * NW * 3), ax = new Float32Array(NU * NW), aw = new Float32Array(NU * NW);
    const xs = linspace(-1.75, 1.75, NU), ws = linspace(-1, 1, NW);
    xs.forEach((x, i) => ws.forEach((w, j) => { ax[i * NW + j] = x; aw[i * NW + j] = w; }));
    const idx = [];
    for (let i = 0; i < NU - 1; i++) for (let j = 0; j < NW - 1; j++) { const a = i * NW + j, b = a + NW; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    g.setIndex(idx);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aX', new THREE.BufferAttribute(ax, 1)); g.setAttribute('aW', new THREE.BufferAttribute(aw, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { uOpacity: { value: 0 }, uXmin: { value: -9 }, uXmax: { value: 9 }, uC1: { value: col('gold', 0.9) }, uC2: { value: col('cyan', 1.2) } },
      vertexShader: `attribute float aX; attribute float aW; varying float vX; varying float vW; varying float vY;
        void main(){ vX = aX; vW = aW; vY = aX*aX; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform float uOpacity; uniform float uXmin; uniform float uXmax; uniform vec3 uC1; uniform vec3 uC2;
        varying float vX; varying float vW; varying float vY;
        float gridLine(float v, float k){ float q = v * k; float d = abs(fract(q + 0.5) - 0.5); return 1.0 - smoothstep(0.0, fwidth(q) * 1.4, d); }
        void main(){
          float m = smoothstep(uXmin - 0.015, uXmin + 0.015, vX) * (1.0 - smoothstep(uXmax - 0.015, uXmax + 0.015, vX));
          float edge = smoothstep(0.82, 1.0, abs(vW));
          float iso = gridLine(vX, 10.0) * 0.55 + gridLine(vW, 2.0) * 0.35;
          float a = (0.04 + 0.4 * edge + 0.22 * iso) * uOpacity * m;
          vec3 c = mix(uC1, uC2, smoothstep(0.0, 1.0, abs(vW))) ;
          gl_FragColor = vec4(c * a, a); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    m.extensions = { derivatives: true };
    E.sheet = new THREE.Mesh(g, m); E.sheet.frustumCulled = false; scene.add(E.sheet);
    E.sheetDims = { NU, NW, xs, ws };
  }
  // area under the curve on [0,1] (front + back faces)
  {
    const NX = 121, NV = 11;
    const g = new THREE.BufferGeometry();
    const n = NX * NV * 2;
    const pos = new Float32Array(n * 3), ax = new Float32Array(n), av = new Float32Array(n);
    const xs = linspace(0, 1, NX), vs = linspace(0, 1, NV);
    let k = 0; const idx = [];
    for (let s = 0; s < 2; s++) xs.forEach((x) => vs.forEach((v) => { ax[k] = x; av[k] = v; k++; }));
    for (let s = 0; s < 2; s++) for (let i = 0; i < NX - 1; i++) for (let j = 0; j < NV - 1; j++) {
      const a = s * NX * NV + i * NV + j, b = a + NV; idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    g.setIndex(idx);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aX', new THREE.BufferAttribute(ax, 1)); g.setAttribute('aV', new THREE.BufferAttribute(av, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { uOpacity: { value: 0 }, uTime: { value: 0 }, uC1: { value: col('deepGold', 0.3) }, uC2: { value: col('gold', 0.8) } },
      vertexShader: `attribute float aX; attribute float aV; varying float vX; varying float vV;
        void main(){ vX = aX; vV = aV; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform float uOpacity; uniform float uTime; uniform vec3 uC1; uniform vec3 uC2; varying float vX; varying float vV;
        void main(){
          float shimmer = 0.85 + 0.15 * sin(vX * 40.0 - uTime * 3.0);
          float a = (0.03 + 0.22 * pow(vV, 1.8)) * shimmer;
          a += smoothstep(0.95, 1.0, vV) * 0.25;
          a *= uOpacity;
          gl_FragColor = vec4(mix(uC1, uC2, vV) * a, a); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    E.area = new THREE.Mesh(g, m); E.area.frustumCulled = false; scene.add(E.area);
    E.areaDims = { NX, NV, xs, vs };
  }
  // Riemann boxes
  {
    const m = new THREE.ShaderMaterial({
      uniforms: { uOpacity: { value: 0 }, uEdge: { value: 1 }, uC1: { value: col('deepGold', 0.55) }, uC2: { value: col('gold', 1.25) }, uCE: { value: col('ivory', 1.7) } },
      vertexShader: `varying vec3 vL; varying vec3 vS; varying vec3 vN;
        void main(){ vL = position; vN = normal;
          vS = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform float uOpacity; uniform float uEdge; uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uCE;
        varying vec3 vL; varying vec3 vS; varying vec3 vN;
        void main(){
          vec3 d = (0.5 - abs(vL)) * vS;
          vec3 an = abs(vN);
          float e = an.x > 0.5 ? min(d.y, d.z) : (an.y > 0.5 ? min(d.x, d.z) : min(d.x, d.y));
          float edge = exp(-e * 90.0);
          float hgt = vL.y + 0.5;
          float a = (0.09 + 0.2 * hgt) + edge * uEdge * (0.4 + 0.45 * step(0.49, vL.y));
          a *= uOpacity;
          vec3 c = mix(mix(uC1, uC2, hgt), uCE, clamp(edge * uEdge, 0.0, 1.0));
          gl_FragColor = vec4(c * a, a); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    E.boxes = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), m, 256);
    E.boxes.frustumCulled = false; E.boxes.count = 0; scene.add(E.boxes);
  }

  // ---- PI: the metallic symbol (KaTeX / Computer Modern italic pi outline, extruded)
  {
    const { geo } = extrudeGlyph(kmath, 'π', 4, { depth: 0.34, bevel: 0.045, bevelSeg: 5, curveSeg: 24 });
    geo.computeBoundingBox();
    const bb = geo.boundingBox, c = bb.getCenter(V());
    geo.translate(-c.x, -c.y, -c.z);
    const s = 2.15 / (bb.max.y - bb.min.y);
    geo.scale(s, s, s);
    const piMat = () => new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#ffd28a'), metalness: 1, roughness: 0.2, clearcoat: 0.7, clearcoatRoughness: 0.12,
      envMap, envMapIntensity: 1.5, emissive: new THREE.Color('#b8822e'), emissiveIntensity: 0.06, transparent: true, opacity: 1,
    });
    E.piA = new THREE.Mesh(geo, piMat()); scene.add(E.piA);
    E.piB = new THREE.Mesh(geo, piMat()); scene.add(E.piB);
  }

  // ---- digits of pi on a helix
  const NDIG = 1300;
  E.piStr = piDigits(NDIG).slice(0, NDIG);
  const hp = helixPoints(NDIG, { rx: 2.75, ry: 3.55, step: 0.3, zStart: 1.6, pitch: 1.9, ang0: PI / 2 + 0.55 });
  E.digits = makeDigits(E.piStr, hp, (i) => 10.0 + Math.pow(i, 0.92) * 0.0029, DOF, PAL);
  scene.add(E.digits);
  const rib = hp.filter((_, i) => i % 2 === 0).map((p) => V(p.x * 0.9, p.y * 0.9, p.z));
  E.ribbon = line([rib], { width: 2.2, color: col('gold', 1.3), color2: col('blue', 1.2), halo: 0.35, persp: true, refDepth: 9, near: 2.0, opacity: 0 });
  E.ribbonAppear = (u) => 10.0 + Math.pow(u * NDIG, 0.92) * 0.0029;

  // ---- infinity: three luminous trajectories
  E.infMat = new THREE.Matrix4().compose(V(0, -0.3, ZF + 0.2), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.32, 0, 0)), V(1, 1, 1));
  E.infPolys = [0, 1, 2].map(() => linspace(0, 1, 420).map(() => V()));
  E.inf = [
    line([E.infPolys[0]], { width: 5, color: col('gold', 2.2), halo: 0.55, head: 2.5, persp: true, refDepth: 10 }),
    line([E.infPolys[1]], { width: 2.2, color: col('ivory', 1.8), halo: 0.35, head: 2, persp: true, refDepth: 10 }),
    line([E.infPolys[2]], { width: 2.2, color: col('blue', 2.4), halo: 0.4, head: 2, persp: true, refDepth: 10 }),
  ];

  // ---- finale typography
  E.fin1 = new Text3D(gar, 'INFINITE', { size: 0.62, depth: 0.07, bevel: 0.008, makeMaterial: goldMat(0.32), tracking: 0.3 });
  E.fin1.scale.setScalar(3.7 / E.fin1.width); E.fin1.userData.s = E.fin1.scale.x;
  E.fin1.position.set(0, -1.95, ZF + 0.6);
  E.fin2 = new Text3D(gar, 'POSSIBILITIES', { size: 0.62, depth: 0.07, bevel: 0.008, makeMaterial: goldMat(0.32), tracking: 0.16 });
  E.fin2.scale.setScalar(3.5 / E.fin2.width); E.fin2.userData.s = E.fin2.scale.x;
  E.fin2.position.set(0, -2.68, ZF + 0.6);
  scene.add(E.fin1, E.fin2);
}

// ------------------------------------------------------------------ camera rigs
const rig = (tx, ty, tz, yaw, pitch, dist, fov = 50, roll = 0, ap = 0.3) => ({ tx, ty, tz, yaw, pitch, dist, fov, roll, ap });
const R = [
  [0, 2.5, (t) => { const u = ease.inOutSine(seg(t, 0, 2.5)); return rig(0, 0, 0, 0.05 * Math.sin(t * 0.7), 0.02, lerp(16, 11, u), 50, lerp(-0.06, 0, u), 0.28); }],
  [1.9, 4.6, (t) => { const u = ease.inOutSine(seg(t, 1.9, 4.5)); return rig(0, 0.2, 0, lerp(0, 0.5, u), lerp(0.02, 0.27, u), lerp(11, 12.6, u), 50, 0, 0.35); }],
  [3.7, 7.0, (t) => { const u = ease.inOutSine(seg(t, 3.9, 6.8)); return rig(0, 0.3, 0, lerp(-0.07, 0.06, u), 0.02, 12.4, 50, 0, 0.3); }],
  [6.3, 9.6, (t) => { const u = ease.inOutSine(seg(t, 6.4, 9.3)); return rig(0, lerp(0.3, 0.55, u), 0, lerp(0, -0.42, u), lerp(0.03, 0.24, u), lerp(12.3, 11, u), 50, 0, 0.3); }],
  [8.7, 12.6, (t) => { const u = ease.inOutSine(seg(t, 8.8, 12.4)); return rig(0, lerp(0.4, 0, u), 0, lerp(-0.45, 0.85, u), lerp(0.25, 0.06, u), lerp(11, 9.6, u), 50, 0, 0.36); }],
  [11.8, 15, (t) => {
    const u = seg(t, 11.9, 14.25), e = ease.inOutQuart(u), bump = Math.sin(PI * clamp(u * 1.15));
    return rig(0, lerp(0, -0.3, e), ZF * e, 0.04 * Math.sin(t * 0.6), lerp(0.04, 0.02, e), 10, 50 + 13 * bump * bump, 0.22 * Math.sin(PI * u) * (1 - u * 0.3), lerp(0.42, 0.3, e));
  }],
];
const mixRig = (a, b, w) => { const o = {}; for (const k in a) o[k] = lerp(a[k], b[k], w); return o; };
function camAt(t) {
  let cur = null;
  for (let i = 0; i < R.length; i++) {
    const [s, e, fn] = R[i];
    if (t < s && i > 0) break;
    const r = fn(t);
    if (!cur) { cur = r; continue; }
    const prevEnd = R[i - 1][1];
    const w = smoother(seg(t, s, prevEnd));
    cur = mixRig(cur, r, w);
  }
  return cur;
}

// ------------------------------------------------------------------ kinetic 3D typography
function animText3D(tx, t, tIn, tOut, o = {}) {
  const g = tx.glyphs, n = g.length;
  const st = o.stagger ?? 0.045, dur = o.dur ?? 0.75;
  let trk = lerp(o.tr0 ?? 0.45, o.tr1 ?? 0.12, ease.outExpo(seg(t, tIn, tIn + (o.trDur ?? 1.4))));
  const qx = tOut ? ease.inOutCubic(seg(t, tOut, tOut + 0.7)) : 0;
  trk += qx * (o.trOut ?? 0.55);
  tx.setTracking(trk);
  g.forEach((L, i) => {
    const d = Math.abs(i - (n - 1) / 2);
    const p = ease.outQuart(seg(t, tIn + d * st, tIn + d * st + dur));
    const q = tOut ? ease.inCubic(seg(t, tOut + d * 0.03, tOut + d * 0.03 + 0.55)) : 0;
    L.pivot.position.set(L.baseX, (1 - p) * -0.35, (1 - p) * -0.8 + q * 1.4);
    L.pivot.rotation.set((1 - p) * 1.25 - q * 0.4, q * (i < n / 2 ? -0.5 : 0.5), 0);
    L.mat.opacity = p * (1 - q);
    L.mat.visible = L.mat.opacity > 0.002;
    L.mat.emissiveIntensity = (o.emis ?? 0.3) * (1 + 1.5 * Math.exp(-Math.pow((t - (tIn + d * st + dur * 0.5)) / 0.25, 2)));
  });
}

// text-plane reveal: blur-to-sharp wipe in, drift + blur out
function revealPlane(tp, t, tIn, tOut, o = {}) {
  const dIn = o.dIn ?? 0.6, dOut = o.dOut ?? 0.5;
  const a = ease.outCubic(seg(t, tIn, tIn + dIn));
  const b = tOut != null ? ease.inOutCubic(seg(t, tOut, tOut + dOut)) : 0;
  tp.u.uReveal.value = ease.inOutSine(seg(t, tIn, tIn + dIn * 0.95));
  tp.u.uOpacity.value = Math.min(1, a * 1.4) * (1 - b) * (o.k ?? 1);
  tp.u.uBlur.value = (1 - a) * 2.2 + b * 3.0;
  tp.u.uHead.value = 1.2;
  tp.visible = tp.u.uOpacity.value > 0.002;
  return { a, b };
}

// ------------------------------------------------------------------ the timeline
const tmp = V(), tmp2 = V();
function update(t) {
  // camera
  const c = camAt(t);
  const target = V(c.tx, c.ty, c.tz);
  orbitPos(target, c.yaw, c.pitch, c.dist, camera.position);
  camera.up.set(Math.sin(c.roll), Math.cos(c.roll), 0);
  camera.lookAt(target);
  camera.fov = c.fov; camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  DOF.uFocus.value = c.dist;
  DOF.uAperture.value = c.ap;

  // lights: slow orbiting key for travelling reflections
  E.key.position.set(6 * Math.cos(t * 0.5 + 0.6), 4 + Math.sin(t * 0.4), 6 * Math.sin(t * 0.5 + 0.6) + 2).add(target);
  E.rim.position.set(-5, 1, -3).add(target);

  // ---------------- plot transform (zoom into [0,1], then fold)
  {
    const z = ease.inOutCubic(seg(t, 6.55, 7.7));
    plot.S = lerp(1.25, 3.3, z);
    plot.gx = lerp(0, -1.65, z);
    plot.gy = lerp(-1.2, -1.95, z);
    plot.fold = seg(t, 8.95, 10.1);
    const u = Math.max(0, t - 9.9);
    plot.spin = 0.32 * (u - (1 - Math.exp(-2 * u)) / 2);
  }
  // ---------------- particles
  const P_ = E.particles.u;
  P_.uTime.value = t;
  P_.uIntro.value = ease.inOutSine(seg(t, 0.0, 0.6));
  P_.uInfA.value = seg(t, 12.6, 13.9);
  P_.uInfMat.value.copy(E.infMat);
  P_.uGlobal.value = 1;

  // ---------------- golden circle
  {
    const draw = ease.inOutCubic(seg(t, 0.55, 1.85));
    const tilt = ease.inOutCubic(seg(t, 2.0, 3.1));
    E.ring.u.uProgress.value = draw;
    E.ring.u.uOpacity.value = (draw > 0 ? 1 : 0) * (1 - 0.45 * tilt) * (1 - smooth(seg(t, 3.6, 4.3)));
    E.ring.rotation.x = -PI / 2 * tilt;
    E.ring.scale.setScalar(lerp(1, 3 / 2.2, tilt));
    E.ring.visible = E.ring.u.uOpacity.value > 0.001;
    E.ring.u.uWidth.value = lerp(4.5, 2.4, tilt) * LW;
  }
  // ---------------- MATHEMATICS
  animText3D(E.title, t, 0.95, 2.0, { tr0: 0.55, tr1: 0.14, emis: 0.3, trOut: 0.22 });
  E.title.visible = t < 3.0;
  E.sweep.position.set(lerp(-3, 3, seg(t, 1.1, 2.1)), 0.4, 1.4);
  E.sweep.intensity = 6 * win(t, 1.0, 1.3, 1.9, 2.2);

  // ---------------- polar floor grid
  {
    const d = ease.inOutCubic(seg(t, 2.2, 3.0));
    E.polar.u.uProgress.value = d;
    E.polar.u.uOpacity.value = (d > 0 ? 1 : 0) * (1 - smooth(seg(t, 3.6, 4.3)));
    E.polar.visible = E.polar.u.uOpacity.value > 0.001;
  }
  // ---------------- axes
  {
    const draw = ease.outCubic(seg(t, 2.3, 3.1));
    const mph = ease.inOutCubic(seg(t, 3.7, 4.55));
    const fadeOut = 1 - smooth(seg(t, 8.35, 8.95));
    const ends3 = [[V(-3.2, 0, 0), V(3.2, 0, 0)], [V(0, -3.2, 0), V(0, 3.2, 0)], [V(0, 0, -3.2), V(0, 0, 3.2)]];
    const endsP = [[P(-1.9, 0), P(1.9, 0)], [P(0, -2.9), P(0, 3.6)], [V(0, 0, -3.2), V(0, 0, 3.2)]];
    for (let a = 0; a < 3; a++) {
      const A = ends3[a][0].clone().lerp(endsP[a][0], mph), B = ends3[a][1].clone().lerp(endsP[a][1], mph);
      const mid = A.clone().lerp(B, 0.5);
      const pts = E.axPolys[a];
      // draw outwards from the middle
      const A2 = mid.clone().lerp(A, draw), B2 = mid.clone().lerp(B, draw);
      pts.forEach((p, i) => p.copy(A2).lerp(B2, i / (pts.length - 1)));
    }
    E.axX.update([E.axPolys[0]]); E.axY.update([E.axPolys[1]]); E.axZ.update([E.axPolys[2]]);
    const on = draw > 0 ? 1 : 0;
    E.axX.u.uOpacity.value = on * fadeOut;
    E.axY.u.uOpacity.value = on * fadeOut;
    E.axZ.u.uOpacity.value = on * (1 - smooth(seg(t, 3.55, 4.2)));
    for (const l of [E.axX, E.axY, E.axZ]) l.visible = l.u.uOpacity.value > 0.001;
    const lblA = ease.outCubic(seg(t, 2.6, 3.1)) * (1 - smooth(seg(t, 3.55, 4.1)));
    const place = (lbl, p) => { lbl.position.copy(p); lbl.face(camera); lbl.u.uOpacity.value = lblA; lbl.u.uReveal.value = 1; lbl.visible = lblA > 0.002; };
    place(E.lblX, V(3.45, 0.05, 0)); place(E.lblY, V(0.22, 3.45, 0)); place(E.lblZ, V(0, 0.05, 3.5));
    // right triangle with a, b, c
    const td = ease.inOutCubic(seg(t, 2.65, 3.35));
    const tf = (1 - smooth(seg(t, 3.65, 4.15)));
    E.tri.u.uProgress.value = td; E.tri.u.uOpacity.value = (td > 0 ? 1 : 0) * tf; E.tri.visible = td > 0 && tf > 0;
    const sq = seg(t, 3.2, 3.45) * tf; E.triSq.u.uOpacity.value = sq; E.triSq.visible = sq > 0;
    const la = ease.outCubic(seg(t, 3.15, 3.5)) * tf;
    const lp = (lbl, p) => { lbl.position.copy(p); lbl.face(camera); lbl.u.uOpacity.value = la; lbl.u.uReveal.value = 1; lbl.visible = la > 0.002; };
    lp(E.lblA, V(1.85, 0.6, 0)); lp(E.lblB, V(0.8, -0.27, 0)); lp(E.lblC, V(0.62, 0.78, 0));
  }
  // ---------------- the language: equations in depth
  {
    E.euler.position.set(-0.25 + 0.15 * Math.sin(t * 0.6), 4.3 + 0.08 * Math.sin(t * 0.9), 1.2);
    E.euler.face(camera, 0.82);
    revealPlane(E.euler, t, 2.3, 3.8, { dIn: 0.7 });
    E.pyth.position.set(0.45 + 0.12 * Math.sin(t * 0.7 + 1), -3.55 + 0.07 * Math.sin(t * 0.8), -0.4);
    E.pyth.face(camera, 0.82);
    revealPlane(E.pyth, t, 2.6, 3.9, { dIn: 0.7 });
    for (const fl of E.floaters) {
      const { x, y, z, i, spin } = fl.userData;
      fl.position.set(x + 0.15 * Math.sin(t * 0.5 + i), y + 0.12 * Math.cos(t * 0.45 + i * 1.7), z);
      fl.quaternion.copy(camera.quaternion);
      fl.rotateY(Math.sin(t * spin + i) * 0.55);
      fl.rotateZ(Math.sin(t * 0.3 + i) * 0.08);
      const inT = 2.05 + (i % 7) * 0.09;
      const a = ease.outCubic(seg(t, inT, inT + 0.8)) * (1 - smooth(seg(t, 3.9 + (i % 4) * 0.12, 4.8 + (i % 4) * 0.12)));
      fl.u.uOpacity.value = a * (z > 0 ? 0.55 : 0.6);
      fl.u.uReveal.value = 1;
      fl.u.uBlur.value = 0.3;
      fl.visible = a > 0.002;
    }
  }

  // ---------------- grid
  {
    const d = ease.inOutCubic(seg(t, 3.95, 4.75));
    const fo = 1 - smooth(seg(t, 8.35, 8.95));
    E.gridDef.forEach(([a, b], i) => { P(a[0], a[1], 0, E.gridPolys[i][0]); P(b[0], b[1], 0, E.gridPolys[i][1]); });
    E.grid.update(E.gridPolys);
    E.grid.u.uProgress.value = d; E.grid.u.uOpacity.value = (d > 0 ? 1 : 0) * fo; E.grid.visible = d > 0 && fo > 0;
    const tk = 0.07;
    [[1, 0], [-1, 0], [0, 1], [0, 2], [0, 3]].forEach(([x, y], i) => {
      if (y === 0) { P(x, -tk, 0, E.tickPolys[i][0]); P(x, tk, 0, E.tickPolys[i][1]); }
      else { P(-tk, y, 0, E.tickPolys[i][0]); P(tk, y, 0, E.tickPolys[i][1]); }
    });
    E.ticks.update(E.tickPolys);
    E.ticks.u.uOpacity.value = ease.outCubic(seg(t, 4.4, 4.9)) * fo; E.ticks.visible = E.ticks.u.uOpacity.value > 0;
  }
  // ---------------- curve f(x) = x^2
  {
    E.curveX.forEach((x, i) => P(x, f(x), 0, E.curvePts[i]));
    E.curve.update([E.curvePts]);
    const d = ease.inOutCubic(seg(t, 4.15, 5.05));
    const r = ease.inOutCubic(seg(t, 8.3, 9.0));
    const u0 = (0 + 1.75) / 3.5, u1 = (1 + 1.75) / 3.5;
    E.curve.u.uProgress.value = lerp(d, u1, r);
    E.curve.u.uStart.value = lerp(0, u0, r);
    E.curve.u.uOpacity.value = (d > 0 ? 1 : 0) * (1 - smooth(seg(t, 12.15, 12.6)));
    E.curve.visible = d > 0 && E.curve.u.uOpacity.value > 0;
    E.curve.u.uWidth.value = lerp(5, 4, seg(t, 9, 10)) * LW;
    E.baseX.forEach((x, i) => P(x, 0, 0, E.basePts[i]));
    E.baseline.update([E.basePts]);
    E.baseline.u.uOpacity.value = smooth(seg(t, 8.55, 8.95)) * (1 - smooth(seg(t, 12.15, 12.6)));
    E.baseline.visible = E.baseline.u.uOpacity.value > 0;
  }
  // ---------------- tangent line & derivative
  {
    const x0 = lerp(-1.3, 1.3, ease.inOutSine(seg(t, 5.0, 6.45)));
    const inA = ease.outCubic(seg(t, 4.85, 5.2));
    const outA = 1 - smooth(seg(t, 6.45, 6.85));
    const m = 2 * x0;                                   // f'(x0): exact slope of the tangent
    const dir = new THREE.Vector2(1, m).normalize();
    const half = 1.45 * inA;
    E.tanPts.forEach((p, i) => { const s = lerp(-half, half, i / (E.tanPts.length - 1)); P(x0 + dir.x * s, f(x0) + dir.y * s, 0.01, p); });
    E.tangent.update([E.tanPts]);
    E.tangent.u.uOpacity.value = inA * outA; E.tangent.visible = inA * outA > 0;
    // derivative graph traced by the moving point (x0, 2 x0)
    const xs = -1.3;
    E.dPts.forEach((p, i) => { const x = lerp(xs, x0, i / (E.dPts.length - 1)); P(x, 2 * x, 0.01, p); });
    E.deriv.update([E.dPts]);
    E.deriv.u.uOpacity.value = inA * outA; E.deriv.visible = inA * outA > 0;
    P(x0, f(x0), 0.02, E.dotF.position); P(x0, 2 * x0, 0.02, E.dotD.position);
    E.dotF.u.uOpacity.value = inA * outA; E.dotD.u.uOpacity.value = inA * outA;
    E.dotF.visible = E.dotD.visible = inA * outA > 0;
    P(x0, f(x0), 0, E.connPts[0]); P(x0, 2 * x0, 0, E.connPts[1]);
    E.conn.update([E.connPts]);
    E.conn.u.uOpacity.value = 0.8 * ease.outCubic(seg(t, 5.15, 5.5)) * outA; E.conn.visible = E.conn.u.uOpacity.value > 0;
    // slope readout
    E.slope.setText(E.fmt(m));
    P(x0, f(x0), 0, tmp);
    E.slope.position.set(0.3, 3.2, 0.2);
    E.slope.face(camera, 0.9);
    const sa = ease.outCubic(seg(t, 5.15, 5.5)) * (1 - smooth(seg(t, 6.4, 6.8)));
    E.slope.u.uOpacity.value = sa; E.slope.u.uReveal.value = 1; E.slope.visible = sa > 0;
  }
  // ---------------- calculus equations
  {
    E.eqF.position.set(0, 4.75, 0.2); E.eqF.face(camera, 0.9);
    revealPlane(E.eqF, t, 4.25, 6.7, { dIn: 0.6 });
    E.eqFp.position.set(0, 3.95, 0.2); E.eqFp.face(camera, 0.9);
    revealPlane(E.eqFp, t, 4.95, 6.45, { dIn: 0.6 });
  }
  // ---------------- integration
  {
    // illuminated surface (curve swept along z)
    const D = 0.75 * ease.inOutCubic(seg(t, 6.7, 7.45));
    const { NU, NW, xs, ws } = E.sheetDims;
    const pa = E.sheet.geometry.attributes.position.array;
    xs.forEach((x, i) => ws.forEach((w, j) => { P(x, f(x), w * D, tmp); pa.set([tmp.x, tmp.y, tmp.z], (i * NW + j) * 3); }));
    E.sheet.geometry.attributes.position.needsUpdate = true;
    const r = ease.inOutCubic(seg(t, 8.3, 9.0));
    E.sheet.material.uniforms.uXmin.value = lerp(-1.8, 0, r);
    E.sheet.material.uniforms.uXmax.value = lerp(1.8, 1, r);
    E.sheet.material.uniforms.uOpacity.value = smooth(seg(t, 6.7, 7.2)) * (1 - smooth(seg(t, 12.1, 12.6)));
    E.sheet.visible = E.sheet.material.uniforms.uOpacity.value > 0;
    // area
    const { NX, NV, xs: ax, vs } = E.areaDims;
    const aa = E.area.geometry.attributes.position.array;
    const Dz = Math.max(D, 0.001) * 0.98;
    let k = 0;
    for (let s = 0; s < 2; s++) for (const x of ax) for (const v of vs) { P(x, f(x) * v, s ? Dz : -Dz, tmp); aa[k++] = tmp.x; aa[k++] = tmp.y; aa[k++] = tmp.z; }
    E.area.geometry.attributes.position.needsUpdate = true;
    E.area.material.uniforms.uOpacity.value = smooth(seg(t, 8.55, 8.95)) * (1 - smooth(seg(t, 12.15, 12.65)));
    E.area.material.uniforms.uTime.value = t;
    E.area.visible = E.area.material.uniforms.uOpacity.value > 0;
    // Riemann sums (midpoint rule), n = 4, 8, ..., 256
    const T0 = [7.45, 7.78, 8.06, 8.3, 8.5, 8.66], dur = 0.26;
    let Lv = 0; for (const s of T0) Lv += smooth(seg(t, s, s + dur));
    const lvl = Math.min(5, Math.floor(Lv)), fr = Lv >= 6 ? 1 : Lv - lvl;
    const np = 4 * 2 ** lvl, nc = np * 2;
    const gapF = 0.16;
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion();
    const boxA = smooth(seg(t, 6.95, 7.3)) * (1 - smooth(seg(t, 8.82, 9.1)));
    for (let j = 0; j < nc; j++) {
      const pi = j >> 1;
      const hP = f((pi + 0.5) / np), hC = f((j + 0.5) / nc);
      let h = lerp(hP, hC, ease.inOutCubic(fr));
      if (Lv < 0.001) h *= ease.outCubic(seg(t, 6.95 + pi * 0.06, 7.4 + pi * 0.06));
      const outerG = lerp(gapF / np, gapF / nc, fr), sibG = fr * gapF / nc;
      const x0 = j / nc, x1 = (j + 1) / nc;
      const gl = (j % 2 === 1 ? sibG : outerG) / 2, gr = (j % 2 === 0 ? sibG : outerG) / 2;
      const a = x0 + gl, b = x1 - gr;
      P((a + b) / 2, h / 2, 0, tmp);
      mtx.compose(tmp, q, tmp2.set(Math.max(1e-4, (b - a) * plot.S), Math.max(1e-4, h * plot.S), 2 * Math.max(D, 0.01) * 0.92));
      E.boxes.setMatrixAt(j, mtx);
    }
    E.boxes.count = nc;
    E.boxes.instanceMatrix.needsUpdate = true;
    E.boxes.material.uniforms.uOpacity.value = boxA * Math.pow(Math.max(1, (fr > 0.5 ? nc : np) / 8), -0.25);
    E.boxes.material.uniforms.uEdge.value = Math.pow(np / 4, -0.6);
    E.boxes.visible = boxA > 0;
    // equation + live sum
    E.eqInt.position.set(0, 4.15, 0.3); E.eqInt.face(camera, 0.9);
    revealPlane(E.eqInt, t, 6.95, 9.05, { dIn: 0.7 });
    const nShow = fr > 0.5 ? nc : np;
    let S = 0; for (let i = 0; i < nShow; i++) S += f((i + 0.5) / nShow) / nShow;
    E.sumLbl.setText(t > 8.9 ? '∞|1/3' : `${nShow}|${S.toFixed(5)}`);
    E.sumLbl.position.set(0.15, 2.95, 0.3); E.sumLbl.face(camera, 0.9);
    const sl = ease.outCubic(seg(t, 7.25, 7.6)) * (1 - smooth(seg(t, 9.25, 9.6)));
    E.sumLbl.u.uOpacity.value = sl; E.sumLbl.u.uReveal.value = 1; E.sumLbl.visible = sl > 0;
    const l01 = ease.outCubic(seg(t, 7.1, 7.5)) * (1 - smooth(seg(t, 8.4, 8.9)));
    P(0, -0.13, 0, E.lbl0.position); P(1, -0.13, 0, E.lbl1.position);
    for (const l of [E.lbl0, E.lbl1]) { l.face(camera); l.u.uOpacity.value = l01; l.u.uReveal.value = 1; l.visible = l01 > 0; }
  }

  // ---------------- PI
  {
    const e = ease.outCubic(seg(t, 9.55, 10.8));
    const g = ease.inOutCubic(seg(t, 9.55, 10.6));
    const out = ease.inCubic(seg(t, 11.95, 12.45));
    E.piA.position.set(0, 0, lerp(-2.5, 0, g) + out * 1.0);
    E.piA.rotation.set(0, lerp(-1.35, 0, g) + 0.12 * Math.sin((t - 10) * 0.8) * g, 0);
    E.piA.scale.setScalar(lerp(0.6, 1, g) * (1 + out * 0.15));
    E.piA.material.opacity = e * (1 - out);
    E.piA.material.envMapIntensity = 1.5 * lerp(0.2, 1, e);
    E.piA.material.emissiveIntensity = 0.06 + 0.22 * Math.exp(-Math.pow((t - 10.3) / 0.35, 2));
    E.piA.visible = E.piA.material.opacity > 0.002;
    E.piA.material.depthWrite = E.piA.material.opacity > 0.9;
    // digits spiral
    E.digits.u.uTime.value = t;
    E.digits.u.uOpacity.value = 1;
    E.digits.visible = t > 9.9;
    // ribbon reveal follows the stream of digits: find progress u where appear(u) = t
    let lo = 0, hi = 1;
    for (let it = 0; it < 24; it++) { const m = (lo + hi) / 2; if (E.ribbonAppear(m) < t) lo = m; else hi = m; }
    E.ribbon.u.uProgress.value = t < 10 ? 0 : lo;
    E.ribbon.u.uOpacity.value = 0.75 * smooth(seg(t, 10.0, 10.4));
    E.ribbon.visible = t > 10;
    // finale pi
    const fb = ease.outCubic(seg(t, 13.3, 14.1));
    E.piB.position.set(0, 1.75, ZF + lerp(-1.5, 0, fb));
    E.piB.rotation.set(0, lerp(0.9, 0, fb) + 0.06 * Math.sin(t * 1.2), 0);
    E.piB.scale.setScalar(lerp(0.65, 0.84, fb));
    E.piB.material.opacity = fb;
    E.piB.material.emissiveIntensity = 0.06 + 0.12 * Math.exp(-Math.pow((t - 13.9) / 0.3, 2));
    E.piB.visible = fb > 0.002;
    E.piB.material.depthWrite = fb > 0.9;
  }
  // ---------------- infinity trajectory
  {
    const cIn = seg(t, 12.6, 15);
    if (t > 12.5) {
      for (let c3 = 0; c3 < 3; c3++) {
        const pts = E.infPolys[c3];
        const scl = [1, 1.045, 0.955][c3], zo = [0, 0.08, -0.08][c3], ph = [0, 0.04, -0.04][c3];
        pts.forEach((p, i) => {
          const s = i / (pts.length - 1);
          const th = TAU * s + ph + t * 0.25;
          const sn = Math.sin(th), cs = Math.cos(th), den = 1 + sn * sn;
          const lem = V((2.3 * scl * cs) / den, (2.3 * scl * sn * cs) / den, zo + 0.18 * Math.sin(2 * th)).applyMatrix4(E.infMat);
          // source: a spiral wound around the flight axis
          const ang = s * TAU * 2.0 + c3 * 2.1 + t * 0.6;
          const rad = 3.4 - s * 0.6;
          const spi = V(rad * Math.cos(ang), -0.3 + rad * 1.25 * Math.sin(ang), ZF + 9 - s * 12);
          const k = ease.inOutCubic(seg(t, 12.7 + s * 0.35, 13.55 + s * 0.35));
          p.copy(spi).lerp(lem, k);
        });
        E.inf[c3].update([pts]);
        E.inf[c3].u.uProgress.value = ease.inOutSine(seg(t, 12.6 + c3 * 0.08, 13.5 + c3 * 0.08));
        E.inf[c3].u.uOpacity.value = smooth(cIn * 6);
        E.inf[c3].visible = true;
      }
    } else E.inf.forEach((l) => (l.visible = false));
  }
  // ---------------- finale typography
  animText3D(E.fin1, t, 13.62, null, { tr0: 1.1, tr1: 0.42, trDur: 1.3, stagger: 0.05, emis: 0.34 });
  animText3D(E.fin2, t, 13.85, null, { tr0: 0.6, tr1: 0.16, trDur: 1.2, stagger: 0.035, emis: 0.34 });
  E.fin1.visible = E.fin2.visible = t > 13.5;
}

// ------------------------------------------------------------------ frame rendering
const halton = (i, b) => { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; };
function renderAt(frame) {
  const tc = frame / FPS;
  {
    renderer.setRenderTarget(rtAccum);
    renderer.setClearColor(0x000000, 1);
    renderer.clear();
    for (let s = 0; s < SUB; s++) {
      const ts = SUB > 1 ? clamp(tc + (((s + 0.5) / SUB - 0.5) * SHUTTER) / FPS, 0, DUR - 1e-4) : tc;
      update(ts);
      if (SUB > 1) camera.setViewOffset(W, H, halton(s + 1, 2) - 0.5, halton(s + 1, 3) - 0.5, W, H); else camera.clearViewOffset();
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
  }
  bloom.render(renderer, null, rtAccum, 0, false);
  finalQuad.material.uniforms.uFade.value = (1 - ease.inOutSine(seg(tc, 14.4, 14.95)));
  renderer.setRenderTarget(null);
  finalQuad.render(renderer);
}

window.renderFrame = (i) => { renderAt(i); renderer.getContext().finish(); return true; };
window.grab = (type = 'image/png', q) => renderer.domElement.toDataURL(type, q);
window.META = { W, H, FPS, DUR, FRAMES, SUB };

build().then(() => {
  window.READY = true; window.E = E; window.SCENE = scene; // debug handles
  const t0 = Q.get('t');
  if (t0 != null) renderAt(Math.round(+t0 * FPS));
  if (Q.get('play')) {
    let fr = 0; const hud = document.getElementById('hud');
    const loop = () => { renderAt(fr); hud.textContent = (fr / FPS).toFixed(2) + 's'; fr = (fr + 1) % FRAMES; requestAnimationFrame(loop); };
    loop();
  }
}).catch((e) => { window.ERROR = String(e && e.stack || e); console.error(e); });
