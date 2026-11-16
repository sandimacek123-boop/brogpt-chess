// Typography: a tiny TeX-like layout engine that draws equations into canvas
// textures, a shader-driven text plane (wipe reveal + depth-of-field blur),
// and true 3D extruded lettering built from font outlines (opentype.js).
import * as THREE from 'three';
import opentype from 'opentype.js';

const FAM = {
  main: 'KaTeX_Main',
  math: 'KaTeX_Math',
  size2: 'KaTeX_Size2',
  size1: 'KaTeX_Size1',
  gar: 'Cormorant Garamond',
  inter: 'Inter',
};

// ---------------------------------------------------------------- layout boxes
const mctx = document.createElement('canvas').getContext('2d');
function fontStr(fam, px, style = '') {
  const weight = fam === 'gar' ? '600 ' : fam === 'inter' ? '300 ' : '';
  const italic = fam === 'math' ? 'italic ' : style;
  return `${italic}${weight}${px}px "${FAM[fam]}"`;
}

// All metrics are in em units of the base size; draw() receives px-per-em.
export const M = {
  t(str, fam = 'main', scale = 1, opt = {}) {
    mctx.font = fontStr(fam, 100);
    const m = mctx.measureText(str);
    const w = (m.width / 100) * scale + (opt.italicCorr || 0) * scale;
    return {
      w,
      asc: (opt.asc ?? Math.max(0.72, m.actualBoundingBoxAscent / 100)) * scale,
      desc: (opt.desc ?? Math.max(0.2, m.actualBoundingBoxDescent / 100)) * scale,
      draw(ctx, x, y, em) {
        ctx.font = fontStr(fam, em * scale);
        ctx.fillText(str, x * 1, y);
      },
    };
  },
  sp(w) { return { w, asc: 0, desc: 0, draw() {} }; },
  row(...items) {
    let w = 0, asc = 0, desc = 0;
    const pos = [];
    for (const b of items) { pos.push(w); w += b.w; asc = Math.max(asc, b.asc); desc = Math.max(desc, b.desc); }
    return {
      w, asc, desc,
      draw(ctx, x, y, em) { items.forEach((b, i) => b.draw(ctx, x + pos[i] * em, y, em)); },
    };
  },
  sup(base, exp, kern = 0.04, raise = 0.42) {
    return {
      w: base.w + kern + exp.w,
      asc: Math.max(base.asc, raise + exp.asc),
      desc: base.desc,
      draw(ctx, x, y, em) {
        base.draw(ctx, x, y, em);
        exp.draw(ctx, x + (base.w + kern) * em, y - raise * em, em);
      },
    };
  },
  sub(base, s, kern = 0.0, drop = 0.2) {
    return {
      w: base.w + kern + s.w,
      asc: base.asc,
      desc: Math.max(base.desc, drop + s.desc),
      draw(ctx, x, y, em) {
        base.draw(ctx, x, y, em);
        s.draw(ctx, x + (base.w + kern) * em, y + drop * em, em);
      },
    };
  },
  frac(num, den, pad = 0.12) {
    const w = Math.max(num.w, den.w) + pad * 2;
    const axis = 0.25, gap = 0.14, rule = 0.045;
    return {
      w,
      asc: axis + gap + num.desc + num.asc,
      desc: -axis + gap + den.asc + den.desc,
      draw(ctx, x, y, em) {
        num.draw(ctx, x + ((w - num.w) / 2) * em, y - (axis + gap + num.desc) * em, em);
        den.draw(ctx, x + ((w - den.w) / 2) * em, y - (axis - gap - den.asc) * em, em);
        ctx.fillRect(x + 0.04 * em, y - (axis + rule / 2) * em, (w - 0.08) * em, rule * em);
      },
    };
  },
  // display integral with limits (TeX display style, limits beside the sign)
  int(lo, hi) {
    const sign = M.t('∫', 'size2', 1, { asc: 1.36, desc: 0.86 });
    return {
      w: sign.w + Math.max(lo.w + 0.05, hi.w + 0.42) + 0.14,
      asc: 1.62, desc: 1.22,
      draw(ctx, x, y, em) {
        sign.draw(ctx, x, y, em);
        hi.draw(ctx, x + (sign.w + 0.4) * em, y - 1.2 * em, em);
        lo.draw(ctx, x + (sign.w + 0.02) * em, y + 1.02 * em, em);
      },
    };
  },
};

// Draw a box into a texture. Returns {texture, w, h} with world size for emWorld.
export function equationTexture(box, { emPx = 150, emWorld = 0.5, padEm = 0.35 } = {}) {
  const wPx = Math.ceil((box.w + padEm * 2) * emPx);
  const hPx = Math.ceil((box.asc + box.desc + padEm * 2) * emPx);
  const c = document.createElement('canvas');
  c.width = wPx; c.height = hPx;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'alphabetic';
  box.draw(ctx, padEm * emPx, (padEm + box.asc) * emPx, emPx);
  const tex = new THREE.CanvasTexture(c);
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  return { texture: tex, canvas: c, ctx, w: (wPx / emPx) * emWorld, h: (hPx / emPx) * emWorld, emPx, padEm, box };
}

// ---------------------------------------------------------------- text plane
export function makeDofUniforms() {
  return { uFocus: { value: 10 }, uAperture: { value: 0 } };
}

const textVert = /* glsl */`
  varying vec2 vUv; varying float vDepth;
  void main(){
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position,1.0);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;
const textFrag = /* glsl */`
  uniform sampler2D uMap; uniform vec3 uColor; uniform float uOpacity;
  uniform float uReveal; uniform float uSoft; uniform float uBlur; uniform float uGlow;
  uniform float uHead; uniform float uFocus; uniform float uAperture; uniform vec3 uColor2;
  varying vec2 vUv; varying float vDepth;
  void main(){
    float coc = uAperture * abs(vDepth - uFocus) / max(vDepth, 0.1);
    float lod = uBlur + log2(1.0 + coc * 6.0);
    float a = texture2D(uMap, vUv, lod).a;
    float g = texture2D(uMap, vUv, lod + 3.5).a;
    float r = uReveal * (1.0 + uSoft);
    float m = clamp((r - vUv.x) / uSoft, 0.0, 1.0);
    m = m * m * (3.0 - 2.0 * m);
    float head = exp(-pow((vUv.x - (r - uSoft * 0.6)) / (uSoft * 0.35 + 1e-4), 2.0)) * uHead * step(uReveal, 0.999);
    vec3 c = mix(uColor, uColor2, vUv.x);
    float blurFade = 1.0 / (1.0 + 0.35 * max(lod, 0.0));
    float alpha = (a * (1.0 + head * 2.5) + g * uGlow) * m * uOpacity * blurFade;
    gl_FragColor = vec4(c * alpha, alpha);
  }`;

export class TextPlane extends THREE.Mesh {
  constructor(eq, dof, { color = new THREE.Color(1, 1, 1), color2 = null, glow = 0.35 } = {}) {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: eq.texture }, uColor: { value: color.clone() }, uColor2: { value: (color2 || color).clone() },
        uOpacity: { value: 0 }, uReveal: { value: 1 }, uSoft: { value: 0.18 }, uBlur: { value: 0 },
        uGlow: { value: glow }, uHead: { value: 0 },
        uFocus: dof.uFocus, uAperture: dof.uAperture,
      },
      vertexShader: textVert, fragmentShader: textFrag,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    super(new THREE.PlaneGeometry(eq.w, eq.h), mat);
    this.eq = eq;
    this.u = mat.uniforms;
    this.frustumCulled = false;
  }
  // face the camera, optionally keeping some of its own yaw for parallax depth
  face(camera, amount = 1) {
    const q = camera.quaternion;
    if (amount >= 1) this.quaternion.copy(q);
    else this.quaternion.identity().slerp(q, amount);
  }
}

// A label whose text changes over time (re-rendered only when the string changes)
export class DynamicLabel extends TextPlane {
  constructor(builder, sample, dof, opts = {}) {
    const box = builder(sample);
    const eq = equationTexture(box, opts.tex);
    super(eq, dof, opts);
    this.builder = builder; this.key = null; this.texOpts = opts.tex || {};
  }
  setText(s) {
    if (s === this.key) return;
    this.key = s;
    const eq = this.eq, ctx = eq.ctx;
    const box = this.builder(s);
    ctx.clearRect(0, 0, eq.canvas.width, eq.canvas.height);
    ctx.fillStyle = '#fff';
    // left aligned within the fixed canvas
    box.draw(ctx, eq.padEm * eq.emPx, (eq.padEm + eq.box.asc) * eq.emPx, eq.emPx);
    eq.texture.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- 3D lettering
const fontCache = {};
export async function loadOT(url) {
  if (!fontCache[url]) fontCache[url] = await opentype.load(url);
  return fontCache[url];
}

function glyphShapes(font, glyph, scale) {
  const sp = new THREE.ShapePath();
  for (const c of glyph.path.commands) {
    switch (c.type) {
      case 'M': sp.moveTo(c.x * scale, c.y * scale); break;
      case 'L': sp.lineTo(c.x * scale, c.y * scale); break;
      case 'Q': sp.quadraticCurveTo(c.x1 * scale, c.y1 * scale, c.x * scale, c.y * scale); break;
      case 'C': sp.bezierCurveTo(c.x1 * scale, c.y1 * scale, c.x2 * scale, c.y2 * scale, c.x * scale, c.y * scale); break;
      case 'Z': if (sp.currentPath) sp.currentPath.closePath(); break;
    }
  }
  // Robust hole detection by containment depth (independent of contour winding)
  const polys = sp.subPaths.map((sub) => ({ sub, pts: sub.getPoints(16) })).filter((p) => p.pts.length > 2);
  const inside = (pt, poly) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a.y > pt.y) !== (b.y > pt.y) && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) c = !c;
    }
    return c;
  };
  polys.forEach((p) => { p.parents = polys.filter((q) => q !== p && inside(p.pts[0], q.pts)); p.depth = p.parents.length; });
  const shapes = [];
  for (const p of polys.filter((p) => p.depth % 2 === 0)) {
    const shape = new THREE.Shape(p.pts);
    for (const h of polys.filter((h) => h.depth === p.depth + 1 && h.parents.includes(p))) shape.holes.push(new THREE.Path(h.pts));
    shapes.push(shape);
  }
  return shapes;
}

export function extrudeGlyph(font, ch, size, { depth = 0.05, bevel = 0.008, bevelSeg = 2, curveSeg = 10 } = {}) {
  const glyph = font.charToGlyph(ch);
  const scale = size / font.unitsPerEm;
  const shapes = glyphShapes(font, glyph, scale);
  const geo = new THREE.ExtrudeGeometry(shapes, {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.8,
    bevelSegments: bevelSeg, curveSegments: curveSeg,
  });
  return { geo, advance: glyph.advanceWidth * scale };
}

// A line of individually animatable extruded letters, centred at the origin.
export class Text3D extends THREE.Group {
  constructor(font, str, { size = 0.5, depth = 0.05, bevel = 0.008, makeMaterial, tracking = 0 } = {}) {
    super();
    this.letters = [];
    const capH = size * 0.63;
    for (const ch of str) {
      if (ch === ' ') { this.letters.push({ space: true, advance: size * 0.25 }); continue; }
      const { geo, advance } = extrudeGlyph(font, ch, size, { depth, bevel });
      geo.translate(-advance / 2, -capH / 2, -depth / 2);
      const mat = makeMaterial();
      const mesh = new THREE.Mesh(geo, mat);
      const pivot = new THREE.Group();
      pivot.add(mesh);
      this.add(pivot);
      this.letters.push({ pivot, mesh, mat, advance });
    }
    this.size = size;
    this.setTracking(tracking);
  }
  get glyphs() { return this.letters.filter((l) => !l.space); }
  setTracking(tr) {
    const adv = this.letters.map((l) => l.advance + tr * this.size);
    const total = adv.reduce((a, b) => a + b, 0) - tr * this.size;
    let x = -total / 2;
    this.letters.forEach((l, i) => { l.baseX = x + l.advance / 2; x += adv[i]; });
    this.width = total;
  }
}
