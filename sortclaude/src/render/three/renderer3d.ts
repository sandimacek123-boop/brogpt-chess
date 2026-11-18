import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { AfterimagePass } from 'three/examples/jsm/postprocessing/AfterimagePass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { RenderView } from '../view';
import { ColorLUT, paletteStops, hexToRgb } from '../palettes';
import type { Settings, Viz3D } from '../../state/settings';

export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export interface Render3DOptions {
  viz: Viz3D;
  appearance: Settings['appearance'];
  three: Settings['three'];
  sorting: Pick<Settings['sorting'], 'highlightCompare' | 'highlightSwap' | 'highlightPivot'>;
  reducedMotion: boolean;
  quality: number;
  particleLimit: number;
}

function hash01(x: number): number {
  let h = Math.imul(x ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

type GeoKind = 'box' | 'sphere' | 'octa' | 'points';

const KIND: Record<Viz3D, GeoKind> = {
  towers: 'box',
  helix: 'sphere',
  galaxy: 'points',
  torus: 'sphere',
  tunnel: 'box',
  vortex: 'sphere',
  columns: 'box',
  crystals: 'octa',
  orbit: 'sphere',
  rings3d: 'sphere',
};

export class Renderer3D {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private persp: THREE.PerspectiveCamera;
  private ortho: THREE.OrthographicCamera;
  private camera: THREE.Camera;
  private controls: OrbitControls | null = null;
  private composer: EffectComposer;
  private renderPass: RenderPass;
  private bloom: UnrealBloomPass;
  private after: AfterimagePass;
  private ambient = new THREE.AmbientLight(0xffffff, 0.5);
  private point = new THREE.PointLight(0xffffff, 1.2, 0, 0.6);
  private point2 = new THREE.PointLight(0xa855f7, 0.6, 0, 0.8);
  private mesh: THREE.InstancedMesh | null = null;
  private points: THREE.Points | null = null;
  private meshKey = '';
  private dummy = new THREE.Object3D();
  private color = new THREE.Color();
  private lut: ColorLUT | null = null;
  private lutKey = '';
  private sprite: THREE.Texture;
  private lastPreset = '';
  private width = 1;
  private height = 1;
  private ground: THREE.Mesh;
  private mark = new Uint8Array(0);

  constructor(canvas: HTMLCanvasElement | OffscreenCanvas, opts: { interactive: boolean; preserveDrawingBuffer?: boolean }) {
    this.renderer = new THREE.WebGLRenderer({ canvas: canvas as HTMLCanvasElement, antialias: true, alpha: false, preserveDrawingBuffer: !!opts.preserveDrawingBuffer, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x050509, 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.persp = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
    this.ortho = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 500);
    this.camera = this.persp;
    this.scene.fog = new THREE.FogExp2(0x050509, 0.018);
    this.scene.add(this.ambient, this.point, this.point2);
    this.point.position.set(6, 12, 10);
    this.point2.position.set(-10, 4, -8);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x07070c, roughness: 0.95, metalness: 0.0 });
    this.ground = new THREE.Mesh(new THREE.CircleGeometry(14, 64), groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.01;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
    if (opts.interactive && canvas instanceof HTMLCanvasElement) {
      this.controls = new OrbitControls(this.persp, canvas);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.08;
      this.controls.enablePan = true;
    }
    this.renderPass = new RenderPass(this.scene, this.camera);
    const rt = new THREE.WebGLRenderTarget(256, 256, { type: THREE.HalfFloatType });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(this.renderPass);
    this.after = new AfterimagePass(0);
    this.composer.addPass(this.after);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.8, 0.5, 0.2);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.sprite = makeSprite();
    this.setCameraPreset('iso', 'helix');
  }

  setSize(w: number, h: number, pixelRatio: number) {
    this.width = Math.max(1, w);
    this.height = Math.max(1, h);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(this.width, this.height, false);
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(this.width, this.height);
    this.persp.aspect = this.width / this.height;
    this.persp.updateProjectionMatrix();
    const a = this.width / this.height;
    const s = 9;
    this.ortho.left = -s * a;
    this.ortho.right = s * a;
    this.ortho.top = s;
    this.ortho.bottom = -s;
    this.ortho.updateProjectionMatrix();
  }

  resetCamera(preset: Settings['three']['cameraPreset'], viz: Viz3D) {
    this.setCameraPreset(preset, viz);
  }

  private setCameraPreset(preset: Settings['three']['cameraPreset'], viz: Viz3D) {
    const d = viz === 'tunnel' ? 6 : viz === 'galaxy' || viz === 'orbit' ? 17 : 16;
    const p: Record<string, [number, number, number]> = {
      front: [0, 4, d],
      top: [0, d * 1.1, 0.01],
      iso: [d * 0.62, d * 0.55, d * 0.72],
      side: [d, 3, 0],
    };
    const [x, y, z] = p[preset] ?? p.iso;
    for (const cam of [this.persp, this.ortho]) {
      cam.position.set(x, y, z);
      cam.lookAt(0, viz === 'towers' || viz === 'columns' ? 2.5 : 0, viz === 'tunnel' ? -12 : 0);
    }
    if (this.controls) {
      this.controls.target.set(0, viz === 'towers' || viz === 'columns' ? 2.5 : 0, viz === 'tunnel' ? -12 : 0);
      this.controls.update();
    }
    this.lastPreset = `${preset}:${viz}`;
  }

  private getLUT(a: Settings['appearance']): ColorLUT {
    const stops = paletteStops(a.palette, a.customGradient);
    const key = JSON.stringify([stops, a.interpolation]);
    if (key !== this.lutKey || !this.lut) {
      this.lut = new ColorLUT(stops, 256, a.palette === 'classic-rainbow' ? 'hsl' : a.interpolation);
      this.lutKey = key;
    }
    return this.lut;
  }

  private ensureObjects(kind: GeoKind, n: number, opt: Render3DOptions) {
    const usePoints = kind === 'points' || n > Math.min(opt.particleLimit, 30000);
    const key = `${usePoints ? 'points' : kind}:${n}`;
    if (key === this.meshKey) return usePoints;
    this.disposeObjects();
    this.meshKey = key;
    if (usePoints) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(Math.max(1, n) * 3), 3));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(Math.max(1, n) * 3), 3));
      const mat = new THREE.PointsMaterial({ size: 0.18, vertexColors: true, map: this.sprite, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
      this.points = new THREE.Points(geo, mat);
      this.points.frustumCulled = false;
      this.scene.add(this.points);
    } else {
      const geo = kind === 'box' ? new THREE.BoxGeometry(1, 1, 1) : kind === 'octa' ? new THREE.OctahedronGeometry(0.5, 0) : new THREE.IcosahedronGeometry(0.5, n > 4000 ? 0 : 1);
      if (kind === 'box') geo.translate(0, 0.5, 0);
      const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.15, emissive: 0x000000 });
      this.mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
      this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, n) * 3), 3);
      this.mesh.frustumCulled = false;
      this.mesh.castShadow = true;
      this.scene.add(this.mesh);
    }
    return usePoints;
  }

  private disposeObjects() {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      (this.mesh.material as THREE.Material).dispose();
      this.mesh.dispose();
      this.mesh = null;
    }
    if (this.points) {
      this.scene.remove(this.points);
      this.points.geometry.dispose();
      (this.points.material as THREE.Material).dispose();
      this.points = null;
    }
  }

  render(view: RenderView, opt: Render3DOptions) {
    const n = view.n;
    const t3 = opt.three;
    const presetKey = `${t3.cameraPreset}:${opt.viz}`;
    if (presetKey !== this.lastPreset) this.setCameraPreset(t3.cameraPreset, opt.viz);
    const wantOrtho = t3.orthographic;
    if ((this.camera === this.ortho) !== wantOrtho) {
      this.camera = wantOrtho ? this.ortho : this.persp;
      this.renderPass.camera = this.camera;
      if (this.controls) (this.controls as any).object = this.camera;
    }
    this.ambient.intensity = t3.ambient;
    this.point.intensity = t3.pointLight * 28;
    this.point2.intensity = t3.pointLight * 14;
    this.bloom.strength = opt.quality >= 0.5 ? t3.bloom * Math.max(0.2, opt.appearance.glow + 0.3) : 0;
    this.bloom.enabled = this.bloom.strength > 0.01;
    (this.after.uniforms as any).damp.value = Math.min(0.95, t3.trails);
    this.after.enabled = t3.trails > 0.01;
    this.renderer.shadowMap.enabled = t3.shadows && opt.quality >= 0.75;
    this.point.castShadow = this.renderer.shadowMap.enabled;
    this.ground.visible = opt.viz === 'towers' || opt.viz === 'columns';
    // hex strings are interpreted as sRGB (correct); raw RGB floats would be treated as linear
    this.renderer.setClearColor(new THREE.Color(opt.appearance.bgColor1), 1);
    (this.scene.fog as THREE.FogExp2).color.set(opt.appearance.bgColor1);

    if (this.controls) {
      this.controls.autoRotate = t3.autoRotate && !opt.reducedMotion;
      this.controls.autoRotateSpeed = t3.rotateSpeed * 2;
      this.controls.update();
    } else if (t3.autoRotate && !opt.reducedMotion) {
      // non-interactive (export): orbit deterministically with time
      const ang = view.time * t3.rotateSpeed * 0.2;
      const cam = this.camera as THREE.PerspectiveCamera;
      const r = Math.hypot(cam.position.x, cam.position.z);
      cam.position.x = Math.sin(ang + 0.7) * r;
      cam.position.z = Math.cos(ang + 0.7) * r;
      cam.lookAt(0, opt.viz === 'towers' || opt.viz === 'columns' ? 2.5 : 0, opt.viz === 'tunnel' ? -12 : 0);
    }

    const usePoints = this.ensureObjects(KIND[opt.viz], n, opt);
    const lut = this.getLUT(opt.appearance);
    const span = Math.max(1, view.maxKey - view.minKey);
    const time = opt.reducedMotion ? 0 : view.time;
    const size = opt.three.particleSize * opt.appearance.size;
    const fixed = opt.appearance.colorMode === 'fixed' ? hexToRgb(opt.appearance.fixedColor) : null;

    if (this.mark.length < n) this.mark = new Uint8Array(n);
    const mark = this.mark;
    if (opt.sorting.highlightCompare) for (const i of view.compare) if (i >= 0 && i < n) mark[i] = 1;
    if (opt.sorting.highlightSwap) for (const i of view.write) if (i >= 0 && i < n) mark[i] = 2;
    if (opt.sorting.highlightPivot && view.pivot >= 0 && view.pivot < n && !view.done) mark[view.pivot] = 3;

    const pos = new THREE.Vector3();
    let scaleX = 1;
    let scaleY = 1;
    let scaleZ = 1;
    const k = Math.max(1, Math.ceil(Math.sqrt(n)));
    const k3 = Math.max(1, Math.ceil(Math.cbrt(n)));
    const posAttr = usePoints ? (this.points!.geometry.getAttribute('position') as THREE.BufferAttribute) : null;
    const colAttr = usePoints ? (this.points!.geometry.getAttribute('color') as THREE.BufferAttribute) : null;
    const density = opt.three.density;
    const step = usePoints && density < 1 ? Math.max(1, Math.round(1 / density)) : 1;

    for (let i = 0; i < n; i++) {
      const id = view.ids[i];
      const v = (view.keys[id] - view.minKey) / span;
      const u = n > 1 ? i / (n - 1) : 0.5;
      const TAU = Math.PI * 2;
      switch (opt.viz) {
        case 'towers': {
          const W = 14;
          const bw = (W / n) * (1 - opt.appearance.spacing * 0.8);
          pos.set((u - 0.5) * W, 0, 0);
          scaleX = Math.max(0.01, bw);
          scaleY = 0.05 + v * 6.5;
          scaleZ = Math.max(0.01, Math.min(0.8, bw * 2));
          break;
        }
        case 'columns': {
          const gx = i % k;
          const gz = Math.floor(i / k);
          const cell = 12 / k;
          pos.set((gx - (k - 1) / 2) * cell, 0, (gz - (k - 1) / 2) * cell);
          scaleX = scaleZ = cell * 0.75;
          scaleY = 0.05 + v * 5 + Math.sin(time * 0.8 + i * 0.05) * 0.05;
          break;
        }
        case 'helix': {
          const turns = 4;
          const th = u * turns * TAU + time * 0.15;
          const strand = i % 2;
          const rr = 1.4 + v * 2.2;
          pos.set(Math.cos(th + strand * Math.PI) * rr, (u - 0.5) * 11, Math.sin(th + strand * Math.PI) * rr);
          scaleX = scaleY = scaleZ = Math.min(0.5, 6 / Math.sqrt(n + 4)) * size;
          break;
        }
        case 'galaxy': {
          // index = position along a spiral arm; (value − index) = displacement off the arm,
          // so an unsorted array is a diffuse cloud and a sorted one collapses into clean arms
          const arms = 3;
          const arm = i % arms;
          const along = 0.4 + u * 7;
          const off = (v - u) * 7;
          const rr = Math.max(0.15, along + off * 0.85);
          const th = along * 0.75 + (arm / arms) * TAU + time * 0.05 + off * 0.35 + (hash01(id) - 0.5) * 0.08;
          pos.set(Math.cos(th) * rr, (hash01(id * 7 + 3) - 0.5) * (0.25 + Math.abs(off) * 0.5), Math.sin(th) * rr);
          scaleX = scaleY = scaleZ = 0.25 * size;
          break;
        }
        case 'torus': {
          const R = 4.2;
          const r = 1.5;
          const a1 = u * TAU + time * 0.1;
          const a2 = v * TAU * 2;
          pos.set((R + r * Math.cos(a2)) * Math.cos(a1), r * Math.sin(a2), (R + r * Math.cos(a2)) * Math.sin(a1));
          scaleX = scaleY = scaleZ = Math.min(0.45, 7 / Math.sqrt(n + 4)) * size;
          break;
        }
        case 'tunnel': {
          const th = i * 2.399963 + time * 0.2;
          const rr = 1.2 + v * 3.2;
          pos.set(Math.cos(th) * rr, Math.sin(th) * rr, -u * 30 + ((time * 2) % 1));
          scaleX = scaleZ = Math.min(0.5, 8 / Math.sqrt(n + 4)) * size;
          scaleY = 0.15 + v * 0.6;
          break;
        }
        case 'vortex': {
          const th = u * 6 * Math.PI + time * 0.3;
          const rr = 0.4 + v * 4.6;
          pos.set(Math.cos(th) * rr, 5 - u * 10 + rr * 0.3, Math.sin(th) * rr);
          scaleX = scaleY = scaleZ = Math.min(0.45, 7 / Math.sqrt(n + 4)) * size;
          break;
        }
        case 'crystals': {
          const gx = i % k3;
          const gy = Math.floor(i / k3) % k3;
          const gz = Math.floor(i / (k3 * k3));
          const cell = 10 / k3;
          pos.set((gx - (k3 - 1) / 2) * cell, (gy - (k3 - 1) / 2) * cell, (gz - (k3 - 1) / 2) * cell);
          scaleX = scaleZ = cell * (0.2 + v * 0.75);
          scaleY = scaleX * 1.4;
          break;
        }
        case 'orbit': {
          const rr = 1 + v * 7;
          const th = u * TAU + time * (0.6 / Math.sqrt(rr));
          pos.set(Math.cos(th) * rr, Math.sin(u * TAU * 3) * 0.15, Math.sin(th) * rr);
          scaleX = scaleY = scaleZ = Math.min(0.4, 6 / Math.sqrt(n + 4)) * size;
          break;
        }
        case 'rings3d': {
          const layers = 5;
          const L = Math.min(layers - 1, Math.floor(u * layers));
          const startL = Math.floor((L * n) / layers);
          const endL = Math.floor(((L + 1) * n) / layers);
          const th = ((i - startL) / Math.max(1, endL - startL)) * TAU + time * 0.12 * (L % 2 ? -1 : 1);
          const rr = 1.8 + L * 1.1;
          pos.set(Math.cos(th) * rr, v * 5 - 2.5, Math.sin(th) * rr);
          scaleX = scaleY = scaleZ = Math.min(0.42, 6 / Math.sqrt(n + 4)) * size;
          break;
        }
      }
      // colour
      let cr: number;
      let cg: number;
      let cb: number;
      const m = mark[i];
      if (m === 1) [cr, cg, cb] = [1, 1, 1];
      else if (m === 2) [cr, cg, cb] = [0.96, 0.25, 0.74];
      else if (m === 3) [cr, cg, cb] = [0.98, 0.8, 0.08];
      else if (fixed) [cr, cg, cb] = [fixed[0] / 255, fixed[1] / 255, fixed[2] / 255];
      else {
        let t = v;
        if (opt.appearance.colorMode === 'index') t = u;
        else if (opt.appearance.colorMode === 'identity') t = n > 1 ? id / (n - 1) : 0;
        else if (opt.appearance.colorMode === 'rainbow-rotation') t = (v + time * 0.08) % 1;
        const b = lut.index(t);
        cr = lut.r[b] / 255;
        cg = lut.g[b] / 255;
        cb = lut.b[b] / 255;
      }
      mark[i] = 0;
      if (usePoints) {
        if (i % step !== 0) {
          posAttr!.setXYZ(i, 0, -999, 0);
          continue;
        }
        posAttr!.setXYZ(i, pos.x, pos.y + (KIND[opt.viz] === 'box' ? scaleY : 0), pos.z);
        this.color.setRGB(cr, cg, cb, THREE.SRGBColorSpace);
        colAttr!.setXYZ(i, this.color.r, this.color.g, this.color.b);
      } else {
        this.dummy.position.copy(pos);
        this.dummy.scale.set(scaleX, scaleY, scaleZ);
        if (opt.viz === 'crystals') this.dummy.rotation.set(0, time * 0.4 + i * 0.1, 0);
        else this.dummy.rotation.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.mesh!.setMatrixAt(i, this.dummy.matrix);
        this.color.setRGB(cr, cg, cb, THREE.SRGBColorSpace);
        this.mesh!.setColorAt(i, this.color);
      }
    }
    if (usePoints) {
      posAttr!.needsUpdate = true;
      colAttr!.needsUpdate = true;
      (this.points!.material as THREE.PointsMaterial).size = Math.max(0.03, Math.min(0.5, 12 / Math.sqrt(n + 16))) * size;
      this.points!.geometry.setDrawRange(0, n);
    } else if (this.mesh) {
      this.mesh.count = n;
      this.mesh.instanceMatrix.needsUpdate = true;
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    }
    // post-processing only when an effect needs it (saves a full-screen pass on integrated GPUs)
    if (this.bloom.enabled || this.after.enabled) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.disposeObjects();
    this.controls?.dispose();
    this.sprite.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    (this.ground.geometry as THREE.BufferGeometry).dispose();
    (this.ground.material as THREE.Material).dispose();
  }
}

function makeSprite(): THREE.Texture {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.7)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
