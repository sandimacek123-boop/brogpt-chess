// Post pipeline: sub-frame accumulation (motion blur + AA), HDR bloom, anamorphic streaks,
// and the impact-frame compositor (B/W, ink, negative, shockwave, RGB split, speed lines, glitch).
import * as THREE from 'three';

const VS = /* glsl */`
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const COMMON = /* glsl */`
varying vec2 vUv;
float hash11(float p){ p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y); }
float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
`;

const ACCUM_FS = /* glsl */`
uniform sampler2D tSrc; uniform float uW; varying vec2 vUv;
void main(){ gl_FragColor = texture2D(tSrc, vUv) * uW; }`;

// Jimenez 13-tap downsample (+ optional soft-knee threshold on the first pass)
const DOWN_FS = /* glsl */`
uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThresh; uniform float uKnee; uniform float uPrefilter;
varying vec2 vUv;
vec3 S(vec2 o){ return texture2D(tSrc, vUv + o * uTexel).rgb; }
void main(){
  vec3 a=S(vec2(-2,2)), b=S(vec2(0,2)), c=S(vec2(2,2));
  vec3 d=S(vec2(-2,0)), e=S(vec2(0,0)), f=S(vec2(2,0));
  vec3 g=S(vec2(-2,-2)), h=S(vec2(0,-2)), i=S(vec2(2,-2));
  vec3 j=S(vec2(-1,1)), k=S(vec2(1,1)), l=S(vec2(-1,-1)), m=S(vec2(1,-1));
  vec3 col = e*0.125 + (a+c+g+i)*0.03125 + (b+d+f+h)*0.0625 + (j+k+l+m)*0.125;
  if (uPrefilter > 0.5) {
    col = min(col, vec3(12.0));
    float br = max(col.r, max(col.g, col.b));
    float soft = clamp(br - uThresh + uKnee, 0.0, 2.0 * uKnee);
    soft = soft * soft / (4.0 * uKnee + 1e-4);
    col *= max(soft, br - uThresh) / max(br, 1e-4);
  }
  gl_FragColor = vec4(col, 1.0);
}`;

const UP_FS = /* glsl */`
uniform sampler2D tSmall; uniform sampler2D tCur; uniform vec2 uTexel; uniform float uRadius; uniform float uScatter;
varying vec2 vUv;
void main(){
  vec2 o = uTexel * uRadius;
  vec3 s = texture2D(tSmall, vUv).rgb * 4.0;
  s += (texture2D(tSmall, vUv + vec2(-o.x, 0.)).rgb + texture2D(tSmall, vUv + vec2(o.x, 0.)).rgb + texture2D(tSmall, vUv + vec2(0., -o.y)).rgb + texture2D(tSmall, vUv + vec2(0., o.y)).rgb) * 2.0;
  s += texture2D(tSmall, vUv + vec2(-o.x, -o.y)).rgb + texture2D(tSmall, vUv + vec2(o.x, -o.y)).rgb + texture2D(tSmall, vUv + vec2(-o.x, o.y)).rgb + texture2D(tSmall, vUv + o).rgb;
  gl_FragColor = vec4(texture2D(tCur, vUv).rgb + s / 16.0 * uScatter, 1.0);
}`;

const STREAK_FS = /* glsl */`
uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uStep; uniform float uFalloff;
varying vec2 vUv;
void main(){
  vec3 c = vec3(0.0); float wsum = 0.0;
  for (int i = -6; i <= 6; i++) {
    float w = exp(-abs(float(i)) * uFalloff);
    c += texture2D(tSrc, vUv + vec2(float(i) * uStep * uTexel.x, 0.0)).rgb * w; wsum += w;
  }
  gl_FragColor = vec4(c / wsum, 1.0);
}`;

const GOD_FS = /* glsl */`
uniform sampler2D tSrc; uniform vec2 uC; uniform float uDecay;
varying vec2 vUv;
float h(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main(){
  vec2 d = (uC - vUv) / 40.0; vec2 q = vUv + d * h(gl_FragCoord.xy); float w = 1.0; vec3 g = vec3(0.0);
  for (int i = 0; i < 40; i++) { q += d; g += min(texture2D(tSrc, q).rgb, vec3(0.9)) * w; w *= uDecay; }
  gl_FragColor = vec4(g / 40.0, 1.0);
}`;

const COMP_FS = /* glsl */`
uniform sampler2D tScene, tBloom, tStreak, tGod;
uniform float uTaps;
uniform vec4 uGlowA, uGlowB; uniform vec3 uGlowACol, uGlowBCol;
uniform vec2 uRes; uniform float uFrame;
uniform float uZoom; uniform vec2 uZoomC; uniform vec2 uDir;
uniform float uChroma; uniform vec2 uSplit;
uniform vec4 uShock; uniform float uShockW;
uniform float uLens, uGlitch;
uniform float uBW, uInk, uNeg, uBWThresh, uInkThresh;
uniform float uSpeed, uSpeedMode, uSpeedSeed, uSpeedInner, uSpeedDensity; uniform vec2 uSpeedC, uSpeedDir;
uniform float uExposure, uFade, uSat, uVig, uGrain, uFlash, uContrast;
uniform float uBloomAmt, uStreakAmt; uniform vec3 uStreakTint;
uniform float uGod; uniform vec2 uGodC;
uniform vec3 uLift, uGain;
${COMMON}
vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
float sceneLum(vec2 uv){ return luma(toSRGB(aces(texture2D(tScene, uv).rgb * uExposure))); }

float speedLines(vec2 uv, vec2 asp){
  vec2 p = (uv - uSpeedC) * asp;
  float seed = uSpeedSeed;
  if (uSpeedMode < 0.5) {
    // radial manga focus lines: thin near the focus, wide & tapered at the frame edge
    float r = length(p);
    float a = atan(p.y, p.x) / 6.2831853 + 0.5;
    float n = a * uSpeedDensity;
    float id = floor(n); float fr = fract(n);
    float h1 = hash11(id * 1.37 + seed * 17.13), h2 = hash11(id * 7.91 + seed * 3.7), h3 = hash11(id * 3.33 + seed * 9.1);
    float on = step(0.38, h1);
    float inner = uSpeedInner * (0.75 + 0.7 * h2);
    float grow = clamp((r - inner) / 0.9, 0.0, 1.0);
    float w = (0.08 + 0.85 * h3 * h3) * grow;
    float line = on * (1.0 - smoothstep(w * 0.6, w, abs(fr - 0.5) * 2.0));
    return line * smoothstep(inner, inner + 0.12, r);
  } else {
    // directional lines matching the camera motion
    vec2 d = normalize(uSpeedDir); vec2 nrm = vec2(-d.y, d.x);
    float across = dot(p, nrm) * uSpeedDensity * 0.6;
    float along = dot(p, d);
    float id = floor(across); float fr = fract(across);
    float h1 = hash11(id * 1.7 + seed * 5.3), h2 = hash11(id * 4.1 + seed * 2.9), h3 = hash11(id * 9.7 + seed);
    float on = step(0.55, h1);
    float segm = fract(along * (0.35 + h2 * 0.5) + h3);
    float len = 0.25 + 0.6 * h2;
    float w = 0.1 + 0.4 * h3;
    float line = on * step(segm, len) * (1.0 - smoothstep(w * 0.5, w, abs(fr - 0.5) * 2.0));
    float centerFade = smoothstep(0.08, 0.45, abs(dot(p, nrm)) + 0.1);
    return line * centerFade;
  }
}

void main(){
  vec2 uv = vUv;
  vec2 asp = vec2(uRes.x / uRes.y, 1.0);
  // --- digital glitch: horizontal slice displacement
  if (uGlitch > 0.0) {
    float fstep = floor(uFrame * 0.5);
    float band = floor(uv.y * 36.0 + hash11(fstep) * 9.0);
    float h = hash11(band * 1.31 + fstep * 13.1);
    if (h < 0.18 + 0.35 * uGlitch) uv.x += (hash11(band * 7.7 + fstep) - 0.5) * 0.22 * uGlitch;
    float band2 = floor(uv.y * 140.0);
    uv.x += (hash11(band2 + fstep * 3.0) - 0.5) * 0.012 * uGlitch;
  }
  // --- lens distortion (barrel / pincushion)
  vec2 lp = (uv - 0.5) * asp; float r2 = dot(lp, lp);
  uv = 0.5 + lp * (1.0 + uLens * r2) / asp;
  // --- shockwave: radial refraction ring
  vec2 sp = (uv - uShock.xy) * asp; float sd = length(sp);
  float ring = sd - uShock.z;
  float sw = exp(-ring * ring / (uShockW * uShockW));
  vec2 sdir = sd > 1e-4 ? sp / sd : vec2(0.0);
  vec2 shockOff = sdir * uShock.w * sw * (ring / uShockW) / asp;
  uv -= shockOff;
  float shockCA = abs(uShock.w) * sw * 6.0;

  // --- blur gather: zoom (radial) + directional + chromatic/RGB split
  vec3 col = vec3(0.0);
  float ca = uChroma + shockCA;
  bool blur = (uZoom > 0.0005) || (dot(uDir, uDir) > 1e-7);
  const int NT = 24;
  int taps = blur ? int(uTaps) : 1;
  float jit = hash12(gl_FragCoord.xy + fract(uFrame * 0.618) * 100.0);
  for (int i = 0; i < NT; i++) {
    if (i >= taps) break;
    float t = blur ? (float(i) + jit) / float(taps) : 0.0;
    vec2 cuv = uv - (uv - uZoomC) * uZoom * t + uDir * (t - 0.5);
    vec2 cd = (cuv - 0.5) * ca * 0.012;
    float rr = texture2D(tScene, cuv + cd + uSplit).r;
    float gg = texture2D(tScene, cuv).g;
    float bb = texture2D(tScene, cuv - cd - uSplit).b;
    col += vec3(rr, gg, bb);
  }
  col /= float(taps);
  col += sw * abs(uShock.w) * vec3(0.6, 0.85, 1.2) * 3.0;

  // --- bloom + anamorphic streak + god rays
  vec2 buv = uv;
  col += texture2D(tBloom, buv).rgb * uBloomAmt;
  col += texture2D(tStreak, buv).rgb * uStreakAmt * uStreakTint;
  if (uGod > 0.0) col += texture2D(tGod, buv).rgb * uGod;
  // volumetric glows (halo behind the logo, nebula) — analytic, cheap
  if (uGlowA.w > 0.0) { float d = length((uv - uGlowA.xy) * asp) / uGlowA.z; col += uGlowACol * uGlowA.w * (exp(-d * d * 5.0) * 0.8 + exp(-d * 2.2) * 0.2); }
  if (uGlowB.w > 0.0) { float d = length((uv - uGlowB.xy) * asp) / uGlowB.z; col += uGlowBCol * uGlowB.w * (exp(-d * d * 4.0) * 0.75 + exp(-d * 1.6) * 0.25); }

  // --- speed lines (additive in normal mode)
  float sl = 0.0;
  if (uSpeed > 0.0) sl = speedLines(vUv, asp) * uSpeed;
  col += vec3(sl) * 1.2 * (1.0 - max(uBW, uInk));

  // --- tone map + grade
  col *= uExposure;
  col = aces(col);
  col = toSRGB(col);
  col = (col - 0.5) * uContrast + 0.5;
  float L = luma(col);
  col = mix(vec3(L), col, uSat);
  col = clamp(col, 0.0, 1.0);
  col = col * uGain + uLift * (1.0 - col);

  // --- impact frames
  if (uBW > 0.0 || uInk > 0.0) {
    vec2 px = 1.0 / uRes;
    vec2 iuv = uv;
    if (uInk > 0.0) iuv += (vec2(vnoise(uv * 180.0 + uFrame), vnoise(uv * 180.0 - uFrame)) - 0.5) * px * 3.0; // brush wobble
    float c0 = sceneLum(iuv);
    float tl = sceneLum(iuv + px * vec2(-2, 2)), tr = sceneLum(iuv + px * vec2(2, 2));
    float bl = sceneLum(iuv + px * vec2(-2, -2)), br = sceneLum(iuv + px * vec2(2, -2));
    float tc = sceneLum(iuv + px * vec2(0, 2)), bc = sceneLum(iuv + px * vec2(0, -2));
    float lc = sceneLum(iuv + px * vec2(-2, 0)), rc = sceneLum(iuv + px * vec2(2, 0));
    float gx = (tr + 2.0 * rc + br) - (tl + 2.0 * lc + bl);
    float gy = (tl + 2.0 * tc + tr) - (bl + 2.0 * bc + br);
    float edge = smoothstep(0.18, 0.5, sqrt(gx * gx + gy * gy));
    float slines = speedLines(vUv, asp);
    if (uBW > 0.0) {
      // hard monochrome: subject white, world black, white focus lines, black contour cuts
      float s = smoothstep(uBWThresh - 0.03, uBWThresh + 0.03, c0);
      float g = s * (1.0 - edge * 0.85);
      g = max(g, slines * (1.0 - s));
      g = max(g, smoothstep(0.08, 0.2, c0) * 0.18 * (1.0 - s)); // faint world hint
      col = mix(col, vec3(g), uBW);
    }
    if (uInk > 0.0) {
      // manga ink: paper white, inked silhouette, white highlight cuts, black focus lines
      float paperN = 0.94 + 0.04 * vnoise(vUv * uRes * 0.35) + 0.02 * vnoise(vUv * 40.0);
      vec3 paper = vec3(paperN, paperN, paperN * 0.985);
      // subject = solid black ink, white inner rim, black outer contour
      float sil = smoothstep(uInkThresh - 0.04, uInkThresh + 0.04, c0);
      float rim = edge * sil;
      float ink = max(sil, edge * (1.0 - sil));
      ink = max(ink, slines * (1.0 - sil));
      vec3 ic = mix(paper, vec3(0.015, 0.015, 0.03), ink);
      ic = mix(ic, paper, rim * 0.9);
      // screentone dots in the mid tones
      float tone = smoothstep(0.1, 0.35, c0) * (1.0 - sil);
      vec2 g = fract(gl_FragCoord.xy / 7.0) - 0.5;
      float dots = 1.0 - smoothstep(0.18, 0.26, length(g) / max(tone, 0.001) * 0.35);
      ic = mix(ic, vec3(0.05), dots * tone * 0.85);
      col = mix(col, ic, uInk);
    }
  }
  if (uNeg > 0.0) {
    vec3 n = 1.0 - col;
    float nl = luma(n);
    n = mix(vec3(nl), n, 0.35) * vec3(0.92, 0.97, 1.06);
    col = mix(col, n, uNeg);
  }

  // --- finishing: flash, vignette, grain, fade, dither
  col += uFlash;
  vec2 vp = (vUv - 0.5) * vec2(1.0, 0.85);
  col *= 1.0 - uVig * smoothstep(0.25, 0.85, length(vp) * 1.25);
  float gr = hash12(gl_FragCoord.xy * 1.03 + fract(uFrame * 0.7131) * 517.0) - 0.5;
  col += gr * uGrain;
  col *= 1.0 - uFade;
  col += (hash12(gl_FragCoord.xy + 7.0) - 0.5) / 255.0;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

export const POST_DEFAULTS = () => ({
  S: 5, shutter: 0.5,
  zoom: 0, zoomC: [0.5, 0.5], dir: [0, 0],
  chroma: 0.15, split: [0, 0],
  shock: [0.5, 0.5, 0, 0], shockW: 0.06,
  lens: 0, glitch: 0,
  bw: 0, ink: 0, neg: 0, bwThresh: 0.42, inkThresh: 0.45,
  speed: 0, speedMode: 0, speedSeed: 0, speedInner: 0.28, speedDensity: 180, speedC: [0.5, 0.5], speedDir: [1, 0],
  exposure: 1.0, fade: 0, sat: 1.05, vig: 0.55, grain: 0.035, flash: 0, contrast: 1.06,
  bloom: 0.5, streak: 0.3, streakTint: [0.35, 0.65, 1.4],
  god: 0, godC: [0.5, 0.5], godDecay: 0.955,
  glowA: [0.5, 0.5, 0.3, 0], glowACol: [0.19, 0.42, 1.0], glowB: [0.5, 0.5, 0.6, 0], glowBCol: [0.12, 0.08, 1.0],
  lift: [0.012, 0.012, 0.03], gain: [1.0, 1.0, 1.0],
  bloomThresh: 1.2, bloomKnee: 0.6,
});

export class Post {
  constructor(renderer, W, H) {
    this.r = renderer; this.W = W; this.H = H;
    const opt = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
    this.rtScene = new THREE.WebGLRenderTarget(W, H, { ...opt, depthBuffer: true });
    this.rtAccum = new THREE.WebGLRenderTarget(W, H, opt);
    this.down = []; this.up = [];
    let w = W, h = H;
    for (let i = 0; i < 6; i++) {
      w = Math.max(1, Math.round(w / 2)); h = Math.max(1, Math.round(h / 2));
      this.down.push(new THREE.WebGLRenderTarget(w, h, opt));
      this.up.push(new THREE.WebGLRenderTarget(w, h, opt));
    }
    this.rtGod = new THREE.WebGLRenderTarget(this.down[0].width, this.down[0].height, opt);
    this.streakA = new THREE.WebGLRenderTarget(this.down[1].width, this.down[1].height, opt);
    this.streakB = new THREE.WebGLRenderTarget(this.down[1].width, this.down[1].height, opt);

    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.scene = new THREE.Scene();
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);

    const mk = (fs, uniforms, extra = {}) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false, ...extra });
    this.mAccum = mk(ACCUM_FS, { tSrc: { value: null }, uW: { value: 1 } }, {
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation,
      blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor, transparent: true,
    });
    this.mDown = mk(DOWN_FS, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThresh: { value: 1 }, uKnee: { value: 0.5 }, uPrefilter: { value: 0 } });
    this.mUp = mk(UP_FS, { tSmall: { value: null }, tCur: { value: null }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 1 }, uScatter: { value: 0.65 } });
    this.mStreak = mk(STREAK_FS, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uStep: { value: 1 }, uFalloff: { value: 0.3 } });
    this.mGod = mk(GOD_FS, { tSrc: { value: null }, uC: { value: new THREE.Vector2() }, uDecay: { value: 0.955 } });
    const U = {};
    for (const k of ['uZoom', 'uChroma', 'uShockW', 'uLens', 'uGlitch', 'uBW', 'uInk', 'uNeg', 'uBWThresh', 'uInkThresh', 'uSpeed', 'uSpeedMode', 'uSpeedSeed', 'uSpeedInner', 'uSpeedDensity',
      'uExposure', 'uFade', 'uSat', 'uVig', 'uGrain', 'uFlash', 'uContrast', 'uBloomAmt', 'uStreakAmt', 'uGod', 'uFrame', 'uTaps']) U[k] = { value: 0 };
    for (const k of ['uGlowA', 'uGlowB']) U[k] = { value: new THREE.Vector4() };
    for (const k of ['uGlowACol', 'uGlowBCol']) U[k] = { value: new THREE.Vector3() };
    for (const k of ['uZoomC', 'uDir', 'uSplit', 'uSpeedC', 'uSpeedDir', 'uGodC', 'uRes']) U[k] = { value: new THREE.Vector2() };
    for (const k of ['uLift', 'uGain', 'uStreakTint']) U[k] = { value: new THREE.Vector3() };
    U.uShock = { value: new THREE.Vector4() };
    U.tScene = { value: null }; U.tBloom = { value: null }; U.tStreak = { value: null }; U.tGod = { value: null };
    this.mComp = mk(COMP_FS, U);
  }

  pass(mat, target) {
    this.quad.material = mat;
    this.r.setRenderTarget(target);
    this.r.render(this.scene, this.cam);
  }

  beginAccum() {
    this.r.setRenderTarget(this.rtAccum);
    this.r.setClearColor(0x000000, 0);
    this.r.clear(true, false, false);
  }
  addSample(weight) {
    this.mAccum.uniforms.tSrc.value = this.rtScene.texture;
    this.mAccum.uniforms.uW.value = weight;
    const ac = this.r.autoClear; this.r.autoClear = false;
    this.pass(this.mAccum, this.rtAccum);
    this.r.autoClear = ac;
  }

  bloom(P) {
    let src = this.rtAccum;
    for (let i = 0; i < this.down.length; i++) {
      const u = this.mDown.uniforms;
      u.tSrc.value = src.texture;
      u.uTexel.value.set(1 / src.width, 1 / src.height);
      u.uPrefilter.value = i === 0 ? 1 : 0;
      u.uThresh.value = P.bloomThresh; u.uKnee.value = P.bloomKnee;
      this.pass(this.mDown, this.down[i]);
      src = this.down[i];
    }
    let small = this.down[this.down.length - 1];
    for (let i = this.down.length - 2; i >= 0; i--) {
      const u = this.mUp.uniforms;
      u.tSmall.value = small.texture; u.tCur.value = this.down[i].texture;
      u.uTexel.value.set(1 / small.width, 1 / small.height); u.uRadius.value = 1.0;
      this.pass(this.mUp, this.up[i]);
      small = this.up[i];
    }
    // anamorphic streak from the 1/4 res level
    const s = this.mStreak.uniforms;
    let a = this.down[1], steps = [1.5, 4.5, 13.5];
    const tgt = [this.streakA, this.streakB, this.streakA];
    for (let i = 0; i < 3; i++) {
      s.tSrc.value = a.texture; s.uTexel.value.set(1 / a.width, 1 / a.height); s.uStep.value = steps[i]; s.uFalloff.value = 0.25;
      this.pass(this.mStreak, tgt[i]);
      a = tgt[i];
    }
    this.streakOut = a;
    if (P.god > 0) {
      const g = this.mGod.uniforms; g.tSrc.value = this.up[0].texture; g.uC.value.set(...P.godC); g.uDecay.value = P.godDecay;
      this.pass(this.mGod, this.rtGod);
    }
  }

  composite(P, frame) {
    const U = this.mComp.uniforms;
    U.tScene.value = this.rtAccum.texture;
    U.tBloom.value = this.up[0].texture;
    U.tStreak.value = this.streakOut.texture;
    U.uRes.value.set(this.W, this.H);
    U.uFrame.value = frame;
    U.uZoom.value = P.zoom; U.uZoomC.value.set(...P.zoomC); U.uDir.value.set(...P.dir);
    U.uChroma.value = P.chroma; U.uSplit.value.set(...P.split);
    U.uShock.value.set(...P.shock); U.uShockW.value = P.shockW;
    U.uLens.value = P.lens; U.uGlitch.value = P.glitch;
    U.uBW.value = P.bw; U.uInk.value = P.ink; U.uNeg.value = P.neg; U.uBWThresh.value = P.bwThresh; U.uInkThresh.value = P.inkThresh;
    U.uSpeed.value = P.speed; U.uSpeedMode.value = P.speedMode; U.uSpeedSeed.value = P.speedSeed; U.uSpeedInner.value = P.speedInner;
    U.uSpeedDensity.value = P.speedDensity; U.uSpeedC.value.set(...P.speedC); U.uSpeedDir.value.set(...P.speedDir);
    U.uExposure.value = P.exposure; U.uFade.value = P.fade; U.uSat.value = P.sat; U.uVig.value = P.vig; U.uGrain.value = P.grain;
    U.uFlash.value = P.flash; U.uContrast.value = P.contrast;
    U.uBloomAmt.value = P.bloom; U.uStreakAmt.value = P.streak; U.uStreakTint.value.set(...P.streakTint);
    U.uGod.value = P.god; U.uGodC.value.set(...P.godC);
    U.uLift.value.set(...P.lift); U.uGain.value.set(...P.gain);
    U.tGod.value = this.rtGod.texture;
    U.uGlowA.value.set(...P.glowA); U.uGlowB.value.set(...P.glowB); U.uGlowACol.value.set(...P.glowACol); U.uGlowBCol.value.set(...P.glowBCol);
    // adaptive blur taps from the blur length in pixels
    const lenPx = Math.max(P.zoom * 0.7 * this.H, Math.hypot(P.dir[0] * this.W, P.dir[1] * this.H));
    U.uTaps.value = Math.min(24, Math.max(6, Math.ceil(lenPx / 5)));
    this.pass(this.mComp, null);
  }
}
