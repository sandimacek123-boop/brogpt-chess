// GlowLine: screen-space ribbon lines with a soft gaussian core + halo profile,
// draw-on progress, perspective width, dashes and near-plane fade.
import * as THREE from 'three';

const vert = /* glsl */`
  attribute vec3 aPrev; attribute vec3 aNext; attribute float aSide; attribute float aU; attribute float aDist;
  uniform vec2 uRes; uniform float uWidth; uniform float uPersp; uniform float uRefDepth;
  varying float vSide; varying float vU; varying float vDist; varying float vDepth;
  vec2 toScreen(vec4 c){ return c.xy / max(c.w, 0.02) * uRes * 0.5; }
  void main(){
    mat4 mvp = projectionMatrix * modelViewMatrix;
    vec4 c = mvp * vec4(position, 1.0);
    vec4 p = mvp * vec4(aPrev, 1.0);
    vec4 n = mvp * vec4(aNext, 1.0);
    vec2 cs = toScreen(c), ps = toScreen(p), ns = toScreen(n);
    vec2 d1 = cs - ps, d2 = ns - cs;
    vec2 dir = length(d1) < 1e-4 ? d2 : (length(d2) < 1e-4 ? d1 : normalize(d1) + normalize(d2));
    dir = normalize(dir + vec2(1e-6, 0.0));
    vec2 nrm = vec2(-dir.y, dir.x);
    float w = uWidth;
    if (uPersp > 0.5) w *= clamp(uRefDepth / max(c.w, 0.05), 0.2, 3.0);
    c.xy += nrm * aSide * (w * 0.5) / (uRes * 0.5) * c.w;
    vSide = aSide; vU = aU; vDist = aDist; vDepth = c.w;
    gl_Position = c;
  }`;
const frag = /* glsl */`
  uniform vec3 uColor; uniform vec3 uColor2; uniform float uOpacity; uniform float uProgress; uniform float uStart;
  uniform float uCoreW; uniform float uHalo; uniform float uHead; uniform float uDash; uniform float uNear;
  uniform float uEndFade; uniform float uFocus; uniform float uAperture;
  varying float vSide; varying float vU; varying float vDist; varying float vDepth;
  void main(){
    if (vU > uProgress || vU < uStart) discard;
    float d = abs(vSide);
    float core = exp(-d * d / (2.0 * uCoreW * uCoreW));
    float halo = exp(-d * d / (2.0 * 0.42 * 0.42)) * uHalo;
    float coc = uAperture * abs(vDepth - uFocus) / max(vDepth, 0.1);
    float soft = 1.0 / (1.0 + coc * 4.0);
    float a = mix(halo + core * 0.25, core + halo, soft);
    float head = exp(-pow((uProgress - vU) / 0.025, 2.0)) * uHead * step(uProgress, 0.999);
    float m = 1.0;
    if (uDash > 0.0) m *= smoothstep(0.35, 0.5, abs(fract(vDist * uDash) - 0.5) * 2.0);
    if (uNear > 0.0) m *= smoothstep(uNear * 0.4, uNear, vDepth);
    if (uEndFade > 0.0) m *= smoothstep(0.0, uEndFade, vU) * smoothstep(0.0, uEndFade, 1.0 - vU);
    vec3 col = mix(uColor, uColor2, vU) * (1.0 + head * 3.0);
    float alpha = a * uOpacity * m;
    gl_FragColor = vec4(col * alpha, alpha);
  }`;

export class GlowLine extends THREE.Mesh {
  // polylines: array of arrays of THREE.Vector3 (fixed structure for updates)
  constructor(polylines, res, dof, o = {}) {
    const geo = new THREE.BufferGeometry();
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uRes: { value: res }, uWidth: { value: o.width ?? 3 }, uPersp: { value: o.persp ? 1 : 0 },
        uRefDepth: { value: o.refDepth ?? 10 },
        uColor: { value: (o.color || new THREE.Color(1, 1, 1)).clone() },
        uColor2: { value: (o.color2 || o.color || new THREE.Color(1, 1, 1)).clone() },
        uOpacity: { value: o.opacity ?? 1 }, uProgress: { value: 1 }, uStart: { value: 0 },
        uCoreW: { value: o.coreW ?? 0.16 }, uHalo: { value: o.halo ?? 0.35 }, uHead: { value: o.head ?? 0 },
        uDash: { value: o.dash ?? 0 }, uNear: { value: o.near ?? 0 }, uEndFade: { value: o.endFade ?? 0 },
        uFocus: dof.uFocus, uAperture: dof.uAperture,
      },
      vertexShader: vert, fragmentShader: frag,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    super(geo, mat);
    this.u = mat.uniforms;
    this.frustumCulled = false;
    this.build(polylines);
  }
  build(polylines) {
    const total = polylines.reduce((a, p) => a + p.length, 0);
    this.counts = polylines.map((p) => p.length);
    const g = this.geometry;
    const mk = (n) => new THREE.BufferAttribute(new Float32Array(total * 2 * n), n).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', mk(3));
    g.setAttribute('aPrev', mk(3));
    g.setAttribute('aNext', mk(3));
    g.setAttribute('aSide', mk(1));
    g.setAttribute('aU', mk(1));
    g.setAttribute('aDist', mk(1));
    const idx = [];
    let base = 0;
    for (const n of this.counts) {
      for (let i = 0; i < n - 1; i++) {
        const a = base + i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
      base += n * 2;
    }
    g.setIndex(idx);
    const side = g.attributes.aSide.array;
    for (let i = 0; i < total; i++) { side[i * 2] = -1; side[i * 2 + 1] = 1; }
    g.attributes.aSide.needsUpdate = true;
    this.update(polylines);
  }
  update(polylines) {
    const g = this.geometry;
    const P = g.attributes.position.array, A = g.attributes.aPrev.array, N = g.attributes.aNext.array;
    const U = g.attributes.aU.array, D = g.attributes.aDist.array;
    let v = 0;
    for (const pl of polylines) {
      const n = pl.length;
      let dist = 0;
      for (let i = 0; i < n; i++) {
        const c = pl[i], p = pl[Math.max(0, i - 1)], nx = pl[Math.min(n - 1, i + 1)];
        if (i > 0) dist += c.distanceTo(p);
        for (let s = 0; s < 2; s++) {
          const k = v * 3;
          P[k] = c.x; P[k + 1] = c.y; P[k + 2] = c.z;
          A[k] = p.x; A[k + 1] = p.y; A[k + 2] = p.z;
          N[k] = nx.x; N[k + 1] = nx.y; N[k + 2] = nx.z;
          U[v] = n > 1 ? i / (n - 1) : 0;
          D[v] = dist;
          v++;
        }
      }
    }
    for (const k of ['position', 'aPrev', 'aNext', 'aU', 'aDist']) g.attributes[k].needsUpdate = true;
  }
}

// Soft glowing dot (camera-facing sprite drawn with a shader)
export class GlowDot extends THREE.Mesh {
  constructor(size, color) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: color.clone() }, uOpacity: { value: 1 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv*2.0-1.0;
        vec4 mv = modelViewMatrix * vec4(0.0,0.0,0.0,1.0);
        mv.xy += position.xy * vec2(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz));
        gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv;
        void main(){ float r = dot(vUv,vUv); float a = exp(-r*28.0)*1.6 + exp(-r*5.0)*0.35;
        a *= uOpacity; gl_FragColor = vec4(uColor*a, a); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    super(new THREE.PlaneGeometry(size, size), mat);
    this.u = mat.uniforms;
    this.frustumCulled = false;
  }
}
