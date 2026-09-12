/**
 * Smooth strategic camera: pan, zoom-to-cursor, yaw orbit, all damped.
 */
import * as THREE from 'three';

export class StrategicCamera {
  readonly cam: THREE.PerspectiveCamera;
  target = new THREE.Vector3(0, 0, 0);
  private dTarget = new THREE.Vector3(0, 0, 0);
  yaw = 0;
  private dYaw = 0;
  pitch = 0.95;
  private dPitch = 0.95;
  dist = 26;
  private dDist = 26;
  worldRadius: number;
  private shakeT = 0;
  private shakeAmp = 0;
  keys = new Set<string>();

  constructor(aspect: number, worldRadius: number) {
    this.cam = new THREE.PerspectiveCamera(46, aspect, 0.1, 900);
    this.worldRadius = worldRadius;
  }

  resize(aspect: number): void {
    this.cam.aspect = aspect;
    this.cam.updateProjectionMatrix();
  }

  panBy(dx: number, dz: number): void {
    const f = this.dDist / 22;
    const sin = Math.sin(this.dYaw);
    const cos = Math.cos(this.dYaw);
    this.dTarget.x += (dx * cos - dz * sin) * f;
    this.dTarget.z += (dx * sin + dz * cos) * f;
    this.clampTarget();
  }

  zoomBy(mult: number, cursorWorld?: THREE.Vector3): void {
    this.dDist = Math.max(7, Math.min(this.worldRadius * 2.6, this.dDist * mult));
    if (cursorWorld) {
      const to = new THREE.Vector2(
        cursorWorld.x - this.dTarget.x,
        cursorWorld.z - this.dTarget.z,
      );
      const k = 1 - Math.min(1, (this.dDist - 7) / this.dDist);
      this.dTarget.x += to.x * k * 0.35;
      this.dTarget.z += to.y * k * 0.35;
      this.clampTarget();
    }
  }

  orbit(dyaw: number, dpitch = 0): void {
    this.dYaw += dyaw;
    this.dPitch = Math.max(0.38, Math.min(1.45, this.dPitch + dpitch));
  }

  focus(pos: THREE.Vector3, keepDist = false): void {
    this.dTarget.set(pos.x, 0, pos.z);
    if (!keepDist) this.dDist = Math.min(this.dDist, 16);
    this.clampTarget();
  }

  snapFocus(pos: THREE.Vector3): void {
    this.dTarget.set(pos.x, 0, pos.z);
    this.target.copy(this.dTarget);
    this.clampTarget();
  }

  resetView(dist: number): void {
    this.dTarget.set(0, 0, 0);
    this.target.set(0, 0, 0);
    this.dDist = dist;
    this.dYaw = 0;
    this.dPitch = 0.95;
  }

  private clampTarget(): void {
    const r = Math.hypot(this.dTarget.x, this.dTarget.z);
    const max = this.worldRadius * 0.92;
    if (r > max) {
      this.dTarget.multiplyVectors(this.dTarget, new THREE.Vector3(max / r, 1, max / r));
    }
  }

  shake(amp = 0.14): void {
    this.shakeAmp = amp;
    this.shakeT = 0.5;
  }

  update(dt: number, reduceMotion: boolean): void {
    const k = 1 - Math.exp(-dt * 9);
    const kk = 1 - Math.exp(-dt * 5);
    // keyboard pan
    const panSpeed = 0.55 * (this.dDist / 22);
    if (this.keys.has('arrowleft') || this.keys.has('a')) this.panBy(-panSpeed * dt * 8, 0);
    if (this.keys.has('arrowright') || this.keys.has('d')) this.panBy(panSpeed * dt * 8, 0);
    if (this.keys.has('arrowup') || this.keys.has('w')) this.panBy(0, -panSpeed * dt * 8);
    if (this.keys.has('arrowdown') || this.keys.has('s')) this.panBy(0, panSpeed * dt * 8);
    if (this.keys.has('q')) this.orbit(-dt * 0.9);
    if (this.keys.has('e')) this.orbit(dt * 0.9);

    this.target.lerp(this.dTarget, reduceMotion ? 1 : k * 3);
    this.yaw += (this.dYaw - this.yaw) * kk * 3;
    this.pitch += (this.dPitch - this.pitch) * kk * 3;
    this.dist += (this.dDist - this.dist) * kk * 3;
    let shx = 0;
    let shy = 0;
    if (this.shakeT > 0 && !reduceMotion) {
      this.shakeT -= dt;
      const a = this.shakeAmp * this.shakeT * 2;
      shx = Math.sin(performance.now() * 0.09) * a;
      shy = Math.cos(performance.now() * 0.07) * a;
    }
    const cx = this.target.x + Math.sin(this.yaw) * Math.cos(this.pitch) * this.dist;
    const cy = Math.sin(this.pitch) * this.dist;
    const cz = this.target.z + Math.cos(this.yaw) * Math.cos(this.pitch) * this.dist;
    this.cam.position.set(cx + shx, Math.max(2.5, cy + shy), cz);
    this.cam.lookAt(this.target.x + shx * 0.5, this.target.y, this.target.z + shy * 0.5);
  }

  get groundPoint(): THREE.Vector3 {
    return this.dTarget.clone();
  }
}
