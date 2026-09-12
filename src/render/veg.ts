/**
 * Vegetation: instanced low-poly trees + grass tufts with wind sway.
 * Budgeted per quality preset; positions are hash-deterministic per tile.
 */
import * as THREE from 'three';
import { hash2d } from '../core/rng';

const VERT = /* glsl */ `
attribute vec3 iCol;
attribute float iSeed;
attribute float iScale;
uniform float uTime;
uniform float uWind;
varying vec3 vCol;
varying vec3 vNrm;
varying vec3 vWorld;
varying float vAO;

void main() {
  vec3 p = position;
  float h = clamp(p.y, 0.0, 1.0);
  float sway = sin(uTime * 1.7 + iSeed * 23.0) * 0.5 + sin(uTime * 2.9 + iSeed * 7.0) * 0.5;
  float amt = uWind * h * h * 0.09;
  p.x += sway * amt;
  p.z += sway * amt * 0.6;
  vAO = h;
  vCol = iCol;
  vec4 world = instanceMatrix * vec4(p * iScale, 1.0);
  vWorld = world.xyz;
  vNrm = normalize(mat3(instanceMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const FRAG = /* glsl */ `
precision highp float;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uAmbCol;
uniform vec3 uFogCol;
uniform float uFogK;
varying vec3 vCol;
varying vec3 vNrm;
varying vec3 vWorld;
varying float vAO;

void main() {
  vec3 N = normalize(vNrm);
  float lam = max(dot(N, normalize(uSunDir)), 0.0);
  vec3 col = vCol * (uAmbCol * (0.55 + 0.45 * vAO) + uSunCol * lam * 0.85);
  // rim light for canopy pop
  col += vCol * vec3(0.9, 1.0, 0.7) * pow(1.0 - abs(N.y), 3.0) * 0.12 * max(lam, 0.0);
  float d = length(vWorld - cameraPosition);
  float fog = 1.0 - exp(-uFogK * d * d);
  col = mix(col, uFogCol, clamp(fog, 0.0, 0.85));
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

function makeTreeGeo(): THREE.BufferGeometry {
  // low-poly conifer: trunk + two stacked cones, merged manually
  const parts: THREE.BufferGeometry[] = [];
  const trunk = new THREE.CylinderGeometry(0.045, 0.06, 0.34, 5);
  trunk.translate(0, 0.17, 0);
  const c1 = new THREE.ConeGeometry(0.21, 0.5, 6);
  c1.translate(0, 0.52, 0);
  const c2 = new THREE.ConeGeometry(0.14, 0.38, 6);
  c2.translate(0, 0.78, 0);
  parts.push(trunk, c1, c2);
  return mergeSimple(parts);
}

function makeBroadleafGeo(): THREE.BufferGeometry {
  const trunk = new THREE.CylinderGeometry(0.05, 0.07, 0.4, 5);
  trunk.translate(0, 0.2, 0);
  const crown = new THREE.IcosahedronGeometry(0.26, 0);
  crown.scale(1, 0.82, 1);
  crown.translate(0, 0.58, 0);
  return mergeSimple([trunk, crown]);
}

function makeTuftGeo(): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(0.07, 0.24, 4, 1, true);
  g.translate(0, 0.12, 0);
  return g;
}

function mergeSimple(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // minimal non-indexed merge with position + normal only
  const pos: number[] = [];
  const nrm: number[] = [];
  for (let g of parts) {
    if (g.index) g = g.toNonIndexed();
    const p = g.getAttribute('position').array;
    const n = g.getAttribute('normal').array;
    for (let i = 0; i < p.length; i++) pos.push(p[i]);
    for (let i = 0; i < n.length; i++) nrm.push(n[i]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  return geo;
}

class InstancedVeg {
  mesh: THREE.InstancedMesh;
  iCol: THREE.InstancedBufferAttribute;
  iSeed: THREE.InstancedBufferAttribute;
  iScale: THREE.InstancedBufferAttribute;
  used = 0;
  private cap: number;
  private dummy = new THREE.Object3D();

  constructor(geo: THREE.BufferGeometry, cap: number, mat: THREE.ShaderMaterial) {
    this.cap = cap;
    this.iCol = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    this.iSeed = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
    this.iScale = new THREE.InstancedBufferAttribute(new Float32Array(cap).fill(1), 1);
    geo.setAttribute('iCol', this.iCol);
    geo.setAttribute('iSeed', this.iSeed);
    geo.setAttribute('iScale', this.iScale);
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
  }

  add(x: number, y: number, z: number, rotY: number, scale: number, col: [number, number, number], seed: number): void {
    if (this.used >= this.cap) return;
    const i = this.used++;
    this.dummy.position.set(x, y, z);
    this.dummy.rotation.set(0, rotY, 0);
    this.dummy.updateMatrix();
    this.mesh.setMatrixAt(i, this.dummy.matrix);
    this.iCol.setXYZ(i, col[0], col[1], col[2]);
    this.iSeed.setX(i, seed);
    this.iScale.setX(i, scale);
  }

  flush(): void {
    this.mesh.count = this.used;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.iCol.needsUpdate = true;
    this.iSeed.needsUpdate = true;
    this.iScale.needsUpdate = true;
    this.used = 0;
  }
}

export interface VegTileInput {
  x: number; y: number; z: number;
  /** 0 none, 1 conifer forest, 2 broadleaf tropical, 3 tufts */
  kind: number;
  /** 0..3 development density */
  dev: number;
  suit: number;
  seed: number;
}

export class Vegetation {
  private conifers: InstancedVeg;
  private broadleaf: InstancedVeg;
  private tufts: InstancedVeg;
  mats: THREE.ShaderMaterial[];
  private densityScale: number;

  constructor(capTrees: number, capTufts: number, densityScale: number) {
    const mk = () => new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uWind: { value: 1 },
        uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3) },
        uSunCol: { value: new THREE.Color(1.0, 0.93, 0.82) },
        uAmbCol: { value: new THREE.Color(0.4, 0.46, 0.55) },
        uFogCol: { value: new THREE.Color(0.05, 0.06, 0.08) },
        uFogK: { value: 0.0016 },
      },
    });
    const m1 = mk(); const m2 = mk(); const m3 = mk();
    this.mats = [m1, m2, m3];
    this.conifers = new InstancedVeg(makeTreeGeo(), capTrees, m1);
    this.broadleaf = new InstancedVeg(makeBroadleafGeo(), capTrees, m2);
    this.tufts = new InstancedVeg(makeTuftGeo(), capTufts, m3);
    this.densityScale = densityScale;
  }

  get meshes(): THREE.InstancedMesh[] {
    return [this.conifers.mesh, this.broadleaf.mesh, this.tufts.mesh];
  }

  setTime(t: number, wind: number): void {
    for (const m of this.mats) {
      m.uniforms.uTime.value = t;
      m.uniforms.uWind.value = wind;
    }
  }

  rebuild(tiles: VegTileInput[]): void {
    const per = Math.ceil(8 * this.densityScale);
    for (const t of tiles) {
      if (t.kind === 0 || t.dev <= 0.15) continue;
      const density = Math.round(per * Math.min(1, t.dev / 3) * (0.4 + 0.6 * t.suit));
      for (let k = 0; k < density; k++) {
        const h1 = hash2d(t.seed * 100 + k, 17, 5);
        const h2 = hash2d(t.seed * 100 + k, 31, 7);
        const h3 = hash2d(t.seed * 100 + k, 43, 11);
        // jitter inside the hex (r < 0.75)
        const ang = h1 * Math.PI * 2;
        const rad = 0.22 + h2 * 0.55;
        const ox = Math.cos(ang) * rad;
        const oz = Math.sin(ang) * rad;
        const scale = 0.6 + h3 * 0.75;
        if (t.kind === 1) {
          const g = 0.16 + h3 * 0.1;
          this.conifers.add(t.x + ox, t.y, t.z + oz, h1 * 6.283, scale, [g * 0.6, g + h2 * 0.06, g * 0.45], h2 * 100);
        } else if (t.kind === 2) {
          const g = 0.2 + h3 * 0.12;
          this.broadleaf.add(t.x + ox, t.y, t.z + oz, h2 * 6.283, scale, [g * 0.5, g, g * 0.42], h1 * 100);
        } else {
          const dry = h3 > 0.7 ? 0.12 : 0;
          this.tufts.add(t.x + ox, t.y, t.z + oz, h1 * 6.283, scale * 1.15, [0.2 + dry + h2 * 0.08, 0.36 + h3 * 0.12, 0.14], h2 * 100);
        }
      }
    }
    this.conifers.flush();
    this.broadleaf.flush();
    this.tufts.flush();
  }
}
