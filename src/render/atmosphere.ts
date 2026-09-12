/**
 * Sky, stars, sun and drifting clouds. The sky color itself is a progress
 * readout: dusty black-brown early, deep blue as oxygen rises.
 */
import * as THREE from 'three';

const CLOUD_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const CLOUD_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform vec3 uCol;
uniform float uOpacity;
uniform float uSeed;
uniform float uTime;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i); float b = hash(i + vec2(1, 0));
  float c = hash(i + vec2(0, 1)); float d = hash(i + vec2(1, 1));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  vec2 p = vUv * 3.0 + vec2(uTime * 0.02, uSeed);
  float n = vnoise(p) * 0.6 + vnoise(p * 2.3) * 0.3 + vnoise(p * 5.1) * 0.1;
  float d = length(vUv - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.35, d) * smoothstep(0.35, 0.75, n) * uOpacity;
  gl_FragColor = vec4(uCol, a);
}
`;

export class Atmosphere {
  stars: THREE.Points;
  sunMesh: THREE.Mesh;
  sunDir = new THREE.Vector3(0.4, 0.8, 0.3);
  clouds: THREE.Mesh[] = [];
  private cloudGroup = new THREE.Group();
  dayPhase = 0.35;

  constructor(scene: THREE.Scene, cloudCount: number) {
    // stars
    const n = 900;
    const pos = new Float32Array(n * 3);
    const sz = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = Math.random() * Math.PI * 2;
      const v = Math.random() * 0.9;
      const r = 380;
      pos[i * 3] = Math.cos(u) * Math.sin(v) * r;
      pos[i * 3 + 1] = Math.cos(v) * r * (Math.random() > 0.15 ? 1 : -0.2);
      pos[i * 3 + 2] = Math.sin(u) * Math.sin(v) * r;
      sz[i] = 0.5 + Math.random() * 2.2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
    const mat = new THREE.ShaderMaterial({
      vertexShader: `attribute float aSize; varying float vS; uniform float uPr;
        void main(){ vec4 mv = viewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = aSize * uPr; vS = aSize; }`,
      fragmentShader: `precision mediump float; varying float vS; uniform float uFade;
        void main(){ float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.1, d) * uFade * (0.3 + 0.7 * (vS/2.7));
        gl_FragColor = vec4(0.85, 0.9, 1.0, a); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uPr: { value: 1.4 }, uFade: { value: 1 } },
    });
    this.stars = new THREE.Points(geo, mat);
    this.stars.frustumCulled = false;
    scene.add(this.stars);

    // sun disk
    const sunGeo = new THREE.PlaneGeometry(1, 1);
    const sunMat = new THREE.ShaderMaterial({
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `precision mediump float; varying vec2 vUv;
        void main(){ float d = length(vUv - 0.5) * 2.0;
        float core = smoothstep(0.35, 0.0, d);
        float glow = smoothstep(1.0, 0.0, d);
        gl_FragColor = vec4(vec3(1.0, 0.93, 0.78) * (core * 2.2 + glow * 0.5), core + glow * 0.6); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.sunMesh = new THREE.Mesh(sunGeo, sunMat);
    this.sunMesh.scale.setScalar(26);
    scene.add(this.sunMesh);

    // clouds
    for (let i = 0; i < cloudCount; i++) {
      const c = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
        vertexShader: CLOUD_VERT,
        fragmentShader: CLOUD_FRAG,
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
        uniforms: {
          uCol: { value: new THREE.Color(0.75, 0.8, 0.88) },
          uOpacity: { value: 0.0 },
          uSeed: { value: Math.random() * 10 },
          uTime: { value: 0 },
        },
      }));
      const s = 4 + Math.random() * 5;
      c.scale.set(s, s, 1);
      c.userData.speed = 0.05 + Math.random() * 0.08;
      c.userData.baseX = -20 + Math.random() * 40;
      c.userData.z = -18 + Math.random() * 36;
      c.position.set(c.userData.baseX, 4 + Math.random() * 2.5, c.userData.z);
      this.clouds.push(c);
      this.cloudGroup.add(c);
    }
    scene.add(this.cloudGroup);
  }

  setCloudCount(n: number): void {
    for (let i = 0; i < this.clouds.length; i++) this.clouds[i].visible = i < n;
  }

  update(dt: number, humidity: number, oxygen: number, fogCol: THREE.Color, camPos: THREE.Vector3): void {
    this.dayPhase += dt * 0.012;
    const a = this.dayPhase * Math.PI * 2;
    this.sunDir.set(Math.cos(a) * 0.7, 0.35 + Math.sin(a) * 0.75, Math.sin(a * 0.5) * 0.5).normalize();
    if (this.sunDir.y < 0.05) this.sunDir.y = 0.05;
    this.sunDir.normalize();
    this.sunMesh.position.copy(this.sunDir).multiplyScalar(300);
    this.sunMesh.lookAt(camPos);
    const night = Math.max(0, 0.35 - this.sunDir.y) / 0.35;
    (this.stars.material as THREE.ShaderMaterial).uniforms.uFade.value = 0.25 + night * 0.75;

    const cloudT = Math.max(0, Math.min(1, (humidity - 20) / 60));
    for (const c of this.clouds) {
      if (!c.visible) continue;
      const m = c.material as THREE.ShaderMaterial;
      m.uniforms.uTime.value += dt;
      m.uniforms.uOpacity.value = cloudT * 0.55;
      c.position.x += (c.userData.speed as number) * dt * 1.5;
      if (c.position.x > 26) c.position.x = -26;
      c.lookAt(camPos);
      m.uniforms.uCol.value.copy(fogCol).lerp(new THREE.Color(0.85, 0.9, 0.98), 0.6 + oxygen / 200);
    }
  }
}
