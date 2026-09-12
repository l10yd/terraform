/**
 * Water layer: instanced flat hexes at the sea line for ocean/river tiles,
 * with animated waves, sparkle and an ice blend driven by planet temperature.
 */
import * as THREE from 'three';
import { hexCorners } from '../core/hex';

const VERT = /* glsl */ `
attribute vec3 iCol;
attribute vec3 iInfo; // kind(0 ocean 1 river), seed, unused
uniform float uTime;
uniform float uFreeze;
varying vec3 vCol;
varying vec3 vNrm;
varying vec3 vWorld;
varying vec3 vInfo;

void main() {
  vec3 p = position;
  vCol = iCol;
  vInfo = iInfo;
  float seed = iInfo.y;
  vec4 world0 = instanceMatrix * vec4(p, 1.0);
  float w = iInfo.x < 0.5 ? 1.0 : 1.4;
  float frz = uFreeze;
  if (frz < 0.98) {
    world0.y += (sin(world0.x * 3.1 + uTime * 1.9 + seed * 9.0) * 0.022
              + sin(world0.z * 4.3 - uTime * 1.4 + seed * 5.0) * 0.018) * w * (1.0 - frz);
  }
  float dx = cos(world0.x * 3.1 + uTime * 1.9 + seed * 9.0) * 0.0682 * w;
  float dz = cos(world0.z * 4.3 - uTime * 1.4 + seed * 5.0) * 0.0774 * w;
  vNrm = normalize(mat3(instanceMatrix) * normalize(vec3(-dx, 1.0, -dz)));
  vWorld = world0.xyz;
  gl_Position = projectionMatrix * viewMatrix * world0;
}
`;

const FRAG = /* glsl */ `
precision highp float;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uAmbCol;
uniform vec3 uFogCol;
uniform float uFogK;
uniform float uTime;
uniform float uFreeze;
uniform vec3 uIceCol;
varying vec3 vCol;
varying vec3 vNrm;
varying vec3 vWorld;
varying vec3 vInfo;

float hash21(vec2 p) {
  p = fract(p * vec2(233.34, 851.73));
  p += dot(p, p + 23.45);
  return fract(p.x * p.y);
}

void main() {
  vec3 col = vCol;
  vec3 N = normalize(vNrm);
  vec3 L = normalize(uSunDir);
  vec3 V = normalize(cameraPosition - vWorld);
  float lam = max(dot(N, L), 0.0);
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(N, H), 0.0), 40.0);
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);

  col *= uAmbCol * 0.8 + uSunCol * lam * 0.9;
  col += uSunCol * spec * 0.8 * (1.0 - uFreeze);
  col += vec3(0.25, 0.4, 0.55) * fres * 0.35;

  float sp = step(0.995, hash21(floor(vWorld.xz * 40.0) + fract(uTime * 0.37)));
  col += vec3(0.9) * sp * (1.0 - uFreeze) * max(lam, 0.1);

  col = mix(col, uIceCol + vec3(0.5) * fres + vec3(0.3) * spec * 0.5, uFreeze);
  float rip = sin(vWorld.x * 9.0 + vWorld.z * 7.0 + uTime * (vInfo.x > 0.5 ? 3.5 : 1.2) + vInfo.y * 20.0);
  col += vec3(0.05, 0.08, 0.1) * rip * 0.5 * (1.0 - uFreeze);

  float d = length(vWorld - cameraPosition);
  float fog = 1.0 - exp(-uFogK * d * d);
  col = mix(col, uFogCol, clamp(fog, 0.0, 0.8));
  gl_FragColor = vec4(col, 0.94);
  #include <colorspace_fragment>
}
`;

export class WaterLayer {
  readonly mesh: THREE.InstancedMesh;
  private iCol: THREE.InstancedBufferAttribute;
  private iInfo: THREE.InstancedBufferAttribute;
  private dummy = new THREE.Object3D();
  private used = 0;
  private cap: number;

  constructor(maxTiles: number) {
    this.cap = maxTiles;
    const corners = hexCorners();
    const pos: number[] = [0, 0, 0];
    const nrm: number[] = [];
    for (const c of corners) pos.push(c.x, 0, c.z);
    for (let k = 0; k < 7; k++) nrm.push(0, 1, 0);
    const idx: number[] = [];
    for (let k = 0; k < 6; k++) idx.push(0, 1 + ((k + 1) % 6), 1 + k); // CCW from +Y
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setIndex(idx);
    this.iCol = new THREE.InstancedBufferAttribute(new Float32Array(maxTiles * 3).fill(0.2), 3);
    this.iInfo = new THREE.InstancedBufferAttribute(new Float32Array(maxTiles * 3), 3);
    geo.setAttribute('iCol', this.iCol);
    geo.setAttribute('iInfo', this.iInfo);

    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      uniforms: {
        uTime: { value: 0 },
        uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3) },
        uSunCol: { value: new THREE.Color(1.0, 0.93, 0.82) },
        uAmbCol: { value: new THREE.Color(0.4, 0.46, 0.55) },
        uFogCol: { value: new THREE.Color(0.05, 0.06, 0.08) },
        uFogK: { value: 0.0016 },
        uFreeze: { value: 0 },
        uIceCol: { value: new THREE.Color(0.62, 0.72, 0.8) },
      },
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, maxTiles);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
  }

  begin(): void {
    this.used = 0;
  }

  add(pos: THREE.Vector3, quat: THREE.Quaternion, scale: number, col: [number, number, number], kind: number, seed: number): void {
    if (this.used >= this.cap) return;
    const i = this.used++;
    this.dummy.position.copy(pos);
    this.dummy.quaternion.copy(quat);
    this.dummy.scale.set(scale, 1, scale);
    this.dummy.updateMatrix();
    this.mesh.setMatrixAt(i, this.dummy.matrix);
    this.iCol.setXYZ(i, col[0], col[1], col[2]);
    this.iInfo.setXYZ(i, kind, seed, 0);
  }

  end(): void {
    this.mesh.count = this.used;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.iCol.needsUpdate = true;
    this.iInfo.needsUpdate = true;
  }

  get mat(): THREE.ShaderMaterial {
    return this.mesh.material as THREE.ShaderMaterial;
  }
}
