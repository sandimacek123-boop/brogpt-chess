// Bootstrap: builds the world and exposes window.renderFrame(f) for the deterministic offline renderer.
import * as THREE from 'three';
import { buildWorld } from './world.js';
import { Post } from './post.js';
import { Director } from './director.js';

const WIDTH = 1080, HEIGHT = 1920;
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('c'), antialias: false, preserveDrawingBuffer: true, alpha: false });
renderer.setPixelRatio(1);
renderer.setSize(WIDTH, HEIGHT, false);
renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // the compositor does tone mapping + sRGB encoding itself
renderer.toneMapping = THREE.NoToneMapping;

const [timeline, audioEv] = await Promise.all([
  fetch('/src/timeline.json').then(r => r.json()),
  fetch('/src/audio_events.json').then(r => r.json()),
]);
const world = await buildWorld(renderer, '/');
const post = new Post(renderer, WIDTH, HEIGHT);
const director = new Director(world, timeline, audioEv);
const halton = (i, b) => { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; };
const gl = renderer.getContext();
const pixels = new Uint8Array(WIDTH * HEIGHT * 4);

window.renderFrame = async (f, opts = {}) => {
  const t0 = performance.now();
  const P = Object.assign(director.post(f), opts.override || {});
  const S = Math.max(1, Math.round((opts.sMul ?? 1) * P.S));
  post.beginAccum();
  for (let s = 0; s < S; s++) {
    const fs = S > 1 ? f + ((s + 0.5) / S) * P.shutter : f;   // shutter opens at the frame boundary (clean cuts)
    director.scene3d(fs);
    world.halo.visible = false; world.nebula.visible = false;
    world.sweep.visible = world.sweep.intensity > 0;
    if (opts.hide) for (const k of opts.hide) { const o = k.split('.').reduce((a, b) => a[b], world); o.visible = false; }
    world.camera.setViewOffset(WIDTH, HEIGHT, halton(s + 1, 2) - 0.5, halton(s + 1, 3) - 0.5, WIDTH, HEIGHT); // sub-pixel AA jitter
    renderer.setRenderTarget(post.rtScene);
    renderer.render(world.scene, world.camera);
    world.camera.clearViewOffset();
    post.addSample(1 / S);
  }
  if (opts.prof) gl.finish();
  const tA = performance.now();
  post.bloom(P);
  if (opts.prof) gl.finish();
  const tB = performance.now();
  post.composite(P, f);
  if (opts.prof) gl.finish();
  const tC = performance.now();
  gl.readPixels(0, 0, WIDTH, HEIGHT, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  const t1 = performance.now();
  if (opts.prof) return { scene: Math.round(tA - t0), bloom: Math.round(tB - tA), comp: Math.round(tC - tB), read: Math.round(t1 - tC), S };
  if (opts.upload !== false) await fetch(`/frame?i=${f}`, { method: 'POST', body: pixels });
  return { ms: Math.round(t1 - t0), S };
};
window.ready = true;
