/**
 * Particles: one Points system, all motion in the vertex shader (CPU cost ~0).
 * Kinds: 0 dust(desert) 1 mist(wetland) 2 snow(alpine high) 3 bugs(forest)
 *        4 spores(grass) 5 embers(geothermal) 6 spark(mineral) 7 water spray
 */
import * as THREE from 'three';

export const P_KIND_COLORS = [
  [0.55, 0.44, 0.3], // dust
  [0.55, 0.68, 0.7], // mist
  [0.9, 0.95, 1.0], // snow
  [0.9, 0.85, 0.4], // bugs (warm glow)
  [0.7, 0.85, 0.5], // spores
  [1.0, 0.5, 0.15], // embers
  [0.6, 0.75, 1.0], // mineral spark
  [0.65, 0.85, 0.95], // spray
];

const VERT = /* glsl */ `
attribute float iKind;
attribute float iSeed;
attribute float iSize;
uniform float uTime;
uniform vec3 uFogCol;
uniform float uFogK;
varying float vKind;
varying float vAlpha;
varying float vSeed;

void main() {
  vec3 p = position;
  float t = uTime + iSeed * 137.0;
  float life = fract(t * 0.08 + iSeed);
  float a = 1.0;
  int k = int(iKind + 0.5);
  if (k == 0) { // dust: horizontal drift, fade in/out
    p.x += sin(t * 0.5) * 0.7 + life * 1.2 - 0.6;
    p.z += cos(t * 0.4) * 0.5;
    p.y += sin(t * 0.9 + iSeed) * 0.06;
    a = sin(life * 3.1416);
  } else if (k == 1) { // mist: slow rise
    p.y += life * 0.5;
    p.x += sin(t * 0.3 + iSeed) * 0.25;
    a = sin(life * 3.1416) * 0.55;
  } else if (k == 2) { // snow: fall + sway
    p.y -= life * 0.9;
    p.x += sin(t * 0.8 + iSeed * 3.0) * 0.2;
    p.z += cos(t * 0.7 + iSeed * 5.0) * 0.2;
    a = 0.9;
  } else if (k == 3) { // bugs: lazy orbit
    p.x += sin(t * 0.9 + iSeed) * 0.4;
    p.z += cos(t * 0.7 + iSeed * 2.0) * 0.4;
    p.y += sin(t * 1.5 + iSeed * 4.0) * 0.14;
    a = 0.5 + 0.5 * sin(t * 2.0);
  } else if (k == 4) { // spores: rise gently
    p.y += life * 0.35;
    p.x += sin(t * 0.5 + iSeed) * 0.3;
    a = sin(life * 3.1416) * 0.8;
  } else if (k == 5) { // embers
    p.y += life * 1.1;
    p.x += sin(t * 2.0 + iSeed * 9.0) * 0.12;
    a = (1.0 - life) * 1.2;
  } else if (k == 6) { // mineral spark twinkle
    a = 0.4 + 0.6 * step(0.75, fract(t * 1.4 + iSeed));
  } else { // spray near shore
    p.y += sin(t * 2.2 + iSeed) * 0.08 + 0.03;
    p.x += cos(t * 1.7) * 0.15;
    a = sin(life * 3.1416) * 0.5;
  }
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_PointSize = iSize * (240.0 / max(2.0, -mv.z));
  vAlpha = a;
  vKind = iKind;
  vSeed = iSeed;
  float dist = length(mv.xyz);
  vAlpha *= exp(-uFogK * dist * dist * 0.55);
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
precision highp float;
uniform sampler2D uSprite;
varying float vKind;
varying float vAlpha;
varying float vSeed;
uniform vec3 uColors[8];

void main() {
  float s = texture2D(uSprite, gl_PointCoord).a;
  if (s * vAlpha < 0.01) discard;
  vec3 col = uColors[int(vKind + 0.5)];
  gl_FragColor = vec4(col * (0.8 + 0.4 * vSeed), s * vAlpha);
}
`;

function makeSprite(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(16, 16, 1, 16, 16, 15);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.5)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

export interface PInput {
  x: number; y: number; z: number;
  kind: number;
  size: number;
}

export class Particles {
  readonly mesh: THREE.Points;
  private cap: number;
  private posAttr: THREE.BufferAttribute;
  private kindAttr: THREE.BufferAttribute;
  private seedAttr: THREE.BufferAttribute;
  private sizeAttr: THREE.BufferAttribute;

  constructor(cap: number) {
    this.cap = cap;
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(new Float32Array(cap * 3), 3);
    this.kindAttr = new THREE.BufferAttribute(new Float32Array(cap), 1);
    this.seedAttr = new THREE.BufferAttribute(new Float32Array(cap), 1);
    this.sizeAttr = new THREE.BufferAttribute(new Float32Array(cap), 1);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('iKind', this.kindAttr);
    geo.setAttribute('iSeed', this.seedAttr);
    geo.setAttribute('iSize', this.sizeAttr);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uFogK: { value: 0.0016 },
        uFogCol: { value: new THREE.Color(0.05, 0.06, 0.08) },
        uSprite: { value: makeSprite() },
        uColors: { value: P_KIND_COLORS.map((c) => new THREE.Color(c[0], c[1], c[2])) },
      },
    });
    this.mesh = new THREE.Points(geo, mat);
    this.mesh.frustumCulled = false;
  }

  get mat(): THREE.ShaderMaterial {
    return this.mesh.material as THREE.ShaderMaterial;
  }

  rebuild(list: PInput[]): void {
    const n = Math.min(list.length, this.cap);
    for (let i = 0; i < n; i++) {
      const p = list[i];
      this.posAttr.setXYZ(i, p.x, p.y, p.z);
      this.kindAttr.setX(i, p.kind);
      this.seedAttr.setX(i, Math.random());
      this.sizeAttr.setX(i, p.size);
    }
    this.posAttr.needsUpdate = true;
    this.kindAttr.needsUpdate = true;
    this.seedAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
    this.mesh.geometry.setDrawRange(0, n);
  }

  setTime(t: number): void {
    this.mat.uniforms.uTime.value = t;
  }
}
