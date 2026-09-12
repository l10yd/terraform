/**
 * HexTerrain: one InstancedMesh for the whole planet surface.
 * Pointy-top hex prisms with corner color blending (colors shared between
 * touching tiles → biomes melt into each other, no harsh grid art).
 * Per-tile palette lives in a DataTexture (slots: 0 center, 1..6 corners, 7 side).
 */
import * as THREE from 'three';
import { hexCorners } from '../core/hex';

export const HEX_KIND = {
  ROCK: 0, LIFE: 1, SAND: 2, SNOW: 3, ECO: 4, BASIN: 5,
} as const;

export interface HexInstanceData {
  /** world position of the tile top center */
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  depth: number;
  /** texture row = tile index */
  index: number;
  kind: number;
  emissive: number;
  flash: number;
  dep: number; // 0..1
  geo: number; // 0..1
  suit: number; // 0..1
  moist: number; // 0..1
  seed: number;
}

const VERT = /* glsl */ `
attribute float aSlot;      // color slot: 0..6 (top), 7 (wall top), 8 (wall bottom)
attribute float aType;      // 0 top face, 1 wall
attribute float iIndex;
attribute vec4 iFlags;      // kind, emissive, flash, spare
attribute vec4 iInfo;       // dep, geo, suit, moist
attribute float iDepth;
attribute float iSeed;

uniform sampler2D uColorTex;
uniform float uTexRows;
uniform vec3 uSunDir;

varying vec3 vCol;
varying vec3 vNrm;
varying vec3 vWorld;
varying vec2 vLocal;
varying vec4 vFlags;
varying vec4 vInfo;
varying float vType;
varying float vSeed;

vec3 slotColor(float slot) {
  float u = (clamp(slot, 0.0, 7.0) + 0.5) / 8.0;
  float v = (iIndex + 0.5) / uTexRows;
  return texture2D(uColorTex, vec2(u, v)).rgb;
}

void main() {
  vec3 p = position;
  float slot = aSlot;
  vec3 col = slotColor(slot);
  if (aType > 0.5) {
    // wall vertex: local y from 0 (top) to -1 (bottom) scaled by depth
    p = vec3(p.x, -max(p.y, 0.0) * iDepth, p.z);
  }
  vLocal = position.xz;
  vec4 world = instanceMatrix * vec4(p, 1.0);
  vWorld = world.xyz;
  vNrm = normalize(mat3(instanceMatrix) * normal);
  vCol = col;
  vFlags = iFlags;
  vInfo = iInfo;
  vType = aType;
  vSeed = iSeed;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const FRAG = /* glsl */ `
precision highp float;
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uSkyCol;
uniform vec3 uAmbCol;
uniform vec3 uFogCol;
uniform float uFogK;
uniform float uGrid;
uniform float uIce;
uniform float uDayLight;

varying vec3 vCol;
varying vec3 vNrm;
varying vec3 vWorld;
varying vec2 vLocal;
varying vec4 vFlags;
varying vec4 vInfo;
varying float vType;
varying float vSeed;

float hash21(vec2 p) {
  p = fract(p * vec2(233.34, 851.73));
  p += dot(p, p + 23.45);
  return fract(p.x * p.y);
}

float hexEdge(vec2 p) {
  // max projection on the 3 edge-normal axes; 0.866 at the edge (inradius R=1)
  float e = max(abs(p.x), max(abs(0.5 * p.x + 0.866 * p.y), abs(0.5 * p.x - 0.866 * p.y)));
  return e; // 0.866 == on edge
}

void main() {
  vec3 col = vCol;
  float kind = vFlags.x;
  bool top = vType < 0.5;

  if (top) {
    float n1 = hash21(vWorld.xz * 2.7 + vSeed * 13.0);
    float n2 = hash21(vWorld.xz * 9.1 + vSeed);
    col *= 0.93 + 0.14 * n1;

    if (kind > 0.5 && kind < 1.5) {
      // life: directional clumpiness + flowers
      float clump = smoothstep(0.42, 0.62, n1);
      col = mix(col, col * vec3(0.82, 1.06, 0.8), clump * vInfo.z);
      float fl = step(0.977, n2) * vInfo.z * vInfo.z;
      col = mix(col, vec3(0.95, 0.85, 0.55), fl * 0.8);
    } else if (kind < 0.5) {
      // rock: strata streaks
      float st = smoothstep(0.5, 0.56, fract(vWorld.z * 1.9 + vSeed));
      col *= 0.94 + 0.1 * st;
    } else if (kind > 1.5 && kind < 2.5) {
      // sand dunes
      float d = sin(vWorld.x * 3.4 + vWorld.z * 2.2 + vSeed * 6.0);
      col *= 0.95 + 0.08 * d;
    } else if (kind > 2.5 && kind < 3.5) {
      // snow sparkle
      col += vec3(0.06) * step(0.965, n2);
    } else if (kind > 3.5 && kind < 4.5) {
      // ecozone: engineered hex rings
      float ring = abs(fract(length(vLocal) * 4.2 + uTime * 0.05) - 0.5);
      col += vec3(0.10, 0.22, 0.16) * smoothstep(0.06, 0.0, ring) * vInfo.z;
    } else {
      // basin
      col *= 0.9 + 0.1 * n1;
    }

    // mineral deposit sparkles
    float depT = vInfo.x;
    col += vec3(0.45, 0.55, 0.8) * step(1.0 - 0.028 * depT * 3.0, n2) * (depT > 0.1 ? 1.0 : 0.0);
    // geothermal glow
    float geo = vInfo.y;
    float crack = smoothstep(0.86, 0.98, hash21(vWorld.xz * 5.3 + 7.0));
    col += vec3(1.0, 0.42, 0.12) * crack * geo * (0.6 + 0.4 * sin(uTime * 2.2 + vSeed * 9.0));
    // moisture darkening
    col *= 1.0 - 0.16 * vInfo.w * (top ? 1.0 : 0.0);
    // wilt only when unsuitable AND young: an established biome keeps its color
    float established = clamp(vInfo.z + vFlags.w, 0.0, 1.0); // suit + dev presence
    col = mix(col * vec3(0.66, 0.60, 0.48), col, 0.30 + 0.70 * established);
    // living biomes: vividness rises with development
    if (kind > 0.5 && kind < 1.5) {
      col = mix(col, col * vec3(0.94, 1.10, 0.90) + vec3(0.0, 0.02, 0.0), vFlags.w * 0.6);
    }
    // ice tint on cold world
    col = mix(col, col * vec3(0.8, 0.9, 1.06) + vec3(0.10, 0.13, 0.16), uIce * step(1.8, vInfo.w * 3.2 + 0.0));
  } else {
    // walls: strata bands + darkening downward
    float depthT = clamp(-vLocal.y, 0.0, 1.0);
    col *= (0.72 - 0.3 * depthT);
    float band = smoothstep(0.5, 0.55, fract((vWorld.y + vSeed) * 7.0));
    col *= 0.96 + 0.08 * band;
  }

  // placement flash (positive = amber success, negative = red dieback)
  float fl = vFlags.z;
  vec3 flashCol = fl >= 0.0 ? vec3(1.0, 0.78, 0.4) : vec3(1.0, 0.3, 0.18);
  col += flashCol * abs(fl) * (0.72 + 0.28 * sin(uTime * 5.5));

  // lighting
  float lam = max(dot(vNrm, normalize(uSunDir)), 0.0);
  float hemi = 0.5 + 0.5 * vNrm.y * (top ? 1.0 : 0.0);
  vec3 light = uAmbCol * (0.55 + 0.45 * hemi) * (0.4 + 0.6 * uDayLight)
             + uSunCol * lam * (0.25 + 0.75 * uDayLight);
  vec3 lit = col * light;
  // night emissive for structures
  float night = clamp(1.0 - lam * 2.0, 0.0, 1.0);
  lit += vec3(1.0, 0.75, 0.45) * vFlags.y * night * 0.5;
  // ecozone night glow
  lit += vec3(0.3, 0.9, 0.6) * step(3.5, kind) * (kind < 4.5 ? 1.0 : 0.0) * night * 0.12;

  // grid lines (emerge only when useful)
  if (top && uGrid > 0.0) {
    float e = hexEdge(vLocal);
    float line = smoothstep(0.795, 0.866, e);
    lit = mix(lit, lit * 0.3 + vec3(0.10, 0.16, 0.2), line * uGrid);
  }

  // distance fog
  float d = length(vWorld - cameraPosition);
  float fog = 1.0 - exp(-uFogK * d * d);
  lit = mix(lit, uFogCol, clamp(fog, 0.0, 0.85));

  gl_FragColor = vec4(lit, 1.0);
  #include <colorspace_fragment>
}
`;

export class HexTerrain {
  readonly mesh: THREE.InstancedMesh;
  readonly colorTex: THREE.DataTexture;
  private iFlags: THREE.InstancedBufferAttribute;
  private iInfo: THREE.InstancedBufferAttribute;
  private iDepth: THREE.InstancedBufferAttribute;

  constructor(count: number) {
    const geo = buildHexPrism();

    const idx = new Float32Array(count);
    const flags = new Float32Array(count * 4);
    const info = new Float32Array(count * 4);
    const depth = new Float32Array(count);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      idx[i] = i;
      seed[i] = Math.random();
    }
    geo.setAttribute('iIndex', new THREE.InstancedBufferAttribute(idx, 1));
    geo.setAttribute('iFlags', new THREE.InstancedBufferAttribute(flags, 4));
    geo.setAttribute('iInfo', new THREE.InstancedBufferAttribute(info, 4));
    geo.setAttribute('iDepth', new THREE.InstancedBufferAttribute(depth, 1));
    geo.setAttribute('iSeed', new THREE.InstancedBufferAttribute(seed, 1));

    // color texture: 8 slots wide × count rows
    const data = new Uint8Array(8 * count * 4);
    this.colorTex = new THREE.DataTexture(data, 8, count, THREE.RGBAFormat);
    this.colorTex.magFilter = THREE.NearestFilter;
    this.colorTex.minFilter = THREE.NearestFilter;
    this.colorTex.needsUpdate = true;

    const material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uColorTex: { value: this.colorTex },
        uTexRows: { value: count },
        uTime: { value: 0 },
        uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3) },
        uSunCol: { value: new THREE.Color(1.0, 0.93, 0.82) },
        uAmbCol: { value: new THREE.Color(0.35, 0.4, 0.48) },
        uSkyCol: { value: new THREE.Color(0.3, 0.4, 0.55) },
        uFogCol: { value: new THREE.Color(0.05, 0.06, 0.08) },
        uFogK: { value: 0.0016 },
        uGrid: { value: 0.0 },
        uIce: { value: 0.0 },
        uDayLight: { value: 1.0 },
      },
    });

    this.mesh = new THREE.InstancedMesh(geo, material, count);
    this.mesh.frustumCulled = false;
    this.iFlags = geo.getAttribute('iFlags') as THREE.InstancedBufferAttribute;
    this.iInfo = geo.getAttribute('iInfo') as THREE.InstancedBufferAttribute;
    this.iDepth = geo.getAttribute('iDepth') as THREE.InstancedBufferAttribute;
    this.mesh.castShadow = false;
  }

  setColorRow(i: number, rgb: number[]): void {
    // rgb: array of 8 vec3 as flat [r,g,b]*8
    const d = this.colorTex.image.data as unknown as Uint8Array;
    const base = i * 8 * 4;
    for (let s = 0; s < 8; s++) {
      d[base + s * 4] = Math.round(Math.max(0, Math.min(1, rgb[s * 3])) * 255);
      d[base + s * 4 + 1] = Math.round(Math.max(0, Math.min(1, rgb[s * 3 + 1])) * 255);
      d[base + s * 4 + 2] = Math.round(Math.max(0, Math.min(1, rgb[s * 3 + 2])) * 255);
      d[base + s * 4 + 3] = 255;
    }
  }

  flushColors(): void {
    this.colorTex.needsUpdate = true;
  }

  setInstance(i: number, pos: THREE.Vector3, quat: THREE.Quaternion, depth: number,
    kind: number, emissive: number, flash: number, dep: number, geo: number, suit: number, moist: number, devPresence: number): void {
    const m = new THREE.Matrix4().compose(pos, quat, new THREE.Vector3(1, 1, 1));
    this.mesh.setMatrixAt(i, m);
    const f = this.iFlags.array as Float32Array;
    f[i * 4] = kind; f[i * 4 + 1] = emissive; f[i * 4 + 2] = flash; f[i * 4 + 3] = devPresence;
    const inf = this.iInfo.array as Float32Array;
    inf[i * 4] = dep; inf[i * 4 + 1] = geo; inf[i * 4 + 2] = suit; inf[i * 4 + 3] = moist;
    (this.iDepth.array as Float32Array)[i] = depth;
  }

  flush(): void {
    this.mesh.instanceMatrix.needsUpdate = true;
    this.iFlags.needsUpdate = true;
    this.iInfo.needsUpdate = true;
    this.iDepth.needsUpdate = true;
  }

  get mat(): THREE.ShaderMaterial {
    return this.mesh.material as THREE.ShaderMaterial;
  }

  setFlash(i: number, v: number): void {
    (this.iFlags.array as Float32Array)[i * 4 + 2] = v;
    this.iFlags.needsUpdate = true;
  }
  iFlagsFlush(): void {
    this.iFlags.needsUpdate = true;
  }
  getFlash(i: number): number {
    return (this.iFlags.array as Float32Array)[i * 4 + 2];
  }
}

/**
 * Geometry: 25 vertices — top fan (center + 6 ring) + 6 wall quads.
 * aSlot: color slot per vertex; aType: 0 top / 1 wall.
 */
function buildHexPrism(): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  const corners = hexCorners();
  const pos: number[] = [];
  const nrm: number[] = [];
  const slot: number[] = [];
  const typ: number[] = [];
  const idx: number[] = [];

  // top: center
  pos.push(0, 0, 0); nrm.push(0, 1, 0); slot.push(0); typ.push(0);
  for (let k = 0; k < 6; k++) {
    pos.push(corners[k].x, 0, corners[k].z); nrm.push(0, 1, 0); slot.push(1 + k); typ.push(0);
    // CCW seen from +Y (geometric normal must point up, or FrontSide culls it)
    idx.push(0, 1 + ((k + 1) % 6), 1 + k);
  }
  // walls: quad per edge, vertices with y 0 (top) and -1 (bottom marker)
  let v = pos.length / 3;
  for (let k = 0; k < 6; k++) {
    const a = corners[k];
    const b = corners[(k + 1) % 6];
    const mx = (a.x + b.x) / 2;
    const mz = (a.z + b.z) / 2;
    const len = Math.hypot(mx, mz) || 1;
    const nx = mx / len;
    const nz = mz / len;
    pos.push(a.x, 0, a.z, b.x, 0, b.z, b.x, 1, b.z, a.x, 1, a.z);
    for (let q = 0; q < 4; q++) { nrm.push(nx, 0, nz); typ.push(1); }
    slot.push(7, 7, 8, 8);
    idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
    v += 4;
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('aSlot', new THREE.Float32BufferAttribute(slot, 1));
  geo.setAttribute('aType', new THREE.Float32BufferAttribute(typ, 1));
  geo.setIndex(idx);
  return geo;
}
