import * as THREE from 'three';
import type { Frame, RenderOpts } from './renderer';
import { HL_COMPARE, HL_SWAP, HL_WRITE } from '../engine/player';

/**
 * WebGL renderer for the 3D modes. Renders into its own canvas, which the main 2D
 * canvas composites with drawImage — so recording and glow work identically for 3D.
 */
export class Three3D {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 200);
  private group = new THREE.Group();
  private mesh: THREE.InstancedMesh | null = null;
  private meshKey = '';
  private dummy = new THREE.Object3D();
  private color = new THREE.Color();
  private lut: Float32Array = new Float32Array(0);
  private lutPalette: string[] | null = null;
  private hl = { c: new THREE.Color(), s: new THREE.Color(), w: new THREE.Color(), ok: new THREE.Color(), bad: new THREE.Color() };
  private dirs: Float32Array = new Float32Array(0);

  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: false });
    this.renderer.setPixelRatio(1);
    this.scene.add(this.group);
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(4, 10, 8);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x88aaff, 0.6);
    rim.position.set(-6, 3, -6);
    this.scene.add(rim);
  }

  private ensureMesh(mode: 'bars3d' | 'sphere3d', n: number) {
    const key = `${mode}:${n}`;
    if (this.meshKey === key && this.mesh) return this.mesh;
    if (this.mesh) {
      this.group.remove(this.mesh);
      this.mesh.geometry.dispose();
      (this.mesh.material as THREE.Material).dispose();
    }
    const geo = mode === 'bars3d' ? new THREE.BoxGeometry(1, 1, 1) : new THREE.IcosahedronGeometry(1, 1);
    if (mode === 'bars3d') geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, n) * 3), 3);
    mesh.count = n;
    this.group.add(mesh);
    this.mesh = mesh;
    this.meshKey = key;
    if (mode === 'sphere3d') {
      this.dirs = new Float32Array(n * 3);
      const golden = Math.PI * (3 - Math.sqrt(5));
      for (let i = 0; i < n; i++) {
        const y = n === 1 ? 0 : 1 - (i / (n - 1)) * 2;
        const r = Math.sqrt(1 - y * y);
        const th = golden * i;
        this.dirs[i * 3] = Math.cos(th) * r;
        this.dirs[i * 3 + 1] = -y;
        this.dirs[i * 3 + 2] = Math.sin(th) * r;
      }
    }
    return mesh;
  }

  private ensureLut(o: RenderOpts) {
    if (this.lutPalette === o.palette) return;
    this.lutPalette = o.palette;
    this.lut = new Float32Array(o.palette.length * 3);
    for (let v = 0; v < o.palette.length; v++) {
      this.color.setStyle(o.palette[v]);
      this.lut[v * 3] = this.color.r;
      this.lut[v * 3 + 1] = this.color.g;
      this.lut[v * 3 + 2] = this.color.b;
    }
    this.hl.c.setStyle(o.compareColor);
    this.hl.s.setStyle(o.swapColor);
    this.hl.w.setStyle(o.writeColor);
    this.hl.ok.setStyle(o.sweepColor);
    this.hl.bad.setStyle(o.failColor);
  }

  render(mode: 'bars3d' | 'sphere3d', f: Frame, W: number, H: number, o: RenderOpts): HTMLCanvasElement {
    const n = f.n;
    const mesh = this.ensureMesh(mode, n);
    this.ensureLut(o);
    if (this.renderer.domElement.width !== W || this.renderer.domElement.height !== H) this.renderer.setSize(W, H, false);
    this.camera.aspect = W / H;
    this.scene.background = this.color.setStyle(o.background).clone();
    const colors = mesh.instanceColor!.array as Float32Array;
    const t = o.reducedMotion ? 0 : f.time;
    for (let i = 0; i < n; i++) {
      const h = Math.max(0, Math.min(1, f.heights[i] / f.maxValue));
      const p = i + f.offsets[i];
      if (mode === 'bars3d') {
        const slot = 12 / n;
        this.dummy.position.set((p + 0.5) * slot - 6, 0, 0);
        this.dummy.scale.set(slot * 0.82, Math.max(0.01, h * 5), Math.max(0.05, Math.min(0.6, slot * 6)));
      } else {
        const r = 2 + h * 1.6;
        const k = Math.min(n - 1, Math.max(0, Math.round(p)));
        this.dummy.position.set(this.dirs[k * 3] * r, this.dirs[k * 3 + 1] * r, this.dirs[k * 3 + 2] * r);
        const s = Math.max(0.025, Math.min(0.2, 2.6 / Math.sqrt(n)));
        this.dummy.scale.setScalar(s);
      }
      this.dummy.updateMatrix();
      mesh.setMatrixAt(i, this.dummy.matrix);
      let c: THREE.Color | null = null;
      if (f.sweep >= 0 && i < f.sweep) c = f.sweepFail >= 0 && i >= f.sweepFail ? this.hl.bad : this.hl.ok;
      else if (o.showHighlights && f.hlType[i]) c = f.hlType[i] === HL_COMPARE ? this.hl.c : f.hlType[i] === HL_SWAP ? this.hl.s : f.hlType[i] === HL_WRITE ? this.hl.w : null;
      if (c) {
        colors[i * 3] = c.r;
        colors[i * 3 + 1] = c.g;
        colors[i * 3 + 2] = c.b;
      } else {
        const v = Math.min(o.palette.length - 1, Math.max(0, f.values[i])) * 3;
        colors[i * 3] = this.lut[v];
        colors[i * 3 + 1] = this.lut[v + 1];
        colors[i * 3 + 2] = this.lut[v + 2];
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor!.needsUpdate = true;
    if (mode === 'bars3d') {
      const ang = Math.sin(t * 0.25) * 0.45;
      this.camera.position.set(Math.sin(ang) * 13, 5.5, Math.cos(ang) * 13);
      this.camera.lookAt(0, 2.2, 0);
      this.group.rotation.set(0, 0, 0);
    } else {
      this.camera.position.set(0, 1.2, 10.5);
      this.camera.lookAt(0, 0, 0);
      this.group.rotation.set(0.25, t * 0.3, 0);
    }
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement;
  }

  dispose() {
    if (this.mesh) {
      this.mesh.geometry.dispose();
      (this.mesh.material as THREE.Material).dispose();
    }
    this.renderer.dispose();
  }
}
