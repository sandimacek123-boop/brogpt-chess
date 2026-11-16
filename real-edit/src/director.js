// The edit itself: frame-exact choreography of camera, objects and post FX for all six scenes.
import * as THREE from 'three';
import { clamp, lerp, seg, E, B, spring, springF, kf, shake, beatEnv, smoothstep } from './anim.js';
import { POST_DEFAULTS } from './post.js';

const TAU = Math.PI * 2;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export class Director {
  constructor(W, timeline, audioEv) {
    this.W = W; this.TL = timeline; this.H = timeline.hits; this.ev = audioEv;
    this.cam = W.camera;
    this.kicks = audioEv.kick; this.snares = audioEv.snare; this.hats = audioEv.hat;
    this.allWords = Object.values(W.words);
    this._v = new THREE.Vector3();
    this.dummy = new THREE.Object3D();
  }

  // hit-stop: freeze the 3D world during impact frames (time catches up afterwards, music stays locked)
  sceneTime(f) {
    for (const [a, n] of [[270, 3], [654, 3], [750, 3]]) if (f >= a && f < a + n) return a;
    return f;
  }

  // ------------------------------------------------------------- per-frame reset
  reset() {
    const W = this.W;
    const hide = o => { o.visible = false; };
    [W.logo.group, W.halo, W.wave, W.nebula, W.keycap, W.dust, W.streaks, W.grid, W.tunnel].forEach(hide);
    W.precLines.forEach(hide); W.shockRings.forEach(hide); W.bars.forEach(hide);
    Object.values(W.panels).forEach(hide); W.panelClones.forEach(hide);
    for (const g of Object.values(W.ghosts)) g.forEach(hide);
    for (const w of this.allWords) {
      w.group.visible = false; w.group.position.set(0, 0, 0); w.group.rotation.set(0, 0, 0); w.group.scale.set(1, 1, 1);
      w.mats[0].opacity = 1; w.mats[1].opacity = 1; w.mats[0].emissiveIntensity = 0.12;
      for (const l of w.letters) { l.pivot.position.copy(l.pivot.userData.home); l.pivot.rotation.set(0, 0, 0); l.pivot.scale.set(1, 1, 1); l.pivot.visible = true; }
    }
    const L = W.logo;
    L.group.position.set(0, 0, 0); L.group.rotation.set(0, 0, 0); L.group.scale.set(1, 1, 1);
    L.mesh.visible = true; L.front.opacity = 1; L.side.opacity = 1; L.front.emissiveIntensity = 0.1; L.side.emissiveIntensity = 0.08;
    L.ribbons.forEach(r => { r.visible = false; r.material.uniforms.uOpacity.value = 1; r.material.uniforms.uProg.value = 1; });
    W.amb.intensity = 0.15; W.key.intensity = 1.6; W.rimBlue.intensity = 60; W.rimViolet.intensity = 60; W.sweep.intensity = 0;
    W.scene.fog.density = 0;
    this.cam.fov = 45; this.cam.up.set(0, 1, 0);
    this.focus = 9; this.aperture = 0;
  }

  setCam(pos, target, roll = 0, fov = 45) {
    const c = this.cam;
    c.position.copy(pos); c.up.set(0, 1, 0); c.lookAt(target);
    if (roll) c.rotateZ(roll);
    c.fov = fov; c.updateProjectionMatrix(); c.updateMatrixWorld();
  }
  orbit(dist, az, el, target = V(), roll = 0, fov = 45, shakeAmp = 0, f = 0, seed = 0) {
    const p = V(Math.sin(az) * Math.cos(el) * dist, Math.sin(el) * dist, Math.cos(az) * Math.cos(el) * dist).add(target);
    const t = target.clone();
    if (shakeAmp) {
      p.x += shake(f, 0.55, seed + 1) * shakeAmp; p.y += shake(f, 0.6, seed + 2) * shakeAmp; p.z += shake(f, 0.5, seed + 3) * shakeAmp * 0.5;
      t.x += shake(f, 0.5, seed + 4) * shakeAmp * 0.6; t.y += shake(f, 0.45, seed + 5) * shakeAmp * 0.6;
      roll += shake(f, 0.4, seed + 6) * shakeAmp * 0.12;
    }
    this.setCam(p, t, roll, fov);
  }
  lockToCam(obj, offset) {
    obj.position.copy(this.cam.localToWorld(offset.clone()));
    obj.quaternion.copy(this.cam.quaternion);
  }
  uv(p) { const v = this._v.copy(p).project(this.cam); return [(v.x + 1) / 2, (v.y + 1) / 2]; }
  pxPerUnitAt(dist) { return 1920 / (2 * dist * Math.tan(THREE.MathUtils.degToRad(this.cam.fov) / 2)); }

  glowFrom(obj, P, key, gain) {
    if (!obj.visible || obj.material.opacity <= 0) return;
    const c = this.uv(obj.position);
    const d = this._v.copy(obj.position).applyMatrix4(this.cam.matrixWorldInverse).z * -1;
    if (d <= 0.1) return;
    const r = obj.scale.x * 0.5 / (2 * d * Math.tan(THREE.MathUtils.degToRad(this.cam.fov) / 2));
    P[key] = [c[0], c[1], r, obj.material.opacity * gain];
  }
  showWord(w, pos, opacity = 1, scale = 1) {
    w.group.visible = opacity > 0.002;
    w.group.position.copy(pos);
    w.group.scale.setScalar(scale);
    w.mats[0].opacity = opacity; w.mats[1].opacity = opacity;
  }
  ghosts(key, posFn, baseOpacity, scale = 1, rotFn = null) {
    const gs = this.W.ghosts[key];
    gs.forEach((g, k) => {
      const p = posFn(k + 1);
      if (!p) return;
      g.visible = baseOpacity > 0.01;
      g.position.copy(p); g.scale.setScalar(scale);
      if (rotFn) g.rotation.copy(rotFn(k + 1)); else g.rotation.set(0, 0, 0);
      g.userData.mat.opacity = baseOpacity * Math.pow(1 - k / gs.length, 1.6) * 0.55;
    });
  }
  emitRing(i, f, f0, center, maxR, life, color, quat = null) {
    const r = this.W.shockRings[i];
    const t = seg(f, f0, f0 + life);
    if (f < f0 || t >= 1) return;
    r.visible = true;
    r.position.copy(center);
    if (quat) r.quaternion.copy(quat); else r.quaternion.copy(this.cam.quaternion);
    const rad = 0.3 + maxR * E.outCubic(t);
    r.scale.setScalar(rad);
    r.material.color.copy(color).multiplyScalar(3.5 * (1 - t) * (1 - t));
  }
  dust(f, { opacity = 1, focus = 9, aperture = 14, suck = 0, suckC = V(), center = V(0, 0, -4), box = V(14, 22, 26), size = 0.02, rise = 0.15 } = {}) {
    const d = this.W.dust; d.visible = opacity > 0.01;
    const u = d.material.uniforms;
    u.uTime.value = f; u.uOpacity.value = opacity; u.uFocus.value = focus; u.uAperture.value = aperture;
    u.uSuck.value = suck; u.uSuckC.value.copy(suckC); u.uCenter.value.copy(center); u.uBox.value.copy(box); u.uSize.value = size; u.uRise.value = rise;
  }

  // ------------------------------------------------------------- 3D state at (sub)frame f
  scene3d(fRaw) {
    const f = this.sceneTime(fRaw);
    this.reset();
    if (f < 126) this.s1(f);
    else if (f < 270) this.s2(f);
    else if (f < 366) this.s3(f);
    else if (f < 558) this.s4(f);
    else if (f < 750) this.s5(f);
    else this.s6(f);
  }

  // ============================================================ SCENE 1 — THE AWAKENING (0–126)
  s1(f) {
    const W = this.W, R = this.H.logoReveal;
    const t = seg(f, 0, 126);
    const kick = f >= R ? (1 - springF(f, R, 2.0, 0.42)) : 0;            // impact push-in, springs back
    const dist = lerp(14, 8.7, E.inOutCubic(t)) - 1.3 * kick;
    const az = lerp(0.26, 0.0, E.inOutCubic(t)), el = lerp(0.12, 0.02, E.outCubic(t));
    this.orbit(dist, az, el, V(0, 0, 0), lerp(-0.06, 0, E.inOutCubic(t)), 45, f >= R ? 0.12 * Math.exp(-(f - R) / 9) : 0, f, 1);

    // logo assembles from thin glowing lines
    const L = W.logo;
    L.group.visible = true;
    L.ribbons.forEach((r, i) => {
      const p = E.inOutSine(seg(f, 6 + i * 9, 88 + i * 3));
      r.visible = p > 0;
      r.material.uniforms.uProg.value = p;
      r.material.uniforms.uOpacity.value = f < R ? 1 : lerp(1.6, 0.35, E.outCubic(seg(f, R, R + 18)));
    });
    const solid = f < R ? 0.12 * E.inCubic(seg(f, 80, R)) : 1;
    L.front.opacity = solid; L.side.opacity = solid; L.mesh.visible = solid > 0.003;
    L.front.emissiveIntensity = f < R ? 0.6 : 0.1 + 0.5 * Math.exp(-(f - R) / 7);
    L.side.emissiveIntensity = f < R ? 0.3 : 0.08 + 0.4 * Math.exp(-(f - R) / 9);
    L.group.rotation.y = lerp(-0.18, 0, E.outCubic(seg(f, 0, 110)));
    L.group.scale.setScalar(1 + 0.06 * kick);
    // light sweep across the face after the reveal
    W.sweep.intensity = f >= R ? 5 * Math.sin(Math.PI * seg(f, R + 2, 126)) : 0;
    W.sweep.position.set(lerp(-2.6, 2.8, E.inOutSine(seg(f, R + 2, 126))), 0.8, 2.3);
    W.rimBlue.intensity = 80 * seg(f, 10, 90); W.rimViolet.intensity = 80 * seg(f, 30, 100);

    // volumetric halo + nebula + dust
    W.halo.visible = true; W.halo.position.set(0, 0, -0.6); W.halo.quaternion.copy(this.cam.quaternion);
    W.halo.scale.setScalar(lerp(1.5, 6.5, E.outCubic(seg(f, 10, 100))) + (f >= R ? 2.5 * Math.exp(-(f - R) / 10) : 0));
    W.halo.material.opacity = 0.12 * seg(f, 10, 90) + (f >= R ? 0.3 * Math.exp(-(f - R) / 12) + 0.04 : 0);
    W.nebula.visible = true; W.nebula.position.set(0, 1, -14); W.nebula.scale.setScalar(34); W.nebula.material.opacity = 0.22 * E.inOutSine(seg(f, 0, 110));
    this.dust(f, { opacity: E.inOutSine(seg(f, 0, 32)), focus: dist, aperture: 15.4, suck: f < R ? 0.25 * E.inQuint(seg(f, 70, R)) : -0.35 * Math.exp(-(f - R) / 14) });
    if (f >= R) this.emitRing(0, f, R, V(0, 0, 0.2), 4.5, 26, W.COL.cyan);
    this.focus = dist;
  }

  // ============================================================ SCENE 2 — THE BUILDUP (126–270)
  s2(f) {
    const W = this.W, H = this.H;
    const L = W.logo;
    // camera orbit accelerates around the logo
    const az = kf(f, [[126, 0], [222, -0.42, E.inOutQuint], [258, 0.18, E.inOutCubic]]);
    const el = kf(f, [[126, 0.02], [200, 0.12, E.inOutSine], [258, 0.0, E.inOutSine]]);
    let dist = lerp(8.7, 9.8, E.outCubic(seg(f, 126, 160)));
    // inhale (anticipation pull-back) then rocket in
    dist += 2.2 * E.outCubic(seg(f, 258, 264));
    dist -= (9.8 + 2.2 - 5.8) * E.inExpo(seg(f, 264, 270));
    const roll = kf(f, [[126, 0], [222, 0.05], [258, -0.06], [270, 0.0]]);
    this.orbit(dist, az, el, V(0, 0, 0), roll, 45 + 6 * E.inExpo(seg(f, 262, 270)), 0.02, f, 2);
    this.focus = dist;

    // logo: rises to the top for typography, returns to center for the drop
    L.group.visible = true;
    const up = E.outBack(seg(f, 126, 140), 1.4) * (1 - E.inOutCubic(seg(f, 244, 258)));
    L.group.position.set(0, 1.55 * up, 0);
    L.group.scale.setScalar(lerp(1, 0.62, up));
    L.group.rotation.y = 0.35 * Math.sin((f - 126) * 0.018) * up;
    L.front.emissiveIntensity = 0.12 + 0.6 * beatEnv(f, this.kicks, 6, 0, 126, 270);
    L.ribbons.forEach(r => { r.visible = true; r.material.uniforms.uProg.value = 1; r.material.uniforms.uOpacity.value = 0.35 + 0.5 * beatEnv(f, this.kicks, 6, 0, 126, 270); });
    W.halo.visible = true; W.halo.position.copy(L.group.position).add(V(0, 0, -0.6)); W.halo.quaternion.copy(this.cam.quaternion);
    W.halo.scale.setScalar(6.5 * L.group.scale.x); W.halo.material.opacity = 0.14 + 0.25 * E.inExpo(seg(f, 250, 270));
    W.nebula.visible = true; W.nebula.position.set(0, 1, -14); W.nebula.scale.setScalar(34); W.nebula.material.opacity = 0.22 * (1 - 0.6 * seg(f, 258, 266));
    W.rimBlue.intensity = 80; W.rimViolet.intensity = 80;

    // official UI panels in depth layers
    const pin = E.outQuint(seg(f, 136, 176));
    const pout = E.inCubic(seg(f, 252, 264));
    const pan = (p, pos, ry, op, drift) => {
      p.visible = true;
      p.position.set(pos[0] + drift * (f - 126) * 0.004, pos[1], pos[2] - 4 * (1 - pin) - 6 * pout);
      p.rotation.set(0.06, ry, 0);
      p.material.uniforms.uOpacity.value = op * pin * (1 - pout);
    };
    pan(W.panels.editor, [-1.7, 0.6, -4.2], 0.5, 0.55, 1);
    pan(W.panels.hub, [2.0, -1.5, -5.5], -0.55, 0.45, -1);
    pan(W.panels.acc, [-1.4, -3.0, -7.0], 0.4, 0.4, 0.6);

    // --- "REAL"
    const wy = -0.85;
    if (f < 178) {
      const w = W.words.REAL;
      this.showWord(w, V(0, wy, 0.2), 1);
      w.group.rotation.y = az * 0.55;
      w.letters.forEach((l, i) => {
        const s0 = 126 + i * 2.5;
        const sp = springF(f, s0, 2.6, 0.5);
        l.pivot.position.y += -1.3 * (1 - sp);
        l.pivot.rotation.x = -1.5 * (1 - sp);
        l.pivot.scale.setScalar(f < s0 ? 0.001 : 1);
        const out = E.inQuint(seg(f, 166 + i * 1.5, 176 + i * 1.5));
        l.pivot.position.z -= 9 * out; l.pivot.scale.multiplyScalar(1 - 0.6 * out);
        if (out >= 1) l.pivot.visible = false;
      });
      w.mats[0].emissiveIntensity = 0.12 + 0.6 * Math.exp(-Math.max(0, f - 128) / 6);
    }
    // --- "PRECISION." letters converge from scatter to exact alignment + crosshair lines lock
    if (f >= 172 && f < 226) {
      const w = W.words.PRECISION;
      this.showWord(w, V(0, wy, 0.3), 1);
      w.group.rotation.y = az * 0.5;
      w.letters.forEach((l, i) => {
        const h = Math.sin(i * 91.7) * 0.5 + 0.5, h2 = Math.sin(i * 37.3) * 0.5 + 0.5;
        const t = E.outExpo(seg(f, 172 + i * 0.8, 186 + i * 0.8));
        l.pivot.position.add(V((h - 0.5) * 6, (h2 - 0.5) * 4, (h - h2) * 8).multiplyScalar(1 - t));
        l.pivot.rotation.set((h2 - 0.5) * 3 * (1 - t), (h - 0.5) * 4 * (1 - t), 0);
        const out = E.inQuint(seg(f, 216, 226));
        l.pivot.position.x += (l.x < 0 ? -1 : 1) * 4.5 * out;
      });
      W.precLines.forEach((pl, k) => {
        pl.visible = true;
        pl.position.copy(w.group.position); pl.rotation.copy(w.group.rotation);
        pl.position.y += 0; pl.scale.set(1, 1, 1);
        pl.material.uniforms.uProg.value = E.outQuint(seg(f, 174 + k * 2, 190 + k * 2)) * (1 - E.inQuint(seg(f, 214, 224)));
        pl.material.uniforms.uSpan.value = 0.15;
        pl.material.uniforms.uScatter.value = 0;
      });
    }
    // --- "PERFORMANCE." velocity entry with motion trails
    if (f >= 222) {
      const w = W.words.PERFORMANCE;
      const X = ff => 7.5 * (1 - B.snap(seg(ff, 222, 238))) - 0.35 * Math.sin(Math.PI * seg(ff, 230, 246)) * (1 - seg(ff, 230, 246));
      const suck = E.inQuint(seg(f, 250, 262));
      const pos = V(X(f) * (1 - suck), wy * (1 - suck), 0.3 - 2 * suck);
      this.showWord(w, pos, 1 - suck, 1 - 0.8 * suck);
      w.group.rotation.y = az * 0.5 - 0.5 * (1 - E.outCubic(seg(f, 222, 236)));
      const vel = Math.abs(X(f) - X(f - 1));
      this.ghosts('PERFORMANCE', k => V(X(f - k * 1.4), wy, 0.3 - k * 0.05), clamp(vel * 2.2) * (1 - suck), 1, () => w.group.rotation.clone());
    }
    // dust: inhale sucks everything toward the logo
    const suck = E.inQuint(seg(f, 252, 268));
    this.dust(f, { opacity: 1, focus: dist, aperture: 13.2, suck, suckC: V(0, 0, 0) });
    if (f >= 126) this.emitRing(0, f, 126, L.group.position.clone(), 3.5, 24, W.COL.blue);
  }

  // ============================================================ SCENE 3 — THE MAIN DROP (270–366)
  s3(f) {
    const W = this.W, L = W.logo, D = this.H.drop;
    const t0 = D + 3; // after hit-stop
    const rec = springF(f, t0, 1.5, 0.42);
    let dist = lerp(5.8, 6.6, rec);
    const shakeA = 0.22 * Math.exp(-Math.max(0, f - t0) / 12) + 0.04 * beatEnv(f, this.kicks, 4, 0, 280, 366);
    // whip-pan out (camera swings right) into the next scene
    const whip = E.inQuint(seg(f, 348, 366));
    const az = 1.1 * whip + 0.95 * (E.inOutSine(seg(f, 292, 352)) - 0.5) * seg(f, 273, 300);
    const el = 0.04 * Math.sin((f - 270) * 0.025) + 0.12 * Math.sin(Math.PI * seg(f, 292, 352));
    const roll = 0.18 * (1 - rec) * Math.sin((f - 270) * 0.5) * 0 + 0.1 * whip - 0.06 * (1 - rec);
    this.orbit(dist, az * 0.35, el, V(1.4 * whip * 0, 0, 0), roll, 48 - 4 * rec, shakeA, f, 3);
    if (whip > 0) { this.cam.rotateY(-whip * 0.9); this.cam.updateMatrixWorld(); }
    this.focus = dist;

    L.group.visible = true;
    const spin = E.outQuint(seg(f, t0, 322));
    L.group.rotation.y = TAU * spin;
    L.group.rotation.x = 0.25 * Math.sin(Math.PI * spin) * 0.5;
    L.group.position.y = 0.12 * Math.sin((f - 270) * 0.06) * seg(f, 300, 320);
    const kb = beatEnv(f, this.kicks, 5, 0, 280, 366), sb = beatEnv(f, this.snares, 7, 0, 280, 366);
    L.group.scale.setScalar(1.0 + 0.05 * kb + 0.03 * sb);
    L.front.emissiveIntensity = 0.12 + 0.45 * Math.exp(-Math.max(0, f - t0) / 6) + 0.3 * kb;
    L.side.emissiveIntensity = 0.1 + 0.4 * Math.exp(-Math.max(0, f - t0) / 8) + 0.25 * sb;
    L.ribbons.forEach(r => { r.visible = true; r.material.uniforms.uProg.value = 1; r.material.uniforms.uOpacity.value = 0.4 + 1.2 * kb; });
    W.rimBlue.intensity = 90 + 120 * kb; W.rimViolet.intensity = 90 + 120 * sb;
    W.halo.visible = true; W.halo.position.set(0, 0, -0.7); W.halo.quaternion.copy(this.cam.quaternion);
    W.halo.scale.setScalar(7 + 3 * kb); W.halo.material.opacity = 0.16 + 0.14 * kb;
    W.nebula.visible = true; W.nebula.position.set(0, 0.5, -14); W.nebula.scale.setScalar(36); W.nebula.material.opacity = 0.25 + 0.12 * sb;
    // dust explodes outward from the impact, then settles
    const sk = f < t0 ? 1 : lerp(1, -0.55, E.outExpo(seg(f, t0, t0 + 10))) * (1 - E.inOutSine(seg(f, t0 + 10, 340)));
    this.dust(f, { opacity: 1, focus: dist, aperture: 11, suck: sk, suckC: V(0, 0, 0), size: 0.026 });
    // shock rings on the drop and on the snares
    this.emitRing(0, f, t0 - 1, V(0, 0, 0.1), 7.5, 34, W.COL.cyan);
    this.emitRing(1, f, t0 + 2, V(0, 0, -0.2), 5.5, 30, W.COL.violet);
    let k = 2;
    for (const s of this.snares) if (s > 280 && s < 366 && k < 6) this.emitRing(k++, f, s, V(0, 0, -0.3), 4.2, 22, k % 2 ? W.COL.blue : W.COL.cyan);
    // accent light bars flying past on the beat
    W.bars.forEach((b, i) => {
      const h = (Math.sin(i * 12.9898) * 43758.5453) % 1, h2 = (Math.sin(i * 78.233) * 12345.678) % 1;
      const ph = ((f - 270) * 0.9 + i * 13) % 40;
      b.visible = true;
      b.position.set((h - 0.5) * 9, (h2 - 0.5) * 14, -30 + ph * 1.1);
      b.scale.set(1, 1, 3 + 4 * Math.abs(h));
      b.material.opacity = smoothstep(0, 6, ph) * (1 - smoothstep(30, 40, ph));
    });
  }

  // ============================================================ SCENE 4 — EXECUTION SEQUENCE (366–558)
  s4(f) {
    const W = this.W, H = this.H;
    // camera: whip-in continuation, then a steady forward drift; STABILITY shakes the world
    const whipIn = 1 - B.whipOut(seg(f, 366, 384));
    const stabShake = f >= H.textStability ? 0.32 * Math.exp(-(f - H.textStability) / 13) : 0;
    const kb = beatEnv(f, this.kicks, 5, 0, 366, 558);
    const dive = E.inExpo(seg(f, 530, 558));
    const camZ = 8.2 - 0.004 * (f - 366) - 10.5 * dive;
    const pos = V(0.3 * Math.sin((f - 366) * 0.012) * (1 - dive), 0.35 * (1 - dive), camZ);
    const tgt = V(0, 0.1 * (1 - dive), camZ - 8);
    this.setCam(pos, tgt, -0.35 * whipIn + 0.02 * Math.sin((f - 366) * 0.02), 46 + 2 * kb + 14 * dive);
    this.cam.rotateY(-0.9 * whipIn); this.cam.updateMatrixWorld();
    if (stabShake > 0) {
      this.cam.position.x += shake(f, 0.9, 7) * stabShake; this.cam.position.y += shake(f, 1.0, 8) * stabShake;
      this.cam.rotateZ(shake(f, 0.8, 9) * stabShake * 0.12); this.cam.updateMatrixWorld();
    }
    this.focus = 8;

    // environment: grid floor, flying panels, accent light bars
    W.grid.visible = true; W.grid.position.set(0, -2.7, camZ - 60);
    W.grid.material.uniforms.uScroll.value = (f - 366) * 0.06;
    W.grid.material.uniforms.uPulse.value = 0.8 * kb;
    W.grid.material.uniforms.uOpacity.value = 0.9;
    W.nebula.visible = true; W.nebula.position.set(0, -1.5, camZ - 40); W.nebula.scale.setScalar(60); W.nebula.material.opacity = 0.3;
    W.panelClones.forEach((p, i) => {
      const side = i % 2 ? 1 : -1;
      const ph = ((f - 366) * 0.22 + i * 7.5) % 45;
      p.visible = true;
      p.position.set(side * (3.9 + (i % 3) * 0.8), -0.6 + ((i * 1.7) % 2.6), camZ - 42 + ph);
      p.rotation.set(0, -side * 1.0, 0);
      p.material.uniforms.uOpacity.value = 0.55 * smoothstep(0, 8, ph) * (1 - smoothstep(-3.0, 0.5, p.position.z));
    });
    W.bars.forEach((b, i) => {
      const h = Math.abs((Math.sin(i * 12.9898) * 43758.5453) % 1), h2 = Math.abs((Math.sin(i * 78.233) * 12345.678) % 1);
      const ph = ((f - 366) * (1.6 + h) + i * 11) % 60;
      b.visible = true;
      b.position.set((h - 0.5) * 10, -2.6 + h2 * 6, camZ - 50 + ph);
      b.scale.set(1, 1, 4 + 6 * h2);
      b.material.opacity = smoothstep(0, 8, ph) * (1 - smoothstep(48, 58, ph));
    });
    this.dust(f, { opacity: 0.8, focus: 8, aperture: 11, center: V(0, 0, camZ - 10), box: V(14, 12, 30), rise: 0.05 });

    const feature = (panel, at, pos, ry, op = 0.6) => {
      const a = E.outQuint(seg(f, at, at + 16)), b = E.inQuint(seg(f, at + 40, at + 48));
      if (a <= 0 || b >= 1) return;
      panel.visible = true;
      panel.position.set(pos[0], pos[1], pos[2] - 3 * (1 - a) + 6 * b);
      panel.rotation.set(-0.12, ry * (1 + 0.6 * (1 - a)), 0);
      panel.material.uniforms.uOpacity.value = op * a * (1 - b);
    };
    // --- UNC: slams in from deep space
    if (f < 414) {
      const w = W.words.UNC, a = H.textUNC;
      const z = -34 * (1 - E.outExpo(seg(f, a, a + 12))) + 0.6 * seg(f, a + 12, a + 40) + 4.5 * E.inQuint(seg(f, 404, 414));
      this.showWord(w, V(0, 0.15, z), 1 - E.inCubic(seg(f, 405, 413)));
      w.group.rotation.y = 0.25 * Math.sin((f - a) * 0.04) * (1 - E.outCubic(seg(f, a, a + 30)));
      w.group.rotation.x = -0.6 * (1 - E.outExpo(seg(f, a, a + 14)));
      w.mats[0].emissiveIntensity = 0.12 + 0.7 * Math.exp(-Math.max(0, f - a - 8) / 6);
      feature(W.panels.editor, a, [0, 0.2, -3.6], 0.0, 0.5);
    }
    // --- sUNC: whip from the right with trails
    if (f >= 412 && f < 462) {
      const w = W.words.SUNC, a = H.textSUNC;
      const X = ff => 7 * (1 - B.snap(seg(ff, a, a + 16))) - 0.3 * Math.sin(Math.PI * seg(ff, a + 8, a + 26)) * (1 - seg(ff, a + 8, a + 26)) - 8 * E.inQuint(seg(ff, 453, 462));
      this.showWord(w, V(X(f), 0.15, 0), 1);
      w.group.rotation.z = -0.12 * (1 - E.outCubic(seg(f, a, a + 14)));
      const vel = Math.abs(X(f) - X(f - 1));
      this.ghosts('SUNC', k => V(X(f - k * 1.3), 0.15, -0.05 * k), clamp(vel * 1.6), 1);
      feature(W.panels.hub, a, [1.2, -1.9, -4.2], -0.35, 0.55);
    }
    // --- STABILITY: the world shakes, the word stays locked; glitch slices settle into alignment
    if (f >= 460 && f < 512) {
      const w = W.words.STABILITY, a = H.textStability;
      w.group.visible = true;
      this.lockToCam(w.group, V(0, -0.05, -8.0));
      w.mats[0].opacity = w.mats[1].opacity = 1;
      w.letters.forEach((l, i) => {
        const s0 = a + i * 1.2;
        const sp = springF(f, s0, 3.2, 0.42);
        l.pivot.position.y += 1.6 * (1 - sp);
        l.pivot.scale.setScalar(f < s0 ? 0.001 : 1);
        const drop = E.inQuint(seg(f, 495 + i * 0.6, 503 + i * 0.6));
        l.pivot.position.y -= 7.5 * drop; l.pivot.scale.multiplyScalar(1 - 0.5 * drop);
      });
      const pl = W.precLines[0];
      pl.visible = true; this.lockToCam(pl, V(0, -0.05 - 0.5, -8.0)); pl.scale.set(0.82, 1, 1);
      pl.material.uniforms.uProg.value = E.outQuint(seg(f, a + 8, a + 24)) * (1 - seg(f, 493, 501));
      pl.material.uniforms.uSpan.value = 0.12;
      feature(W.panels.acc, a, [-1.0, 1.9, -4.6], 0.35, 0.5);
    }
    // --- ONE KEY.: pressed like a key, keycap frame draws on
    if (f >= 505) {
      const w = W.words.ONEKEY, a = H.textOneKey;
      const press = f < a ? lerp(1.4, -0.3, E.inQuint(seg(f, 505, a))) : -0.3 * (1 - springF(f, a, 3.0, 0.38));
      const split = E.inExpo(seg(f, 536, 556));
      this.showWord(w, V(0, 0.15, press), seg(f, 505, 507));
      w.group.scale.set(1, 1, f >= a ? lerp(0.55, 1, springF(f, a, 3, 0.4)) : 1);
      w.mats[0].emissiveIntensity = 0.12 + 0.7 * Math.exp(-Math.max(0, f - a) / 7);
      w.letters.forEach(l => { l.pivot.position.x += Math.sign(l.x) * 3.2 * split; l.pivot.position.z += 2 * split; });
      W.keycap.visible = true; W.keycap.position.set(0, 0.15, press - 0.05);
      W.keycap.scale.set(1 + 1.2 * split, 1 + 1.2 * split, 1);
      W.keycap.material.uniforms.uProg.value = E.outQuint(seg(f, a, a + 14));
      W.keycap.material.uniforms.uSpan.value = 0.2; W.keycap.material.uniforms.uScatter.value = 0;
      W.keycap.material.uniforms.uOpacity.value = 1 + 2.5 * Math.exp(-Math.max(0, f - a) / 6);
      feature(W.panels.hero, a, [0, -0.3, -4.0], 0.0, 0.45);
      if (f >= a) this.emitRing(0, f, a, V(0, 0.15, -0.3), 3.2, 20, W.COL.blue, new THREE.Quaternion());
    }
    if (f >= H.textUNC && f < H.textUNC + 26) this.emitRing(1, f, H.textUNC + 10, V(0, 0.15, 0), 4, 22, W.COL.cyan, new THREE.Quaternion());
  }

  // ============================================================ SCENE 5 — THE CLIMAX (558–750)
  climaxDist(f) {
    if (f < 580) return 18 * B.whipOut(seg(f, 558, 580));
    if (f < 702) return 18 + (f - 580) * 0.5;
    if (f < 738) { const t = seg(f, 702, 738); return 79 + (f - 702) * 0.5 + 34 * E.inQuart(t); }
    if (f < 744) return 131 + 4.5 * E.outQuint(seg(f, 738, 744));
    return 135.5 + 3 * E.inExpo(seg(f, 744, 750));
  }
  s5(f) {
    const W = this.W, H = this.H;
    const D = this.climaxDist(f);
    const camZ = -D;
    const conv = E.inOutCubic(seg(f, 736, 748));
    const rollSnap = f >= 657 ? Math.PI * springF(f, 657, 1.3, 0.55) : 0;
    const roll = 0.22 * Math.sin((f - 558) * 0.022) + rollSnap + 0.5 * E.inQuart(seg(f, 702, 738));
    const fov = 50 + 22 * E.inQuart(seg(f, 702, 738)) - 22 * E.outCubic(seg(f, 738, 746));
    const kb = beatEnv(f, this.kicks, 5, 0, 558, 750);
    const wob = 0.12 * (1 - conv);
    const pos = V(Math.sin((f - 558) * 0.03) * wob, Math.cos((f - 558) * 0.025) * wob, camZ);
    this.setCam(pos, V(0, 0, camZ - 10), roll, fov);
    const sh = (f >= 657 ? 0.12 * Math.exp(-(f - 657) / 10) : 0) + 0.03 * kb;
    if (sh) { this.cam.position.x += shake(f, 0.9, 21) * sh; this.cam.position.y += shake(f, 0.9, 22) * sh; this.cam.updateMatrixWorld(); }
    this.focus = 6;

    W.tunnel.visible = true;
    const sp = 6, n = W.rings.length, Ltot = sp * n;
    const ringScale = 1 - 0.92 * conv;
    let li = 0;
    W.rings.forEach((g, i) => {
      const ahead = ((i * sp - D) % Ltot + Ltot) % Ltot - 2;
      g.position.set(0, 0, camZ - ahead);
      g.rotation.set(0, 0, (i % 2 ? 1 : -1) * (f - 558) * 0.012 + i * 0.4 + (i % 2 ? 0.25 : -0.25) * kb);
      g.scale.setScalar(ringScale * (1 + 0.04 * kb));
      g.visible = ahead > -2 && ahead < Ltot - 4;
      for (let k = 0; k < 6; k++) {
        const a = k / 6 * TAU + g.rotation.z * -1.6;
        const r = 3.85 * ringScale;
        this.dummy.position.set(Math.cos(a) * r, Math.sin(a) * r, camZ - ahead);
        this.dummy.rotation.set(0, 0, a - Math.PI / 2 + 0.6);
        this.dummy.scale.setScalar(0.34 * (g.visible ? 1 : 0) * ringScale);
        this.dummy.updateMatrix();
        W.ringLogos.setMatrixAt(li++, this.dummy.matrix);
      }
    });
    W.ringLogos.instanceMatrix.needsUpdate = true;
    const flash = 1 + 1.6 * kb + 2.5 * E.inQuart(seg(f, 702, 738)) * (0.5 + 0.5 * Math.sin(f * 1.3));
    W.ringMats[0].color.copy(W.COL.cyan).multiplyScalar(2.0 * flash);
    W.ringMats[1].color.copy(W.COL.violet).multiplyScalar(2.4 * flash);
    W.ringMats.forEach(m => { m.opacity = 1 - 0.3 * conv; });
    W.wall.position.set(0, 0, camZ - 55);
    W.wall.material.opacity = 0.22 * (1 - conv) * seg(f, 558, 566);
    W.wall.material.color.copy(W.COL.blue).multiplyScalar(0.8 + 0.8 * kb);
    W.wallTex.offset.set((f - 558) * 0.0015, -D / 12);
    const st = W.streaks; st.visible = true;
    st.material.uniforms.uCamZ.value = camZ; st.material.uniforms.uTime.value = f - 558;
    st.material.uniforms.uStretch.value = 1 + 3 * E.inQuart(seg(f, 702, 738)) + 3 * (1 - seg(f, 558, 580));
    st.material.uniforms.uOwn.value = 0.08; st.material.uniforms.uOpacity.value = 1 - conv;
    W.amb.intensity = 0.3;
    W.rimBlue.position.set(-3, 2, camZ - 4); W.rimViolet.position.set(3, -2, camZ - 6);

    // giant REAL typography the camera flies through
    {
      const w = W.words.REAL;
      const zw = -64;
      const dz = camZ - zw;
      if (dz > -1 && dz < 60) {
        this.showWord(w, V(0, 0, zw), clamp(1 - (dz - 30) / 30) * (1 - conv), 1.15);
        w.mats[0].emissiveIntensity = 0.25 + 0.8 * kb;
        const spread = 1 - smoothstep(0.0, 5.5, dz);
        w.letters.forEach(l => { l.pivot.position.x += Math.sign(l.x) * 2.5 * spread; l.pivot.rotation.y = -Math.sign(l.x) * 0.9 * spread; });
      }
    }
    // the light at the end of the tunnel: the REAL logo
    const L = W.logo;
    const lz = -(141.5) - 6;
    if (f >= 690) {
      L.group.visible = true;
      L.group.position.set(0, 0, lz);
      L.group.scale.setScalar(1.0);
      L.group.rotation.set(0, 0, 0);
      L.front.emissiveIntensity = 0.15 + 0.4 * E.inQuart(seg(f, 700, 750));
      W.halo.visible = true; W.halo.position.set(0, 0, lz - 0.8); W.halo.quaternion.copy(this.cam.quaternion);
      W.halo.scale.setScalar(9 + 4 * conv); W.halo.material.opacity = 0.1 + 0.2 * seg(f, 700, 748);
    }
    this.dust(f, { opacity: 0.12 + 0.5 * conv, focus: 6, aperture: 5, center: V(0, 0, camZ - 14), box: V(8, 8, 30), suck: conv, suckC: V(0, 0, lz) });
  }

  // ============================================================ SCENE 6 — FINAL REVEAL (750–900)
  s6(f) {
    const W = this.W, H = this.H, L = W.logo;
    const t0 = H.finalImpact + 3;
    const rec = f < t0 ? 0 : springF(f, t0, 1.1, 0.5);
    const dist = lerp(6.2, 9.4, rec) - 0.9 * E.inOutSine(seg(f, 790, 900));
    const az = lerp(0.12, 0.0, rec) - 0.05 * E.inOutSine(seg(f, 790, 900));
    const el = lerp(0.0, 0.03, rec);
    const shakeA = f >= t0 ? 0.16 * Math.exp(-(f - t0) / 11) : 0;
    this.orbit(dist, az, el, V(0, lerp(1.0, -0.1, rec), 0), -0.12 * (1 - rec), 45, shakeA, f, 6);
    this.focus = dist;

    L.group.visible = true;
    L.group.position.set(0, 1.0, 0);
    L.group.scale.setScalar(1.02);
    L.group.rotation.y = 0.35 * (1 - E.outCubic(seg(f, t0, 820))) + 0.025 * Math.sin((f - 750) * 0.03);
    L.front.emissiveIntensity = 0.1 + 0.45 * Math.exp(-Math.max(0, f - t0) / 7);
    L.side.emissiveIntensity = 0.08 + 0.4 * Math.exp(-Math.max(0, f - t0) / 9);
    L.ribbons.forEach(r => { r.visible = true; r.material.uniforms.uProg.value = 1; r.material.uniforms.uOpacity.value = 0.3 + 1.5 * Math.exp(-Math.max(0, f - t0) / 10); });
    W.sweep.intensity = 5 * Math.sin(Math.PI * seg(f, 780, 836));
    W.sweep.position.set(lerp(-2.8, 3.0, E.inOutSine(seg(f, 780, 836))), 1.8, 2.3);
    W.rimBlue.intensity = 90; W.rimViolet.intensity = 90;
    W.halo.visible = true; W.halo.position.set(0, 1.0, -0.7); W.halo.quaternion.copy(this.cam.quaternion);
    W.halo.scale.setScalar(6.5 + 3 * Math.exp(-Math.max(0, f - t0) / 12)); W.halo.material.opacity = 0.14 + 0.25 * Math.exp(-Math.max(0, f - t0) / 12);

    // official dark wave backdrop
    W.wave.visible = true;
    W.wave.position.set(-1.5 + 0.004 * (f - 750) * 3, 0.5, -16);
    W.wave.scale.set(64, 36, 1);
    W.wave.rotation.set(0, 0, -0.12);
    W.wave.material.opacity = 0.95 * E.inOutSine(seg(f, t0, 800));
    W.wave.material.color.setRGB(0.42, 0.5, 0.85);
    W.nebula.visible = true; W.nebula.position.set(0, 1.2, -10); W.nebula.scale.setScalar(26); W.nebula.material.opacity = 0.22;
    this.dust(f, { opacity: 0.8, focus: dist, aperture: 13.2, suck: f < t0 ? 1 : lerp(1, -0.4, E.outExpo(seg(f, t0, t0 + 12))) * (1 - E.inOutSine(seg(f, t0 + 12, 840))), suckC: V(0, 1, 0), size: 0.024 });
    this.emitRing(0, f, t0 - 1, V(0, 1.0, 0.1), 9, 40, W.COL.cyan);
    this.emitRing(1, f, t0 + 3, V(0, 1.0, -0.2), 6, 34, W.COL.violet);

    // REAL.
    {
      const w = W.words.REALF, a = 762;
      if (f >= a - 6) {
        const Z = ff => 5 * (1 - B.snap(seg(ff, a, a + 18)));
        this.showWord(w, V(0, -0.95, Z(f)), seg(f, a - 2, a + 3));
        w.letters.forEach((l, i) => { const s = springF(f, a + i * 1.6, 2.4, 0.5); l.pivot.scale.setScalar(Math.max(0.001, s)); });
        w.mats[0].emissiveIntensity = 0.12 + 0.6 * Math.exp(-Math.max(0, f - a - 6) / 8);
        const vel = Math.abs(Z(f) - Z(f - 1));
        this.ghosts('REALF', k => V(0, -0.95, Z(f - k * 1.5)), clamp(vel * 1.2), 1);
      }
    }
    // BEYOND EXECUTION. — tracking-in reveal led by a light streak
    {
      const w = W.words.BEYOND, a = H.textBeyond;
      if (f >= a - 4) {
        const tr = E.outQuint(seg(f, a - 4, a + 40));
        this.showWord(w, V(0, -1.72, 0.1), 1);
        w.mats[0].emissiveIntensity = 0.5; w.mats[0].color.setRGB(1, 1, 1);
        const head = lerp(-2.6, 2.8, E.inOutSine(seg(f, a - 4, a + 26)));
        w.letters.forEach(l => {
          l.pivot.position.x = l.pivot.userData.home.x * lerp(1.35, 1.0, tr);
          const vis = smoothstep(head - 0.05, head - 0.6, l.pivot.position.x);
          l.pivot.scale.setScalar(Math.max(0.001, vis));
          l.pivot.position.y += 0.15 * (1 - vis);
        });
        const b = W.bars[0];
        const bOp = Math.sin(Math.PI * seg(f, a - 4, a + 28));
        if (bOp > 0) {
          b.visible = true; b.position.set(head - 0.3, -1.72 - 0.17, 0.15); b.rotation.set(0, Math.PI / 2, 0); b.scale.set(0.6, 0.6, 0.9);
          b.material.color.copy(W.COL.cyan).multiplyScalar(5); b.material.opacity = bOp;
        }
      }
    }
  }

  // ------------------------------------------------------------- post-FX at integer frame f
  post(f) {
    const P = POST_DEFAULTS();
    const H = this.H;
    this.scene3d(f); // camera for screen projections
    this.glowFrom(this.W.halo, P, 'glowA', 0.45);
    this.glowFrom(this.W.nebula, P, 'glowB', 0.3);
    const kb = beatEnv(f, this.kicks, 5, 0, 270, 750);
    const decay = (a, tau) => (f >= a ? Math.exp(-(f - a) / tau) : 0);
    P.speedSeed = Math.floor(f / 2);

    if (f < 126) {
      // ---- AWAKENING
      const R = H.logoReveal;
      P.exposure = 0.3 + 0.7 * E.inOutSine(seg(f, 0, 24));
      P.chroma = 0.25 + 1.6 * decay(R + 1, 6);
      P.god = 0.12 * seg(f, 40, 100) + 0.3 * decay(R, 14);
      P.godC = this.uv(V(0, 0.4, -0.5));
      P.bloom = 0.5 + 0.25 * decay(R, 8);
      P.S = f >= R && f < R + 12 ? 10 : 6;
      if (f === R) { P.bw = 1; P.speed = 1; P.speedInner = 0.34; P.bwThresh = 0.36; }
      if (f >= R + 1) {
        const c = this.uv(V(0, 0, 0));
        P.zoom = 0.1 * decay(R + 1, 4); P.zoomC = c;
        P.shock = [c[0], c[1], 0.05 + 0.85 * E.outCubic(seg(f, R + 1, R + 40)), 0.03 * (1 - seg(f, R + 1, R + 40)) ** 2];
        P.flash = 0.06 * decay(R + 1, 3);
      }
      P.grain = 0.045;
    } else if (f < 270) {
      // ---- BUILDUP
      P.chroma = 0.3 + 0.4 * seg(f, 200, 258);
      P.god = 0.06; P.godC = this.uv(this.W.logo.group.position);
      P.glitch = 0.7 * decay(H.textPrecision, 4) * (f < H.textPrecision + 10 ? 1 : 0) + 0.4 * decay(H.textReal, 3) * (f < 134 ? 1 : 0);
      if (f >= 222 && f < 240) {
        const v = 7.5 * (B.snap(seg(f, 222, 238)) - B.snap(seg(f - 1, 222, 238)));
        P.dir = [-v * 0.06, 0]; P.split = [v * 0.004, 0]; P.S = 10; P.shutter = 0.7;
        P.speed = clamp(v * 0.8); P.speedMode = 1; P.speedDir = [1, 0]; P.speedDensity = 120;
      }
      // inhale: darken + desaturate; then rocket with zoom blur and focus lines
      const inh = seg(f, 258, 264);
      P.exposure = 1 - 0.45 * E.outCubic(inh) + 0.6 * E.inExpo(seg(f, 264, 270));
      P.sat = 1.05 - 0.6 * inh;
      if (f >= 262) {
        const r = E.inExpo(seg(f, 262, 270));
        P.zoom = 0.42 * r; P.zoomC = this.uv(V(0, 0, 0)); P.speed = 0.8 * r; P.speedInner = 0.3; P.chroma += 2 * r;
        P.S = 12; P.shutter = 0.9;
      }
      P.vig = 0.55 + 0.35 * inh;
    } else if (f < 366) {
      // ---- MAIN DROP
      const D = H.drop, c = this.uv(V(0, 0, 0));
      if (f === D) { P.bw = 1; P.speed = 1; P.speedInner = 0.3; P.speedDensity = 200; P.split = [0.006, 0]; P.bwThresh = 0.4; P.S = 4; }
      else if (f === D + 1) { P.ink = 1; P.speed = 1; P.speedInner = 0.32; P.speedDensity = 160; P.inkThresh = 0.42; P.S = 4; }
      else if (f === D + 2) { P.chroma = 3.0; P.split = [0.012, 0.003]; P.zoom = 0.16; P.zoomC = c; P.flash = 0.02; P.lens = -0.25; P.S = 4; }
      else {
        P.chroma = 0.3 + 2.4 * decay(D + 3, 7) + 0.6 * kb;
        P.split = [0.008 * decay(D + 3, 5), 0];
        P.zoom = 0.12 * decay(D + 3, 5) + 0.02 * kb; P.zoomC = c;
        P.lens = -0.2 * decay(D + 3, 8);
        P.S = f < D + 40 ? 12 : 7; P.shutter = f < D + 40 ? 0.8 : 0.55;
      }
      if (f >= D + 2) {
        const t = seg(f, D + 2, D + 40);
        P.shock = [c[0], c[1], 0.02 + 1.25 * E.outCubic(t), 0.065 * (1 - t) ** 2];
        P.shockW = 0.07;
      }
      P.god = 0.25 + 0.12 * kb; P.godC = c;
      P.bloom = 0.6 + 0.25 * kb;
      // whip-pan out
      const w = E.inQuint(seg(f, 348, 366));
      if (w > 0) { P.dir = [-0.35 * w, 0]; P.speed = Math.max(P.speed, 0.9 * w); P.speedMode = 1; P.speedDir = [1, 0]; P.speedDensity = 110; P.S = 12; P.shutter = 1.0; P.split = [0.01 * w, 0]; }
    } else if (f < 558) {
      // ---- EXECUTION SEQUENCE
      P.chroma = 0.3 + 0.5 * kb;
      P.bloom = 0.55 + 0.2 * kb;
      const wi = 1 - B.whipOut(seg(f, 366, 384));
      if (wi > 0.02) { P.dir = [-0.3 * wi, 0]; P.speedMode = 1; P.speedDir = [1, 0]; P.speed = 0.8 * wi; P.speedDensity = 110; P.S = 12; P.shutter = 0.9; }
      const a = H.textUNC;
      if (f >= a && f < a + 14) { P.zoom = Math.max(P.zoom, 0.3 * (1 - seg(f, a, a + 12))); P.zoomC = [0.5, 0.53]; P.S = 12; P.chroma += 1.2 * (1 - seg(f, a, a + 14)); }
      if (f >= 404 && f < 414) { P.zoom = 0.28 * E.inQuint(seg(f, 404, 414)); P.zoomC = [0.5, 0.53]; P.S = 10; }
      const s = H.textSUNC;
      if (f >= s - 2 && f < 462) {
        const X = ff => 7 * (1 - B.snap(seg(ff, s, s + 16))) - 8 * E.inQuint(seg(ff, 453, 462));
        const v = X(f) - X(f - 1);
        if (Math.abs(v) > 0.01) { P.dir = [-v * 0.045, 0]; P.split = [v * 0.003, 0]; P.S = 12; P.shutter = 0.8; P.speed = clamp(Math.abs(v) * 0.6); P.speedMode = 1; P.speedDir = [1, 0]; P.speedDensity = 120; }
      }
      const st = H.textStability;
      if (f >= st && f < st + 22) { P.glitch = 1.0 * Math.exp(-(f - st) / 5); P.split = [0.01 * Math.exp(-(f - st) / 5), 0]; P.S = 10; }
      const k = H.textOneKey;
      if (f >= k) { P.flash = 0.05 * decay(k, 2); P.chroma += 1.5 * decay(k, 5); P.lens = -0.12 * decay(k, 6); }
      const dv = E.inExpo(seg(f, 530, 558));
      if (dv > 0) { P.zoom = Math.max(P.zoom, 0.45 * dv); P.zoomC = [0.5, 0.52]; P.speed = Math.max(P.speed, dv); P.speedMode = 0; P.speedInner = 0.25; P.S = 12; P.shutter = 0.9; P.chroma += 2 * dv; }
    } else if (f < 750) {
      // ---- CLIMAX
      P.chroma = 0.4 + 0.5 * kb;
      P.bloom = 0.6 + 0.25 * kb;
      P.streak = 0.5;
      const e = H.climaxEntry;
      if (f === e) { P.bw = 1; P.speed = 1; P.speedInner = 0.22; P.speedDensity = 220; P.bwThresh = 0.3; }
      else if (f < e + 22) { P.zoom = 0.32 * (1 - E.outCubic(seg(f, e + 1, e + 22))); P.zoomC = [0.5, 0.5]; P.chroma += 2.0 * decay(e + 1, 6); P.S = 12; P.shutter = 0.9; P.speed = 0.6 * decay(e + 1, 8); }
      const I = H.inkImpact;
      if (f === I) { P.ink = 1; P.speed = 1; P.speedInner = 0.3; P.inkThresh = 0.3; P.S = 4; }
      else if (f === I + 1) { P.ink = 1; P.neg = 1; P.speed = 1; P.speedInner = 0.34; P.inkThresh = 0.3; P.speedSeed += 7; P.S = 4; }
      else if (f === I + 2) { P.split = [0.014, -0.004]; P.chroma = 3; P.zoom = 0.2; P.lens = -0.25; P.S = 4; }
      else if (f > I + 2 && f < I + 30) {
        P.split = [0.01 * decay(I + 3, 5), 0]; P.chroma += 2.2 * decay(I + 3, 7);
        const t = seg(f, I + 2, I + 34);
        P.shock = [0.5, 0.5, 0.02 + 1.2 * E.outCubic(t), 0.06 * (1 - t) ** 2];
        P.S = 12; P.shutter = 0.8;
      }
      const acc = E.inQuart(seg(f, 702, 738));
      if (acc > 0 && f < 738) { P.speed = Math.max(P.speed, 0.25 + 0.75 * acc); P.speedInner = 0.32 - 0.1 * acc; P.zoom = Math.max(P.zoom, 0.22 * acc); P.zoomC = [0.5, 0.5]; P.chroma += 1.5 * acc; P.lens = 0.2 * acc; P.S = 10; P.shutter = 0.8; }
      if (f >= 738) {
        const cv = E.inOutCubic(seg(f, 738, 744)), r = E.inExpo(seg(f, 744, 750));
        P.exposure = 1 - 0.35 * cv + 0.8 * r; P.vig = 0.55 + 0.4 * cv; P.sat = 1.05 - 0.5 * cv;
        P.zoom = 0.5 * r; P.zoomC = this.uv(V(0, 0, -(141.5) - 6)); P.speed = 0.9 * r; P.speedInner = 0.25; P.S = 12; P.shutter = 0.9;
      }
      P.god = 0.1 + 0.25 * seg(f, 700, 748); P.godC = this.uv(V(0, 0, -(141.5) - 6));
    } else {
      // ---- FINAL REVEAL
      const F0 = H.finalImpact, c = this.uv(V(0, 1.0, 0));
      if (f === F0) { P.ink = 1; P.speed = 1; P.speedInner = 0.3; P.inkThresh = 0.4; P.S = 4; }
      else if (f === F0 + 1) { P.bw = 1; P.speed = 1; P.speedInner = 0.34; P.bwThresh = 0.38; P.speedSeed += 5; P.S = 4; }
      else if (f === F0 + 2) { P.chroma = 3; P.split = [0.012, 0.004]; P.zoom = 0.18; P.zoomC = c; P.flash = 0.02; P.lens = -0.25; P.S = 4; }
      else {
        P.chroma = 0.2 + 2.2 * decay(F0 + 3, 7);
        P.split = [0.008 * decay(F0 + 3, 5), 0];
        P.zoom = 0.12 * decay(F0 + 3, 5); P.zoomC = c;
        P.lens = -0.2 * decay(F0 + 3, 8);
        P.S = f < F0 + 40 ? 10 : 6; P.shutter = 0.6;
      }
      if (f >= F0 + 2) { const t = seg(f, F0 + 2, F0 + 44); P.shock = [c[0], c[1], 0.02 + 1.3 * E.outCubic(t), 0.06 * (1 - t) ** 2]; }
      P.god = 0.12; P.godC = this.uv(V(0, 1.6, -0.5));
      P.fade = E.inOutCubic(seg(f, H.fadeStart, 899));
      P.vig = 0.6;
    }
    return P;
  }
}
