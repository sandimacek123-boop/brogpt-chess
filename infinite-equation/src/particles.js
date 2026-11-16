// GPU particle field. Every position is a pure function of time computed in the
// vertex shader from static seeded attributes -> perfectly deterministic.
import * as THREE from 'three';
import { rng } from './util.js';

const vert = /* glsl */`
  attribute vec3 aAmb; attribute vec4 aSeed; attribute vec3 aCol;
  uniform float uTime; uniform float uViewH; uniform float uTanHalf;
  uniform float uFocus; uniform float uAperture; uniform float uRingR; uniform float uIntro;
  uniform float uGlobal; uniform mat4 uInfMat; uniform float uInfA;
  varying vec3 vCol; varying float vAlpha; varying float vSharp;
  float sat(float x){ return clamp(x,0.0,1.0); }
  float eio(float x){ x = sat(x); return x < 0.5 ? 4.0*x*x*x : 1.0 - pow(-2.0*x+2.0,3.0)/2.0; }
  void main(){
    float t = uTime;
    float s0 = aSeed.x, s1 = aSeed.y, s2 = aSeed.z, s3 = aSeed.w;
    // ambient drift (slow, smooth)
    vec3 amb = aAmb + vec3(sin(t*0.35 + s0*40.0), cos(t*0.29 + s1*40.0), sin(t*0.23 + s2*40.0)) * 0.18;
    vec3 p = amb;
    float bright = 0.55;
    // --- phase A/B: converge onto the circle, then release outwards (ring subset)
    float isRing = step(s3, 0.42);
    if (isRing > 0.5) {
      float ang = s0 * 6.2831853;
      float thick = mix(0.6, 0.035, eio((t - 0.2) / 1.7));
      vec3 ring = vec3(cos(ang), sin(ang), 0.0) * (uRingR + (s1 - 0.5) * thick) + vec3(0.0, 0.0, (s2 - 0.5) * thick);
      float c = eio((t - 0.05 - s1 * 0.6) / 1.1);
      float r = eio((t - 2.0 - s2 * 0.6) / 1.5);
      float w = c * (1.0 - r);
      p = mix(amb, ring, w);
      bright = mix(1.1, 1.5, w);
    }
    // --- phase F: flow into the infinity trajectory
    float isInf = step(s3, 0.55);
    if (isInf > 0.5 && uInfA > 0.0) {
      float k = eio((uInfA - s1 * 0.35) / 0.65);
      float ph = s0 * 6.2831853 + t * (0.9 + s2 * 0.5);
      float sn = sin(ph), cs = cos(ph);
      float den = 1.0 + sn * sn;
      vec3 lem = vec3(2.3 * cs / den, 2.3 * sn * cs / den, 0.0);
      vec3 jit = (vec3(s1, s2, fract(s0*7.0)) - 0.5) * 0.16;
      vec3 q = (uInfMat * vec4(lem + jit, 1.0)).xyz;
      p = mix(p, q, k);
      bright = mix(bright, 1.4, k);
    }
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float depth = -mv.z;
    gl_Position = projectionMatrix * mv;
    float proj = uViewH / (2.0 * uTanHalf);
    float base = (0.018 + s2 * 0.03) * proj / max(depth, 0.2);
    float coc = uAperture * abs(depth - uFocus) / max(depth, 0.2) * uViewH * 0.03;
    float size = max(base, 1.2) + coc;
    gl_PointSize = min(size, 90.0);
    float energy = (max(base, 1.2) * max(base, 1.2)) / (size * size);
    float twinkle = 0.75 + 0.25 * sin(t * (1.0 + s1 * 2.0) + s0 * 50.0);
    vAlpha = bright * energy * twinkle * uGlobal * smoothstep(0.15, 1.2, depth) * uIntro;
    vSharp = sat(base / size);
    vCol = aCol;
  }`;
const frag = /* glsl */`
  varying vec3 vCol; varying float vAlpha; varying float vSharp;
  void main(){
    vec2 d = gl_PointCoord * 2.0 - 1.0;
    float r = dot(d, d);
    if (r > 1.0) discard;
    float sharpA = exp(-r * 6.0);
    float bokeh = smoothstep(1.0, 0.82, r) * (0.55 + 0.45 * r);
    float a = mix(bokeh, sharpA, vSharp) * vAlpha;
    gl_FragColor = vec4(vCol * a, a);
  }`;

export function makeParticles(count, palette, dof, viewH) {
  const R = rng(1234);
  const amb = new Float32Array(count * 3), seed = new Float32Array(count * 4), colr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    let x, y, z;
    const s3 = R();
    if (i < count * 0.5) { // shell around the opening composition
      const u = R() * 2 - 1, th = R() * Math.PI * 2, rad = 3.5 + R() * 9;
      const sq = Math.sqrt(1 - u * u);
      x = rad * sq * Math.cos(th); y = rad * u * 1.4; z = rad * sq * Math.sin(th) - 2;
    } else { // dust filling the long tunnel towards the finale
      x = (R() * 2 - 1) * 9; y = (R() * 2 - 1) * 12; z = 8 - R() * 62;
    }
    amb.set([x, y, z], i * 3);
    seed.set([R(), R(), R(), s3], i * 4);
    const pick = R();
    const c = pick < 0.6 ? palette.gold : pick < 0.85 ? palette.ivory : palette.blue;
    colr.set([c.r, c.g, c.b], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  g.setAttribute('aAmb', new THREE.BufferAttribute(amb, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  g.setAttribute('aCol', new THREE.BufferAttribute(colr, 3));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uViewH: { value: viewH }, uTanHalf: { value: Math.tan((50 * Math.PI) / 360) },
      uFocus: dof.uFocus, uAperture: dof.uAperture, uRingR: { value: 2.2 }, uIntro: { value: 0 },
      uGlobal: { value: 1 }, uInfMat: { value: new THREE.Matrix4() }, uInfA: { value: 0 },
    },
    vertexShader: vert, fragmentShader: frag,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.u = mat.uniforms;
  return pts;
}
