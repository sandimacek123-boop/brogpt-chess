// 3D asset construction: official REAL logo (extruded + drawable outline), extruded typography,
// official UI panels, particles, tunnel, grid, backdrops, emitters.
import * as THREE from 'three';
import { TTFLoader } from 'three/addons/loaders/TTFLoader.js';
import { Font } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { mulberry32 } from './anim.js';

export const COL = {
  black: new THREE.Color('#050509'),
  blue: new THREE.Color('#168BFF'),
  cyan: new THREE.Color('#00D9FF'),
  violet: new THREE.Color('#713BFF'),
  white: new THREE.Color('#FFFFFF'),
};

async function loadFont(url) {
  const buf = await (await fetch(url)).arrayBuffer();
  const l = new TTFLoader(); l.reversed = true; // CFF (OTF) outlines wind the other way
  return new Font(l.parse(buf));
}
function loadTex(url) {
  return new Promise((res, rej) => new THREE.TextureLoader().load(url, t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; res(t); }, undefined, rej));
}

// ------------------------------------------------------------------ environment (brand-tinted studio)
function makeEnv(renderer) {
  const s = new THREE.Scene();
  s.background = new THREE.Color(0x020205);
  const box = (w, h, color, intensity, pos, rot = [0, 0, 0]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(intensity), side: THREE.DoubleSide }));
    m.position.set(...pos); m.rotation.set(...rot); s.add(m);
  };
  box(14, 6, COL.white, 3.2, [0, 4, 9], [0.4, 0, 0]);          // big softbox behind camera, above
  box(3, 14, COL.blue, 4.0, [-9, 0, 2], [0, Math.PI / 2, 0]);  // blue strip left
  box(3, 14, COL.violet, 4.0, [9, 0, 2], [0, -Math.PI / 2, 0]); // violet strip right
  box(16, 1.2, COL.cyan, 2.0, [0, -6, 3], [-Math.PI / 2, 0, 0]); // cyan floor line
  box(6, 2, COL.white, 1.5, [0, 7, -6], [Math.PI / 2, 0, 0]);    // top back
  const pm = new THREE.PMREMGenerator(renderer);
  const env = pm.fromScene(s, 0.02).texture;
  pm.dispose();
  return env;
}

// ------------------------------------------------------------------ ribbon (drawable glowing line)
const RIBBON_VS = /* glsl */`
attribute float aS; attribute float aSide; attribute vec3 aN; attribute vec3 aRand;
uniform float uWidth, uProg, uScatter, uSpan;
varying float vS; varying float vSide; varying float vArr;
void main(){
  float arrive = clamp((uProg - aS * (1.0 - uSpan)) / uSpan, 0.0, 1.0);
  float e = 1.0 - pow(1.0 - arrive, 3.0);
  vec3 p = position + aN * aSide * uWidth * 0.5;
  p += aRand * (1.0 - e) * uScatter;
  vS = aS; vSide = aSide; vArr = arrive;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const RIBBON_FS = /* glsl */`
uniform vec3 uColor, uHead; uniform float uOpacity, uProg, uSpan;
varying float vS; varying float vSide; varying float vArr;
void main(){
  if (vArr <= 0.001) discard;
  float edge = 1.0 - smoothstep(0.35, 1.0, abs(vSide));
  float head = smoothstep(0.55, 0.95, vArr) * (1.0 - smoothstep(0.95, 1.0, vArr));
  vec3 c = mix(uColor, uHead, head);
  gl_FragColor = vec4(c * (0.6 + 2.5 * head) * edge * uOpacity * vArr, 1.0);
}`;

export function makeRibbon(points, closed, width, { color = COL.cyan, head = COL.white, scatter = 0, chunk = 6, seed = 1, intensity = 1 } = {}) {
  const rnd = mulberry32(seed);
  const n = points.length;
  const segs = closed ? n : n - 1;
  const len = [0];
  for (let i = 0; i < segs; i++) len.push(len[i] + points[i].distanceTo(points[(i + 1) % n]));
  const total = len[segs];
  const cnt = closed ? n + 1 : n;
  const pos = [], aN = [], aS = [], aSide = [], aRand = [], idx = [];
  let rv = new THREE.Vector3();
  for (let i = 0; i < cnt; i++) {
    const p = points[i % n];
    const prev = points[(i - 1 + n) % n], next = points[(i + 1) % n];
    const a = closed || i > 0 ? p.clone().sub(prev).normalize() : next.clone().sub(p).normalize();
    const b = closed || i < n - 1 ? next.clone().sub(p).normalize() : a.clone();
    const t = a.add(b).normalize();
    const nn = new THREE.Vector3(-t.y, t.x, 0);
    if (i % chunk === 0) rv = new THREE.Vector3(rnd() * 2 - 1, rnd() * 2 - 1, (rnd() * 2 - 1) * 1.5);
    for (const side of [-1, 1]) {
      pos.push(p.x, p.y, p.z); aN.push(nn.x, nn.y, nn.z); aS.push(len[i] / total); aSide.push(side);
      aRand.push(rv.x, rv.y, rv.z);
    }
  }
  for (let i = 0; i < cnt - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aN', new THREE.Float32BufferAttribute(aN, 3));
  g.setAttribute('aS', new THREE.Float32BufferAttribute(aS, 1));
  g.setAttribute('aSide', new THREE.Float32BufferAttribute(aSide, 1));
  g.setAttribute('aRand', new THREE.Float32BufferAttribute(aRand, 3));
  g.setIndex(idx);
  const m = new THREE.ShaderMaterial({
    vertexShader: RIBBON_VS, fragmentShader: RIBBON_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uWidth: { value: width }, uProg: { value: 1 }, uScatter: { value: scatter }, uSpan: { value: 0.3 },
      uColor: { value: color.clone().multiplyScalar(intensity) }, uHead: { value: head.clone().multiplyScalar(intensity * 1.5) }, uOpacity: { value: 1 } },
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  return mesh;
}

// ------------------------------------------------------------------ text
export class TypeKit {
  constructor(fonts, env) { this.fonts = fonts; this.env = env; this.cache = new Map(); }
  materials(tint = 0xffffff) {
    const front = new THREE.MeshStandardMaterial({ color: tint, metalness: 0.75, roughness: 0.18, envMap: this.env, envMapIntensity: 1.6, emissive: 0xffffff, emissiveIntensity: 0.12, transparent: true });
    const side = new THREE.MeshStandardMaterial({ color: 0x7f9dff, metalness: 1, roughness: 0.25, envMap: this.env, envMapIntensity: 2.0, emissive: 0x168bff, emissiveIntensity: 0.05, transparent: true });
    return [front, side];
  }
  glyph(fontKey, ch, size, depth, bevel) {
    const k = `${fontKey}|${ch}|${size}|${depth}|${bevel}`;
    if (!this.cache.has(k)) {
      const g = new TextGeometry(ch, { font: this.fonts[fontKey], size, depth, curveSegments: 8, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.55, bevelSegments: 3 });
      g.translate(0, 0, -depth / 2);
      this.cache.set(k, g);
    }
    return this.cache.get(k);
  }
  // returns { group, letters:[{pivot, mesh, x, w}], width, cap, mats }
  word(text, { font = 'black', size = 1, depth = 0.25, bevel = 0.02, tracking = 0.0, mats } = {}) {
    const F = this.fonts[font];
    const res = F.data.resolution, scale = size / res;
    const group = new THREE.Group();
    const M = mats || this.materials();
    const letters = [];
    let x = 0;
    for (const ch of text) {
      const gl = F.data.glyphs[ch] || F.data.glyphs['?'];
      const adv = gl.ha * scale;
      if (ch === ' ') { x += adv + tracking * size; continue; }
      const geo = this.glyph(font, ch, size, depth, bevel);
      geo.computeBoundingBox();
      const bb = geo.boundingBox;
      const cx = (bb.min.x + bb.max.x) / 2, cy = (bb.min.y + bb.max.y) / 2;
      const mesh = new THREE.Mesh(geo, M);
      mesh.position.set(-cx, -cy, 0);
      const pivot = new THREE.Group();
      pivot.add(mesh);
      pivot.userData.home = new THREE.Vector3(x + cx, cy, 0);
      pivot.position.copy(pivot.userData.home);
      group.add(pivot);
      letters.push({ pivot, mesh, x: x + cx, w: bb.max.x - bb.min.x, h: bb.max.y - bb.min.y });
      x += adv + tracking * size;
    }
    const width = x - tracking * size;
    const cap = (F.data.glyphs['H'] ? 0.727 : 0.7) * size;
    for (const l of letters) { l.pivot.userData.home.x -= width / 2; l.pivot.userData.home.y -= cap / 2; l.pivot.position.copy(l.pivot.userData.home); l.x -= width / 2; }
    return { group, letters, width, cap, mats: M };
  }
}

// ------------------------------------------------------------------ logo
export function makeLogo(logoData, env) {
  const shapes = logoData.shapes.map(flat => {
    const pts = []; for (let i = 0; i < flat.length; i += 2) pts.push(new THREE.Vector2(flat[i], flat[i + 1]));
    return new THREE.Shape(pts);
  });
  const depth = 0.3;
  const geo = new THREE.ExtrudeGeometry(shapes, { depth, bevelEnabled: true, bevelThickness: 0.045, bevelSize: 0.022, bevelSegments: 4, curveSegments: 1, steps: 1 });
  geo.translate(0, 0, -depth / 2);
  geo.computeVertexNormals();
  const front = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.8, roughness: 0.13, envMap: env, envMapIntensity: 1.8, emissive: 0xffffff, emissiveIntensity: 0.1, transparent: true });
  const side = new THREE.MeshStandardMaterial({ color: 0x8aa6ff, metalness: 1, roughness: 0.2, envMap: env, envMapIntensity: 2.2, emissive: 0x168bff, emissiveIntensity: 0.08, transparent: true });
  const mesh = new THREE.Mesh(geo, [front, side]);
  const group = new THREE.Group();
  group.add(mesh);
  // drawable outline ribbons (on the front face)
  const zf = depth / 2 + 0.05;
  const ribbons = logoData.shapes.map((flat, i) => {
    const pts = []; for (let k = 0; k < flat.length; k += 2) pts.push(new THREE.Vector3(flat[k], flat[k + 1], zf));
    const r = makeRibbon(pts, true, 0.016, { color: i % 2 ? COL.cyan : COL.blue, head: COL.white, scatter: 2.6, chunk: 5, seed: 11 + i * 7, intensity: 2.2 });
    group.add(r);
    return r;
  });
  return { group, mesh, front, side, ribbons, geo };
}

// small logo geometry for instancing (no bevel, cheap)
export function logoGeoSmall(logoData) {
  const shapes = logoData.shapes.map(flat => { const p = []; for (let i = 0; i < flat.length; i += 2) p.push(new THREE.Vector2(flat[i], flat[i + 1])); return new THREE.Shape(p); });
  const g = new THREE.ExtrudeGeometry(shapes, { depth: 0.2, bevelEnabled: false, curveSegments: 1 });
  g.translate(0, 0, -0.1);
  return g;
}

// ------------------------------------------------------------------ UI panel (official screenshots)
const PANEL_FS = /* glsl */`
uniform sampler2D map; uniform float uOpacity, uRadius, uAspect, uBright, uEdge, uUseAlpha; uniform vec3 uEdgeCol;
varying vec2 vUv;
float sdRound(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
void main(){
  vec4 t = texture2D(map, vUv);
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
  float d = sdRound(p, vec2(uAspect * 0.5, 0.5), uRadius);
  float aa = fwidth(d) * 1.5;
  float mask = 1.0 - smoothstep(-aa, aa, d);
  float rim = (1.0 - smoothstep(0.0, 0.012, abs(d))) * uEdge;
  float a = mask * mix(1.0, t.a, uUseAlpha);
  vec3 c = t.rgb * uBright * a + uEdgeCol * rim;
  gl_FragColor = vec4(c * uOpacity, a * uOpacity);
}`;
const PANEL_VS = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

export function makePanel(tex, height, { radius = 0.025, useAlpha = 0, edge = 0.6 } = {}) {
  const aspect = tex.image.width / tex.image.height;
  const m = new THREE.ShaderMaterial({
    vertexShader: PANEL_VS, fragmentShader: PANEL_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    uniforms: { map: { value: tex }, uOpacity: { value: 1 }, uRadius: { value: radius }, uAspect: { value: aspect }, uBright: { value: 1 }, uEdge: { value: edge }, uUseAlpha: { value: useAlpha }, uEdgeCol: { value: COL.blue.clone().multiplyScalar(2.5) } },
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(height * aspect, height), m);
  return mesh;
}

// ------------------------------------------------------------------ particles (dust / bokeh)
const DUST_VS = /* glsl */`
attribute vec4 aSeed; attribute vec3 aCol;
uniform float uTime, uFocus, uAperture, uSize, uScale, uSuck, uRise; uniform vec3 uBox, uCenter, uSuckC;
varying vec3 vCol; varying float vA; varying float vBokeh;
void main(){
  vec3 p = (aSeed.xyz - 0.5) * uBox + uCenter;
  float t = uTime / 60.0;
  p += vec3(sin(t * 0.7 + aSeed.w * 31.0), cos(t * 0.55 + aSeed.x * 47.0), sin(t * 0.45 + aSeed.y * 23.0)) * 0.3;
  p.y += mod(t * uRise * (0.4 + aSeed.w) + aSeed.y * uBox.y, uBox.y) - aSeed.y * uBox.y;
  float s = uSuck * (0.55 + 0.45 * aSeed.w);
  vec3 shell = uSuckC + normalize(aSeed.xyz - 0.5 + 1e-3) * (0.4 + 1.6 * aSeed.w);
  p = mix(p, shell, s * s * (3.0 - 2.0 * s));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float depth = max(-mv.z, 0.05);
  float px = uSize * (0.35 + 1.4 * aSeed.w * aSeed.w * aSeed.w) * uScale / depth;
  float coc = uAperture * abs(depth - uFocus) / depth;
  float size = clamp(px + coc, 1.5, 80.0);
  gl_PointSize = size;
  vA = clamp((px * px + 3.0) / (size * size), 0.025, 1.0) * smoothstep(0.3, 1.5, depth);
  vBokeh = clamp(coc / 14.0, 0.0, 1.0);
  vA *= 1.0 - 0.8 * clamp(uSuck, 0.0, 1.0);
  vCol = aCol;
  gl_Position = projectionMatrix * mv;
}`;
const DUST_FS = /* glsl */`
uniform float uOpacity; varying vec3 vCol; varying float vA; varying float vBokeh;
void main(){
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float core = 1.0 - smoothstep(0.0, 1.0, d);
  float disc = (1.0 - smoothstep(0.82, 1.0, d)) * (0.55 + 0.45 * smoothstep(0.5, 0.95, d));
  float a = mix(core * core, disc * 0.6, vBokeh);
  gl_FragColor = vec4(vCol * a * vA * uOpacity, 1.0);
}`;
export function makeDust(n = 1500, seed = 3) {
  const rnd = mulberry32(seed);
  const seeds = new Float32Array(n * 4), cols = new Float32Array(n * 3);
  const pal = [COL.blue, COL.cyan, COL.violet, COL.white, COL.blue];
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 4; k++) seeds[i * 4 + k] = rnd();
    const c = pal[Math.floor(rnd() * pal.length)].clone().multiplyScalar(0.25 + rnd() * 0.9);
    cols.set([c.r, c.g, c.b], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 4));
  g.setAttribute('aCol', new THREE.Float32BufferAttribute(cols, 3));
  const m = new THREE.ShaderMaterial({
    vertexShader: DUST_VS, fragmentShader: DUST_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uFocus: { value: 9 }, uAperture: { value: 14 }, uSize: { value: 0.02 }, uScale: { value: 1920 }, uSuck: { value: 0 }, uRise: { value: 0.15 },
      uBox: { value: new THREE.Vector3(14, 22, 26) }, uCenter: { value: new THREE.Vector3(0, 0, -4) }, uSuckC: { value: new THREE.Vector3() }, uOpacity: { value: 1 } },
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  return p;
}

// ------------------------------------------------------------------ tunnel streaks (velocity-stretched quads)
const STREAK_VS = /* glsl */`
attribute vec4 aP; // angle, radius, zBase, speed
attribute vec2 aQ; // along(0/1), side(-1/1)
attribute vec3 aCol; attribute float aLen; attribute float aW;
uniform float uCamZ, uTime, uL, uStretch, uOwn;
varying vec3 vCol; varying float vA; varying float vAlong;
void main(){
  float zb = aP.z + uTime * aP.w * uOwn;
  float d = mod(uCamZ - zb + 3.0, uL) - 3.0;
  float zw = uCamZ - d;
  vec2 dir = vec2(cos(aP.x), sin(aP.x));
  vec2 tan2 = vec2(-dir.y, dir.x);
  vec3 p = vec3(dir * aP.y + tan2 * aQ.y * aW, zw - aQ.x * aLen * uStretch);
  vCol = aCol; vAlong = aQ.x;
  vA = smoothstep(uL - 3.0, uL * 0.55, d) * smoothstep(-2.5, 1.5, d);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const STREAK_FS = /* glsl */`
uniform float uOpacity; varying vec3 vCol; varying float vA; varying float vAlong;
void main(){ gl_FragColor = vec4(vCol * vA * uOpacity * (1.0 - vAlong * 0.85), 1.0); }`;
export function makeStreaks(n = 700, seed = 5) {
  const rnd = mulberry32(seed);
  const P = [], Q = [], C = [], Lz = [], W = [], idx = [];
  const pal = [COL.cyan, COL.blue, COL.violet, COL.white];
  for (let i = 0; i < n; i++) {
    const ang = rnd() * Math.PI * 2, rad = 0.5 + Math.pow(rnd(), 0.6) * 3.6, zb = rnd() * 90, sp = 6 + rnd() * 30;
    const col = pal[Math.floor(rnd() * pal.length)].clone().multiplyScalar(1.2 + rnd() * 2.5);
    const len = 0.6 + rnd() * 2.8, w = 0.004 + rnd() * 0.012;
    for (const [al, sd] of [[0, -1], [0, 1], [1, -1], [1, 1]]) {
      P.push(ang, rad, zb, sp); Q.push(al, sd); C.push(col.r, col.g, col.b); Lz.push(len); W.push(w);
    }
    const b = i * 4; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 12), 3));
  g.setAttribute('aP', new THREE.Float32BufferAttribute(P, 4));
  g.setAttribute('aQ', new THREE.Float32BufferAttribute(Q, 2));
  g.setAttribute('aCol', new THREE.Float32BufferAttribute(C, 3));
  g.setAttribute('aLen', new THREE.Float32BufferAttribute(Lz, 1));
  g.setAttribute('aW', new THREE.Float32BufferAttribute(W, 1));
  g.setIndex(idx);
  const m = new THREE.ShaderMaterial({ vertexShader: STREAK_VS, fragmentShader: STREAK_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uCamZ: { value: 0 }, uTime: { value: 0 }, uL: { value: 90 }, uStretch: { value: 1 }, uOwn: { value: 0.0 }, uOpacity: { value: 1 } } });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  return mesh;
}

// ------------------------------------------------------------------ grid floor
const GRID_FS = /* glsl */`
uniform float uOpacity, uScroll, uPulse; uniform vec3 uColA, uColB;
varying vec3 vW;
void main(){
  vec2 g = vW.xz * 0.6 + vec2(0.0, uScroll);
  vec2 gr = abs(fract(g - 0.5) - 0.5) / fwidth(g);
  float line = 1.0 - min(min(gr.x, gr.y), 1.0);
  float dist = length(vW.xz - cameraPosition.xz);
  float fade = exp(-dist * 0.055) * smoothstep(0.5, 3.0, dist);
  vec3 c = mix(uColA, uColB, smoothstep(5.0, 30.0, dist));
  gl_FragColor = vec4(c * line * fade * (1.0 + uPulse) * uOpacity, 1.0);
}`;
export function makeGrid() {
  const m = new THREE.ShaderMaterial({
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: GRID_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uOpacity: { value: 1 }, uScroll: { value: 0 }, uPulse: { value: 0 }, uColA: { value: COL.blue.clone().multiplyScalar(1.6) }, uColB: { value: COL.violet.clone().multiplyScalar(1.4) } },
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), m);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

// ------------------------------------------------------------------ canvas helpers
export function radialTex(stops, size = 512) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) g.addColorStop(o, col);
  x.fillStyle = g; x.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export function wordTex(text, family, { w = 2048, h = 512, repeat = 3, color = '#ffffff', stroke = false } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, w, h);
  x.font = `900 ${h * 0.62}px ${family}`;
  x.textBaseline = 'middle'; x.textAlign = 'center';
  for (let i = 0; i < repeat; i++) {
    const cx = (i + 0.5) * w / repeat;
    if (stroke && i % 2) { x.strokeStyle = color; x.lineWidth = 6; x.strokeText(text, cx, h / 2); }
    else { x.fillStyle = color; x.fillText(text, cx, h / 2); }
  }
  x.fillStyle = color; x.fillRect(0, h * 0.06, w, 3); x.fillRect(0, h * 0.94, w, 3);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}

// ------------------------------------------------------------------ build everything
export async function buildWorld(renderer, base) {
  const [logoData, fontBlack, fontXB, fontRunde, tEditor, tHero, tHub, tAcc, tWave] = await Promise.all([
    fetch(base + 'src/logo.json').then(r => r.json()),
    loadFont(base + 'assets/fonts/InterDisplay-Black.otf'),
    loadFont(base + 'assets/fonts/InterDisplay-ExtraBold.otf'),
    loadFont(base + 'assets/fonts/OpenRunde-SemiBold.otf'),
    loadTex(base + 'assets/official/app-editor-window.webp'),
    loadTex(base + 'assets/official/hero-editor.webp'),
    loadTex(base + 'assets/official/script-hub-showcase.webp'),
    loadTex(base + 'assets/official/account-manager.webp'),
    loadTex(base + 'assets/official/background-wave.webp'),
  ]);
  // canvas-text font for tunnel typography
  const ff = new FontFace('InterBlack', `url(${base}assets/fonts/InterDisplay-Black.otf)`);
  await ff.load(); document.fonts.add(ff);

  const env = makeEnv(renderer);
  const W = { env, COL };
  W.scene = new THREE.Scene();
  W.scene.background = COL.black.clone().multiplyScalar(0.6);
  W.scene.fog = new THREE.FogExp2(0x050509, 0.0);
  W.camera = new THREE.PerspectiveCamera(45, 1080 / 1920, 0.05, 400);

  // lights
  W.amb = new THREE.AmbientLight(0xffffff, 0.15); W.scene.add(W.amb);
  W.key = new THREE.DirectionalLight(0xffffff, 1.6); W.key.position.set(3, 6, 8); W.scene.add(W.key);
  W.rimBlue = new THREE.PointLight(COL.blue, 60, 30, 2); W.rimBlue.position.set(-5, 2, -2); W.scene.add(W.rimBlue);
  W.rimViolet = new THREE.PointLight(COL.violet, 60, 30, 2); W.rimViolet.position.set(5, -1, -2); W.scene.add(W.rimViolet);
  W.sweep = new THREE.PointLight(0xffffff, 0, 6, 2); W.scene.add(W.sweep);

  // logo
  W.logo = makeLogo(logoData, env);
  W.scene.add(W.logo.group);
  W.halo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
    map: radialTex([[0, 'rgba(120,170,255,1)'], [0.25, 'rgba(60,110,255,0.55)'], [0.55, 'rgba(113,59,255,0.18)'], [1, 'rgba(0,0,0,0)']]),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffffff }));
  W.scene.add(W.halo);

  // backdrop: official dark wave background
  W.wave = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tWave, color: 0xffffff, transparent: true, depthWrite: false }));
  W.wave.scale.set(60, 60 * 9 / 16 * 1, 1);
  W.scene.add(W.wave);
  W.nebula = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
    map: radialTex([[0, 'rgba(40,90,255,0.9)'], [0.35, 'rgba(90,50,255,0.35)'], [0.7, 'rgba(20,10,60,0.08)'], [1, 'rgba(0,0,0,0)']]),
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  W.scene.add(W.nebula);

  // type
  W.type = new TypeKit({ black: fontBlack, xb: fontXB, runde: fontRunde }, env);
  const T = W.type;
  W.words = {
    REAL: T.word('REAL', { size: 0.93, depth: 0.3, bevel: 0.022, tracking: 0.04 }),
    PRECISION: T.word('PRECISION.', { size: 0.42, depth: 0.16, bevel: 0.012, tracking: 0.02 }),
    PERFORMANCE: T.word('PERFORMANCE.', { size: 0.315, depth: 0.16, bevel: 0.012, tracking: 0.0 }),
    UNC: T.word('UNC', { size: 0.98, depth: 0.42, bevel: 0.03, tracking: 0.02 }),
    SUNC: T.word('sUNC', { size: 0.76, depth: 0.38, bevel: 0.028, tracking: 0.01 }),
    STABILITY: T.word('STABILITY', { size: 0.42, depth: 0.22, bevel: 0.016, tracking: 0.0 }),
    ONEKEY: T.word('ONE KEY.', { size: 0.39, depth: 0.22, bevel: 0.016, tracking: 0.02 }),
    REALF: T.word('REAL.', { size: 0.71, depth: 0.26, bevel: 0.02, tracking: 0.05 }),
    BEYOND: T.word('BEYOND EXECUTION.', { font: 'runde', size: 0.168, depth: 0.03, bevel: 0.0, tracking: 0.16 }),
  };
  for (const w of Object.values(W.words)) W.scene.add(w.group);
  console.log('word widths', JSON.stringify(Object.fromEntries(Object.entries(W.words).map(([k, w]) => [k, +w.width.toFixed(2)]))));
  // motion-trail ghosts for PERFORMANCE. and sUNC
  const ghostMat = () => new THREE.MeshBasicMaterial({ color: COL.blue.clone().multiplyScalar(1.4), transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false });
  W.ghosts = {};
  for (const key of ['PERFORMANCE', 'SUNC', 'REALF']) {
    W.ghosts[key] = [];
    for (let i = 0; i < 6; i++) {
      const src = W.words[key];
      const m = ghostMat();
      const g = new THREE.Group();
      for (const l of src.letters) { const mm = new THREE.Mesh(l.mesh.geometry, m); mm.position.copy(l.mesh.position); const pv = new THREE.Group(); pv.position.copy(l.pivot.userData.home); pv.add(mm); g.add(pv); }
      g.userData.mat = m;
      W.scene.add(g);
      W.ghosts[key].push(g);
    }
  }

  // precision crosshair lines + keycap frame (ribbons)
  const line = (x0, x1, y) => makeRibbon([new THREE.Vector3(x0, y, 0), new THREE.Vector3(x1, y, 0)], false, 0.012, { color: COL.cyan, head: COL.white, intensity: 2.5 });
  W.precLines = [line(-1.95, 1.95, 0.34), line(1.95, -1.95, -0.34)];
  W.precLines.forEach(l => W.scene.add(l));
  {
    const pts = [], hw = 1.48, hh = 0.42, r = 0.14;
    const arc = (cx, cy, a0) => { for (let i = 0; i <= 8; i++) { const a = a0 + i / 8 * Math.PI / 2; pts.push(new THREE.Vector3(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0)); } };
    arc(hw - r, hh - r, 0); arc(-hw + r, hh - r, Math.PI / 2); arc(-hw + r, -hh + r, Math.PI); arc(hw - r, -hh + r, Math.PI * 1.5);
    const dense = [];
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; for (let k = 0; k < 6; k++) dense.push(a.clone().lerp(b, k / 6)); }
    W.keycap = makeRibbon(dense, true, 0.018, { color: COL.blue, head: COL.white, intensity: 2.6 });
    W.scene.add(W.keycap);
  }

  // official UI panels
  W.panels = {
    editor: makePanel(tEditor, 2.6, { useAlpha: 1, radius: 0.0, edge: 0.0 }),
    hero: makePanel(tHero, 2.4, { radius: 0.04, edge: 0.5 }),
    hub: makePanel(tHub, 2.4, { radius: 0.04, edge: 0.5 }),
    acc: makePanel(tAcc, 2.4, { radius: 0.04, edge: 0.5 }),
  };
  W.panelClones = [];
  for (const p of Object.values(W.panels)) W.scene.add(p);
  for (let i = 0; i < 6; i++) { const src = Object.values(W.panels)[i % 4]; const c = new THREE.Mesh(src.geometry, src.material.clone()); c.material.uniforms.map.value = src.material.uniforms.map.value; W.scene.add(c); W.panelClones.push(c); }

  // particles
  W.dust = makeDust(); W.scene.add(W.dust);
  W.streaks = makeStreaks(); W.scene.add(W.streaks);
  W.grid = makeGrid(); W.scene.add(W.grid);

  // tunnel
  W.tunnel = new THREE.Group(); W.scene.add(W.tunnel);
  W.rings = [];
  const ringMatA = new THREE.MeshBasicMaterial({ color: COL.cyan.clone().multiplyScalar(2.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const ringMatB = new THREE.MeshBasicMaterial({ color: COL.violet.clone().multiplyScalar(2.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const ringGeo = new THREE.TorusGeometry(3.3, 0.014, 6, 160);
  const bladeGeo = new THREE.BoxGeometry(0.02, 0.9, 0.02);
  for (let i = 0; i < 16; i++) {
    const g = new THREE.Group();
    const mat = i % 2 ? ringMatB : ringMatA;
    g.add(new THREE.Mesh(ringGeo, mat));
    const inner = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.006, 4, 120), mat); g.add(inner);
    for (let k = 0; k < 12; k++) {
      const b = new THREE.Mesh(bladeGeo, mat);
      const a = k / 12 * Math.PI * 2;
      b.position.set(Math.cos(a) * 2.95, Math.sin(a) * 2.95, 0); b.rotation.z = a - Math.PI / 2;
      g.add(b);
    }
    W.tunnel.add(g); W.rings.push(g);
  }
  W.ringMats = [ringMatA, ringMatB];
  const lg = logoGeoSmall(logoData);
  W.ringLogos = new THREE.InstancedMesh(lg, [W.logo.front.clone(), W.logo.side.clone()], 16 * 6);
  W.ringLogos.frustumCulled = false;
  W.tunnel.add(W.ringLogos);
  W.wallTex = wordTex('REAL', 'InterBlack', { repeat: 3, stroke: true });
  W.wall = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.6, 120, 64, 1, true), new THREE.MeshBasicMaterial({ map: W.wallTex, side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: COL.blue.clone().multiplyScalar(0.9) }));
  W.wall.rotation.x = Math.PI / 2;
  W.wallTex.repeat.set(-4, 10); // negative: reads correctly from inside the cylinder
  W.tunnel.add(W.wall);

  // shock rings (world-space emitters)
  W.shockRings = [];
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.97, 1.0, 128), new THREE.MeshBasicMaterial({ color: COL.cyan.clone().multiplyScalar(3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    W.scene.add(m); W.shockRings.push(m);
  }
  // accent light bars
  W.bars = [];
  const barGeo = new THREE.BoxGeometry(0.012, 0.012, 1);
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Mesh(barGeo, new THREE.MeshBasicMaterial({ color: (i % 3 === 0 ? COL.violet : i % 3 === 1 ? COL.cyan : COL.blue).clone().multiplyScalar(4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    W.scene.add(m); W.bars.push(m);
  }
  return W;
}
