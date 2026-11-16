// The digits of pi on an elliptical helix: one instanced draw call, glyphs from
// a texture atlas, camera-facing, with per-digit appearance timing and DoF.
import * as THREE from 'three';

const GLYPHS = '0123456789.';

function atlas() {
  const cell = 128, c = document.createElement('canvas');
  c.width = cell * GLYPHS.length; c.height = cell;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.font = '104px "KaTeX_Main"';
  [...GLYPHS].forEach((g, i) => ctx.fillText(g, i * cell + cell / 2, cell * 0.8));
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true; tex.anisotropy = 4;
  return tex;
}

const vert = /* glsl */`
  attribute vec3 aPos; attribute float aGlyph; attribute float aT; attribute float aIdx;
  uniform float uTime; uniform float uSize; uniform float uFocus; uniform float uAperture;
  varying vec2 vUv; varying float vA; varying float vLod; varying float vHead; varying float vIdx;
  void main(){
    float k = clamp((uTime - aT) / 0.35, 0.0, 1.0);
    float e = 1.0 - pow(1.0 - k, 3.0);
    vec4 mv = modelViewMatrix * vec4(aPos, 1.0);
    float sc = uSize * mix(1.6, 1.0, e);
    mv.xy += position.xy * vec2(sc * 0.78, sc);
    gl_Position = projectionMatrix * mv;
    float depth = -mv.z;
    float coc = uAperture * abs(depth - uFocus) / max(depth, 0.1);
    vLod = log2(1.0 + coc * 7.0) + (1.0 - e) * 3.0;
    vA = e * smoothstep(0.5, 2.2, depth);
    vHead = exp(-max(uTime - aT, 0.0) * 3.0) * step(aT, uTime);
    vUv = vec2((aGlyph + uv.x) / 11.0, uv.y);
    vIdx = aIdx;
  }`;
const frag = /* glsl */`
  uniform sampler2D uMap; uniform vec3 uC0; uniform vec3 uC1; uniform vec3 uC2; uniform float uOpacity; uniform float uCount;
  varying vec2 vUv; varying float vA; varying float vLod; varying float vHead; varying float vIdx;
  void main(){
    float a = texture2D(uMap, vUv, vLod).a;
    float f = vIdx / uCount;
    vec3 c = f < 0.5 ? mix(uC0, uC1, f * 2.0) : mix(uC1, uC2, f * 2.0 - 1.0);
    c *= 1.0 + vHead * 1.5;
    float alpha = a * vA * uOpacity / (1.0 + 0.3 * vLod);
    gl_FragColor = vec4(c * alpha, alpha);
  }`;

// Arc-length parameterised elliptical helix
export function helixPoints(n, { rx, ry, step, zStart, pitch, ang0 }) {
  const pts = [];
  let th = ang0, z = zStart;
  const dth = 0.002;
  let acc = 0;
  let prev = new THREE.Vector3(rx * Math.cos(th), ry * Math.sin(th), z);
  pts.push(prev.clone());
  while (pts.length < n) {
    th -= dth; // clockwise when seen from +z
    z -= (pitch * dth) / (Math.PI * 2);
    const p = new THREE.Vector3(rx * Math.cos(th), ry * Math.sin(th), z);
    acc += p.distanceTo(prev);
    prev = p;
    if (acc >= step) { pts.push(p.clone()); acc -= step; }
  }
  return pts;
}

export function makeDigits(str, pts, appearT, dof, palette) {
  const n = str.length;
  const base = new THREE.PlaneGeometry(1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index;
  g.setAttribute('position', base.attributes.position);
  g.setAttribute('uv', base.attributes.uv);
  const aPos = new Float32Array(n * 3), aGlyph = new Float32Array(n), aT = new Float32Array(n), aIdx = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    aPos.set([pts[i].x, pts[i].y, pts[i].z], i * 3);
    aGlyph[i] = GLYPHS.indexOf(str[i]);
    aT[i] = appearT(i);
    aIdx[i] = i;
  }
  g.setAttribute('aPos', new THREE.InstancedBufferAttribute(aPos, 3));
  g.setAttribute('aGlyph', new THREE.InstancedBufferAttribute(aGlyph, 1));
  g.setAttribute('aT', new THREE.InstancedBufferAttribute(aT, 1));
  g.setAttribute('aIdx', new THREE.InstancedBufferAttribute(aIdx, 1));
  g.instanceCount = n;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: atlas() }, uTime: { value: 0 }, uSize: { value: 0.34 }, uOpacity: { value: 1 }, uCount: { value: n },
      uC0: { value: palette.ivory.clone().multiplyScalar(1.0) },
      uC1: { value: palette.gold.clone().multiplyScalar(0.95) },
      uC2: { value: palette.blue.clone().multiplyScalar(1.1) },
      uFocus: dof.uFocus, uAperture: dof.uAperture,
    },
    vertexShader: vert, fragmentShader: frag,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.u = mat.uniforms;
  return mesh;
}
