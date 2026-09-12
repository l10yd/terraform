/**
 * Overlay effects: valid-tile markers, hover ring, ghost preview,
 * placement shockwaves, combo flashes.
 */
import * as THREE from 'three';
import { hexCorners } from '../core/hex';

function hexFanGeometry(): THREE.BufferGeometry {
  const corners = hexCorners();
  const pos = [0, 0, 0];
  const nrm = [0, 1, 0];
  for (const c of corners) { pos.push(c.x, 0, c.z); nrm.push(0, 1, 0); }
  const idx: number[] = [];
  for (let k = 0; k < 6; k++) idx.push(0, 1 + ((k + 1) % 6), 1 + k); // CCW seen from +Y
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setIndex(idx);
  return geo;
}

const OVER_VERT = /* glsl */ `
attribute vec3 iCol;
attribute float iAlpha;
attribute float iPhase;
uniform float uTime;
varying vec2 vLocal;
varying vec3 vCol;
varying float vAlpha;
varying float vPhase;
void main() {
  vec4 world = instanceMatrix * vec4(position, 1.0);
  vLocal = position.xz;
  vCol = iCol;
  vAlpha = iAlpha;
  vPhase = iPhase;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const OVER_FRAG = /* glsl */ `
precision highp float;
uniform float uTime;
uniform float uBand; // 1 = ring band, 0 = filled
varying vec2 vLocal;
varying vec3 vCol;
varying float vAlpha;
varying float vPhase;

float hexE(vec2 p) {
  p = abs(p);
  return max(p.x, 0.5 * p.x + 0.866 * p.y);
}

void main() {
  vec2 ap = abs(vLocal);
  float r = max(ap.x, 0.5 * ap.x + 0.866 * ap.y); // hex metric, edge at 0.866
  float t = uTime + vPhase;
  float pulse = 0.65 + 0.35 * sin(t * 3.4);
  float a;
  if (uBand > 0.5) {
    float ring = smoothstep(0.62, 0.856, r) * (1.0 - smoothstep(0.856, 0.94, r));
    a = ring * vAlpha * pulse;
  } else {
    float fill = 1.0 - smoothstep(0.7, 0.856, r);
    a = fill * vAlpha * pulse;
  }
  if (a < 0.008) discard;
  gl_FragColor = vec4(vCol * (0.7 + 0.5 * pulse), a);
}
`;

class OverlayBatch {
  mesh: THREE.InstancedMesh;
  iCol: THREE.InstancedBufferAttribute;
  iAlpha: THREE.InstancedBufferAttribute;
  iPhase: THREE.InstancedBufferAttribute;
  private dummy = new THREE.Object3D();
  private used = 0;
  private cap: number;

  constructor(cap: number, band: boolean) {
    const geo = hexFanGeometry();
    this.iCol = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    this.iAlpha = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
    this.iPhase = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
    geo.setAttribute('iCol', this.iCol);
    geo.setAttribute('iAlpha', this.iAlpha);
    geo.setAttribute('iPhase', this.iPhase);
    const mat = new THREE.ShaderMaterial({
      vertexShader: OVER_VERT,
      fragmentShader: OVER_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uBand: { value: band ? 1 : 0 } },
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.cap = cap;
  }

  get mat(): THREE.ShaderMaterial {
    return this.mesh.material as THREE.ShaderMaterial;
  }

  begin(): void {
    this.used = 0;
  }

  add(pos: THREE.Vector3, quat: THREE.Quaternion, scale: number, col: THREE.Color, alpha: number, phase: number): void {
    if (this.used >= this.cap) return;
    const i = this.used++;
    this.dummy.position.copy(pos);
    this.dummy.position.y += 0.02;
    this.dummy.quaternion.copy(quat);
    this.dummy.scale.setScalar(scale);
    this.dummy.updateMatrix();
    this.mesh.setMatrixAt(i, this.dummy.matrix);
    this.iCol.setXYZ(i, col.r, col.g, col.b);
    this.iAlpha.setX(i, alpha);
    this.iPhase.setX(i, phase);
  }

  end(): void {
    this.mesh.count = this.used;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.iCol.needsUpdate = true;
    this.iAlpha.needsUpdate = true;
  }
}

/** Shockwave: expanding faded ring placed at a world position */
interface Wave {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  t: number;
  dur: number;
  scale: number;
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
}

export class FxLayer {
  /** filled soft markers for valid tiles */
  readonly valid: OverlayBatch;
  /** ring band markers (ghost preview / combo pulse) */
  readonly rings: OverlayBatch;
  /** selection ring (LineLoop) */
  readonly selRing: THREE.LineLoop;
  readonly hoverRing: THREE.LineLoop;
  private waves: Wave[] = [];
  private pool: Wave[] = [];

  constructor(scene: THREE.Scene) {
    this.valid = new OverlayBatch(420, false);
    this.rings = new OverlayBatch(160, true);
    scene.add(this.valid.mesh);
    scene.add(this.rings.mesh);

    const mkRing = (color: number, width: number) => {
      const corners = hexCorners();
      const pts = corners.map((c) => new THREE.Vector3(c.x * width, 0, c.z * width));
      pts.push(pts[0].clone());
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const line = new THREE.LineLoop(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
      line.visible = false;
      scene.add(line);
      return line;
    };
    this.selRing = mkRing(0xffc76b, 0.92);
    this.hoverRing = mkRing(0x8fd8ff, 0.86);
    for (let k = 0; k < 10; k++) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);}`,
        fragmentShader: `precision mediump float; varying vec2 vUv; uniform float uA; uniform vec3 uC;
          void main(){ float d = length(vUv - 0.5) * 2.0;
          float ring = smoothstep(0.55, 0.85, d) * (1.0 - smoothstep(0.85, 1.0, d));
          if (ring * uA < 0.01) discard;
          gl_FragColor = vec4(uC, ring * uA); }`,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uA: { value: 0 }, uC: { value: new THREE.Color(1, 0.8, 0.45) } },
      });
      const mesh = new THREE.Mesh(hexFanGeometry(), mat);
      mesh.visible = false;
      scene.add(mesh);
      this.pool.push({ mesh, mat, t: 0, dur: 1, scale: 1, pos: new THREE.Vector3(), quat: new THREE.Quaternion() });
    }
  }

  setTime(t: number): void {
    this.valid.mat.uniforms.uTime.value = t;
    this.rings.mat.uniforms.uTime.value = t;
  }

  shock(pos: THREE.Vector3, quat: THREE.Quaternion, color: THREE.Color, scale = 2.4, dur = 0.65): void {
    const w = this.pool.pop();
    if (!w) return;
    w.pos.copy(pos);
    w.quat.copy(quat);
    w.t = 0;
    w.dur = dur;
    w.scale = scale;
    (w.mat.uniforms.uC.value as THREE.Color).copy(color);
    w.mesh.visible = true;
    this.waves.push(w);
  }

  update(dt: number): void {
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      w.t += dt;
      const f = Math.min(1, w.t / w.dur);
      const s = 0.2 + f * w.scale;
      w.mesh.position.copy(w.pos);
      w.mesh.quaternion.copy(w.quat);
      w.mesh.scale.set(s, 1, s);
      w.mesh.rotateY(0);
      w.mat.uniforms.uA.value = (1 - f) * (1 - f);
      if (f >= 1) {
        w.mesh.visible = false;
        this.waves.splice(i, 1);
        this.pool.push(w);
      }
    }
  }
}
