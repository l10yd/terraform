/**
 * GameRenderer — the rendering orchestrator. Pure view of GameState:
 * sync(state) rebuilds visual layers; playFx(fxList) runs feedback effects.
 * Never mutulates game state; simulation stays deterministic.
 */
import * as THREE from 'three';
import { axialToPlane, domeHeight, ELEV_STEP, hexCorners, planeToAxial, axialRound, hexKey, type Hex } from '../core/hex';
import { BIOMES, BIOME_ORDER, LIVING_BIOMES } from '../sim/defs';
import type { Derived } from '../sim/adjacency';
import type { Fx, GameState } from '../sim/types';
import { HexTerrain, HEX_KIND } from './hexmesh';
import { WaterLayer } from './water';
import { Vegetation, type VegTileInput } from './veg';
import { Particles, type PInput } from './particles';
import { Atmosphere } from './atmosphere';
import { FxLayer } from './fx';
import { StrategicCamera } from './camera';
import { PRESETS, FpsGovernor, type QualityLevel } from './quality';

export interface RendererCallbacks {
  onTileClick: (i: number | null) => void;
  onTileHover: (i: number | null) => void;
  onFloatText: (i: number, text: string, tone: 'good' | 'bad' | 'info') => void;
  onMilestoneFlash: (tone: 'good' | 'bad' | 'info') => void;
}

const LIVING = new Set<string>(LIVING_BIOMES);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
function mixc(a: number[], b: number[], f: number): number[] {
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

interface TileGeom {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  scale: number;
}

export class GameRenderer {
  readonly scene = new THREE.Scene();
  readonly renderer: THREE.WebGLRenderer;
  readonly cam: StrategicCamera;
  private terrain: HexTerrain | null = null;
  private water: WaterLayer | null = null;
  private veg: Vegetation | null = null;
  private particles: Particles | null = null;
  private atmo: Atmosphere;
  private fx: FxLayer;
  private lastNow = performance.now();
  private time = 0;  private g: GameState | null = null;
  private geoms: TileGeom[] = [];
  private lastVisual: { biome: string; dev: number; structure: string | null }[] = [];
  private flashTimers = new Map<number, number>();
  private flashAmp = new Map<number, number>();
  private popTimers = new Map<number, number>();
  private comboMarkers: { tiles: number[]; t: number }[] = [];
  private gridOn = false;
  private netOn = false;
  private quality: QualityLevel = 'high';
  private fps = new FpsGovernor();
  reduceMotion = false;
  autoRotate = false;
  fpsAuto = true;
  private hoverI: number | null = null;
  private selI: number | null = null;
  private validTiles: number[] = [];
  private ghost: { tile: number; ok: boolean; color: number[] } | null = null;
  private replayFrame: { b: number[]; d: number[] } | null = null;
  private disposed = false;
  private raf = 0;
  private frameStats = { draws: 0, tris: 0 };
  // pointer state
  private pDown = { x: 0, y: 0, button: 0, dragged: false, id: -1 };
  private pointers = new Map<number, { x: number; y: number }>();
  private pinchDist = 0;

  constructor(private canvas: HTMLCanvasElement, private cb: RendererCallbacks) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', alpha: false });
    this.renderer.setClearColor(new THREE.Color(0x05060a));
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.fps.onAutoDrop = (q) => { if (this.fpsAuto) this.setQuality(q, true); };
    this.cam = new StrategicCamera(1, 24);
    this.atmo = new Atmosphere(this.scene, PRESETS.high.clouds);
    this.fx = new FxLayer(this.scene);
    this.resize();
    window.addEventListener('resize', this.onResize);
    this.attachInput();
    const loop = () => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      this.frame();
    };
    this.raf = requestAnimationFrame(loop);
  }

  get autoQuality(): QualityLevel {
    return this.fps.recommended;
  }

  get stats(): { fps: number; draws: number; tris: number } {
    return { fps: this.fps.fps, draws: this.frameStats.draws, tris: this.frameStats.tris };
  }

  private onResize = () => this.resize();

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.cam.resize(w / h);
    const pr = Math.min(window.devicePixelRatio, PRESETS[this.quality].maxPixelRatio);
    this.renderer.setPixelRatio(pr);
  }

  setQuality(q: QualityLevel, auto = false): void {
    this.quality = q;
    this.atmo.setCloudCount(PRESETS[q].clouds);
    if (this.g) this.syncLayers(this.g);
    if (auto) { /* recommended changed; UI notified via polling */ }
    this.resize();
  }

  get currentQuality(): QualityLevel {
    return this.quality;
  }

  setGrid(on: boolean): void {
    this.gridOn = on;
  }
  setNetworks(on: boolean): void {
    this.netOn = on;
    if (this.g) this.syncLayers(this.g);
  }

  setReplayFrame(f: { b: number[]; d: number[] } | null): void {
    this.replayFrame = f;
    if (this.g) this.syncLayers(this.g, undefined, true);
  }

  // -------------------------------------------------------------------------
  // game binding
  // -------------------------------------------------------------------------

  setGame(g: GameState): void {
    const changed = !this.terrain || this.g === null || this.g.tiles.length !== g.tiles.length;
    this.g = g;
    this.cam.worldRadius = Math.sqrt(3) * g.mapR * 1.05;
    this.cam.resetView(26);
    if (changed) {
      const n = g.tiles.length;
      this.disposeLayers();
      this.terrain = new HexTerrain(n);
      this.water = new WaterLayer(n);
      const p = PRESETS[this.quality];
      this.veg = new Vegetation(Math.min(4000, n * 9), Math.min(9000, n * 20), p.vegScale);
      this.particles = new Particles(Math.min(6000, n * 12));
      this.scene.add(this.terrain.mesh);
      this.scene.add(this.water.mesh);
      for (const m of this.veg.meshes) this.scene.add(m);
      this.scene.add(this.particles.mesh);
      this.geoms = new Array(n);
      this.lastVisual = new Array(n).fill(null).map(() => ({ biome: '', dev: -1, structure: null }));
    }
    this.syncLayers(g);
  }

  sync(g: GameState, _derived?: Derived): void {
    this.g = g;
    if (!this.terrain) this.setGame(g);
    else this.syncLayers(g);
  }

  private tileOverride(i: number): { biome: keyof typeof BIOMES; dev: number } | null {
    if (!this.replayFrame) return null;
    const b = this.replayFrame.b[i];
    if (b === undefined) return null;
    return { biome: BIOME_ORDER[b] ?? 'barren', dev: this.replayFrame.d[i] ?? 0 };
  }

  private syncLayers(g: GameState, derived?: Derived, force = false): void {
    if (!this.terrain || !this.water || !this.veg || !this.particles) return;
    const p = g.planet;
    const n = g.tiles.length;
    const corners = hexCorners();
    const ice = clamp01((-p.temp - 8) / 22);

    // ---- per-tile base colors + geometry ------------------------------------
    const baseCols: number[][] = new Array(n);
    for (let i = 0; i < n; i++) {
      const t = g.tiles[i];
      const ov = this.tileOverride(i);
      const biome = ov ? ov.biome : t.biome;
      const dev = ov ? ov.dev : t.dev;
      const def = BIOMES[biome];
      let col = def.color.slice() as number[];

      if (LIVING.has(biome)) {
        col = mixc(col, [col[0] * 0.9, col[1] * 1.28, col[2] * 0.85], clamp01(dev / 3) * 0.65);
        // wilt: only fresh plantings in truly hostile ground turn brown;
        // established ecosystems keep their color (the sim will decay dev
        // if conditions stay bad, and THAT is what the player sees dying)
        if (t.suit < 0.3) {
          col = mixc(col, [0.45, 0.38, 0.26], (0.3 - t.suit) * 1.1 * (1 - clamp01(dev / 2.2)) * 0.8);
        }
      }
      col = mixc(col, [0.3, 0.27, 0.24], clamp01(t.poll / 90) * 0.45);
      col = mixc(col, [col[0] * 0.8, col[1] * 0.86, col[2] * 0.78], clamp01(t.moist / 100) * 0.25);
      if (biome === 'barren') col = mixc(col, [0.32, 0.38, 0.24], clamp01(t.fert / 100) * 0.4);
      if (t.structure) col = mixc(col, [0.46, 0.46, 0.47], 0.4);
      if (this.netOn && LIVING.has(biome) && dev > 0) {
        const size = derived?.netSize[i] ?? 0;
        if (size > 0) {
          const heat = size <= 2 ? [0.5, 0.16, 0.12] : mixc([0.15, 0.35, 0.6], [0.25, 0.72, 0.35], clamp01((size - 3) / 16));
          col = mixc(col, heat as number[], 0.5);
        }
      }
      baseCols[i] = col;

      // world placement (dome + elevation)
      const hex = mapHex(g, i);
      const pl = axialToPlane(hex);
      const elev = biome === 'ocean' ? t.elev - 0.35 : t.elev;
      const y = domeHeight(pl.x, pl.z) + elev * ELEV_STEP;
      const pos = new THREE.Vector3(pl.x, y, pl.z);
      const quat = domeQuat(pl.x, pl.z);
      this.geoms[i] = { pos, quat, scale: 1 };

      let kind: number = HEX_KIND.ROCK;
      if (biome === 'desert') kind = HEX_KIND.SAND;
      else if (biome === 'alpine' || t.elev >= 4) kind = HEX_KIND.SNOW;
      else if (biome === 'ecozone') kind = HEX_KIND.ECO;
      else if (LIVING.has(biome) || biome === 'river') kind = HEX_KIND.LIFE;
      else if (biome === 'ocean') kind = HEX_KIND.BASIN;
      const emissive = t.structure ? 1 : 0;
      const prev = this.lastVisual[i];
      // Flash ONLY on discrete events (biome swap / structure), never on the
      // tiny per-cycle dev creep — otherwise the whole map strobes every cycle.
      const discrete = !force && prev && (prev.biome !== biome || prev.structure !== t.structure);
      if (discrete) {
        this.flashTimers.set(i, 0.8);
        const died = biome === 'rockwaste' && prev.biome !== 'barren' && prev.biome !== 'rockwaste';
        this.flashAmp.set(i, died ? -1 : 0.75);
      }
      this.lastVisual[i] = { biome, dev, structure: t.structure ?? null };

      this.terrain.setInstance(
        i, pos, quat, (elev + 1.2) * ELEV_STEP + 0.6,
        kind, emissive, this.flashTimers.has(i) ? (this.flashAmp.get(i) ?? 0.75) : this.terrain.getFlash(i),
        t.dep / 3, t.geo, t.suit, t.moist / 100, Math.min(1, dev / 2.2));
    }

    // ---- corner blending: average colors of the ≤3 tiles touching a corner --
    const cornerAcc = new Map<string, { r: number; g: number; b: number; c: number }>();
    for (let i = 0; i < n; i++) {
      const pl = this.geoms[i].pos;
      for (let k = 0; k < 6; k++) {
        const key = `${Math.round((pl.x + corners[k].x) * 900)},${Math.round((pl.z + corners[k].z) * 900)}`;
        let e = cornerAcc.get(key);
        if (!e) {
          e = { r: 0, g: 0, b: 0, c: 0 };
          cornerAcc.set(key, e);
        }
        e.r += baseCols[i][0];
        e.g += baseCols[i][1];
        e.b += baseCols[i][2];
        e.c++;
      }
    }
    for (let i = 0; i < n; i++) {
      const rgb: number[] = [];
      const pl = this.geoms[i].pos;
      rgb.push(...baseCols[i]); // center slot 0
      for (let k = 0; k < 6; k++) {
        const key = `${Math.round((pl.x + corners[k].x) * 900)},${Math.round((pl.z + corners[k].z) * 900)}`;
        const e = cornerAcc.get(key)!;
        rgb.push(e.r / e.c, e.g / e.c, e.b / e.c);
      }
      rgb.push(...mixc(baseCols[i], [0.05, 0.05, 0.06], 0.45)); // side slot 7
      this.terrain.setColorRow(i, rgb);
    }
    this.terrain.flushColors();
    this.terrain.flush();

    // ---- water layer ----------------------------------------------------------
    this.water.begin();
    for (let i = 0; i < n; i++) {
      const t = g.tiles[i];
      const ov = this.tileOverride(i);
      const biome = ov ? ov.biome : t.biome;
      if (biome !== 'ocean' && biome !== 'river') continue;
      const gm = this.geoms[i];
      const surf = gm.pos.clone();
      surf.y = domeHeight(gm.pos.x, gm.pos.z) + (t.elev + 0.02) * ELEV_STEP - 0.02;
      const col: [number, number, number] = biome === 'ocean'
        ? [0.07, 0.26, 0.44]
        : [0.16, 0.44, 0.63];
      this.water.add(surf, gm.quat, biome === 'ocean' ? 0.98 : 0.58, col, biome === 'ocean' ? 0 : 1, (i * 7919 % 100) / 100);
    }
    this.water.end();

    // ---- vegetation -------------------------------------------------------------
    const vegIn: VegTileInput[] = [];
    const pIn: PInput[] = [];
    const pBudget = Math.floor(26 * PRESETS[this.quality].particles);
    let pCount = 0;
    const jitter3 = (i: number, k: number) => Math.sin(i * 12.9898 + k * 78.233) * 0.5 + 0.5;
    for (let i = 0; i < n; i++) {
      const t = g.tiles[i];
      const ov = this.tileOverride(i);
      const biome = ov ? ov.biome : t.biome;
      const dev = ov ? ov.dev : t.dev;
      const gm = this.geoms[i];
      let vk = 0;
      if (dev > 0.2) {
        if (biome === 'forest' || biome === 'tundra') vk = 1;
        else if (biome === 'tropical') vk = 2;
        else if (biome === 'ecozone') vk = 2;
        else if (biome === 'grassland' || biome === 'wetland' || biome === 'alpine') vk = 3;
      }
      if (vk) vegIn.push({ x: gm.pos.x, y: gm.pos.y, z: gm.pos.z, kind: vk, dev, suit: t.suit, seed: i * 31 + 7 });
      // particles per tile
      if (pCount < pBudget) {
        const add = (kind: number, cnt: number, size: number, yOff = 0.25) => {
          for (let k = 0; k < cnt && pCount < pBudget; k++) {
            pIn.push({
              x: gm.pos.x + (jitter3(i, k) - 0.5) * 1.2,
              y: gm.pos.y + yOff,
              z: gm.pos.z + (jitter3(i, k + 3) - 0.5) * 1.2,
              kind, size: size * (0.6 + jitter3(i, k + 9) * 0.8),
            });
            pCount++;
          }
        };
        if (biome === 'desert') add(0, 2, 3.2, 0.2);
        if (biome === 'wetland') { add(1, 2, 6); add(3, 1, 2.2, 0.5); }
        if ((biome === 'alpine' && t.elev >= 4) || (t.elev >= 4 && ice > 0.2)) add(2, 2, 2.6, 1.0);
        if ((biome === 'forest' || biome === 'tropical') && dev > 1.4) add(dev > 2.4 ? 3 : 4, 2, 2.2, 0.7);
        if (t.geo) add(5, 2, 2.6, 0.3);
        if (t.dep >= 2 && biome !== 'ocean') add(6, 1, 2.0, 0.18);
        if (biome === 'ocean' && ice < 0.5) add(7, 1, 2.6, 0.12);
      }
    }
    this.veg.rebuild(vegIn);
    this.particles.rebuild(pIn);

    // global uniforms
    this.updateAtmos(g);
  }

  private updateAtmos(g: GameState): void {
    if (!this.terrain) return;
    const p = g.planet;
    const life = clamp01(p.oxygen / 22);
    const dust = new THREE.Color(0x0a0a0d);
    const blue = new THREE.Color(0x14273a);
    const bg = dust.clone().lerp(blue, life * 0.85 + clamp01(p.humidity / 100) * 0.15);
    this.renderer.setClearColor(bg);
    const fogCol = bg.clone().lerp(new THREE.Color(0.35, 0.42, 0.55), life * 0.22);
    const u = this.terrain.mat.uniforms;
    u.uFogCol.value.copy(fogCol);
    if (this.water) {
      this.water.mat.uniforms.uFogCol.value.copy(fogCol);
      this.water.mat.uniforms.uFreeze.value = clamp01((-p.temp - 6) / 18);
    }
    u.uIce.value = clamp01((-p.temp - 2) / 26) * 0.5;
    if (this.veg) {
      for (const m of this.veg.mats) {
        m.uniforms.uFogCol.value.copy(fogCol);
        m.uniforms.uAmbCol.value = new THREE.Color(0.35 + life * 0.25, 0.4 + life * 0.28, 0.48 + life * 0.3);
      }
    }
    if (this.particles) this.particles.mat.uniforms.uFogCol.value.copy(fogCol);
  }

  // -------------------------------------------------------------------------
  // interaction
  // -------------------------------------------------------------------------

  private attachInput(): void {
    const el = this.canvas;
    el.addEventListener('pointerdown', (e) => {
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
        return;
      }
      el.setPointerCapture(e.pointerId);
      this.pDown = { x: e.clientX, y: e.clientY, button: e.button, dragged: false, id: e.pointerId };
    });
    el.addEventListener('pointermove', (e) => {
      const prev = this.pointers.get(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 2 && prev) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.pinchDist > 0) this.cam.zoomBy(this.pinchDist / Math.max(20, d));
        this.pinchDist = d;
        return;
      }
      if (this.pDown.id === e.pointerId && (e.buttons & (1 << this.pDown.button))) {
        const dx = e.clientX - this.pDown.x;
        const dy = e.clientY - this.pDown.y;
        if (!this.pDown.dragged && Math.hypot(dx, dy) > 6) this.pDown.dragged = true;
        if (this.pDown.dragged) {
          if (this.pDown.button === 0) {
            this.cam.panBy(-(e.movementX ?? 0) * 0.03, -(e.movementY ?? 0) * 0.03);
          } else if (this.pDown.button === 2 || this.pDown.button === 1) {
            this.cam.orbit(-(e.movementX ?? 0) * 0.005, (e.movementY ?? 0) * 0.004);
          }
        }
      } else {
        this.updateHover(e);
      }
    });
    el.addEventListener('pointerup', (e) => {
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinchDist = 0;
      if (e.pointerId !== this.pDown.id) return;
      const wasDrag = this.pDown.dragged;
      this.pDown.dragged = false;
      this.pDown.id = -1;
      if (!wasDrag && this.pDown.button === 0) {
        const i = this.pickTile(e);
        this.cb.onTileClick(i);
      }
    });
    el.addEventListener('pointercancel', (e) => {
      this.pointers.delete(e.pointerId);
    });
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const world = this.groundAt(e.clientX, e.clientY) ?? undefined;
      this.cam.zoomBy(e.deltaY > 0 ? 1.12 : 1 / 1.12, world);
    }, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private groundAt(clientX: number, clientY: number): THREE.Vector3 | null {
    const rect = this.canvas.getBoundingClientRect();
    const nd = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(nd, this.cam.cam);
    const o = ray.ray.origin;
    const d = ray.ray.direction;
    // intersect with y = 0 plane
    if (Math.abs(d.y) < 1e-4) return null;
    const t = -o.y / d.y;
    if (t < 0) return null;
    return o.clone().addScaledVector(d, t);
  }

  private pickTile(e: PointerEvent | { clientX: number; clientY: number }): number | null {
    const g = this.g;
    if (!g || !this.terrain) return null;
    const rect = this.canvas.getBoundingClientRect();
    const nd = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(nd, this.cam.cam);
    const o = ray.ray.origin;
    const d = ray.ray.direction;
    // march the heightfield
    let t = 2;
    let hit = -1;
    const heightAt = (x: number, z: number): number => {
      const { q, r } = planeToAxial(x, z);
      const h = axialRound(q, r);
      const idx = hexIdx(g, h);
      if (idx < 0) return -Infinity;
      return domeHeight(x, z) + g.tiles[idx].elev * ELEV_STEP;
    };
    let prevBelow = false;
    for (; t < 260; t += 0.6) {
      const x = o.x + d.x * t;
      const y = o.y + d.y * t;
      const z = o.z + d.z * t;
      if (Math.hypot(x, z) > this.cam.worldRadius * 1.15) continue;
      const below = y < heightAt(x, z);
      if (below && !prevBelow) {
        hit = t;
        break;
      }
      prevBelow = below;
    }
    if (hit < 0) return null;
    for (let s = hit - 0.6; s <= hit + 0.2; s += 0.05) {
      const x = o.x + d.x * s;
      const y = o.y + d.y * s;
      const z = o.z + d.z * s;
      if (y < heightAt(x, z)) {
        const { q, r } = planeToAxial(x, z);
        const h = axialRound(q, r);
        const idx = hexIdx(g, h);
        return idx >= 0 ? idx : null;
      }
    }
    return null;
  }

  private updateHover(e: PointerEvent): void {
    const i = this.pickTile(e);
    if (i !== this.hoverI) {
      this.hoverI = i;
      this.cb.onTileHover(i);
      this.refreshOverlay();
    }
  }

  setSelection(tile: number | null): void {
    this.selI = tile;
    this.refreshOverlay();
  }

  setValidTiles(list: number[]): void {
    this.validTiles = list;
    this.refreshOverlay();
  }

  setGhost(tile: number | null, ok: boolean, color: number[]): void {
    this.ghost = tile === null ? null : { tile, ok, color };
    this.refreshOverlay();
  }

  private refreshOverlay(): void {
    if (!this.g || !this.terrain) return;
    const v = this.fx.valid;
    const r = this.fx.rings;
    v.begin();
    r.begin();
    const tmpCol = new THREE.Color();
    for (const i of this.validTiles) {
      const gm = this.geoms[i];
      if (!gm) continue;
      tmpCol.setRGB(0.25, 0.85, 0.45);
      v.add(gm.pos, gm.quat, 0.92, tmpCol, 0.32, i);
    }
    if (this.ghost) {
      const gm = this.geoms[this.ghost.tile];
      if (gm) {
        tmpCol.setRGB(this.ghost.color[0], this.ghost.color[1], this.ghost.color[2]);
        v.add(gm.pos, gm.quat, 0.94, tmpCol, 0.5, 1);
        tmpCol.setRGB(this.ghost.ok ? 0.3 : 1.0, this.ghost.ok ? 0.95 : 0.25, this.ghost.ok ? 0.45 : 0.2);
        r.add(gm.pos, gm.quat, 0.98, tmpCol, 0.85, 2);
      }
    }
    for (const cm of this.comboMarkers) {
      tmpCol.setRGB(0.5, 1.0, 0.7);
      for (const i of cm.tiles) {
        const gm = this.geoms[i];
        if (gm) r.add(gm.pos, gm.quat, 1.02, tmpCol, Math.max(0, cm.t) * 0.8, i);
      }
    }
    v.end();
    r.end();
    // rings
    if (this.selI !== null && this.geoms[this.selI]) {
      const gm = this.geoms[this.selI];
      this.fx.selRing.visible = true;
      this.fx.selRing.position.copy(gm.pos).add(new THREE.Vector3(0, 0.06, 0));
      this.fx.selRing.quaternion.copy(gm.quat);
    } else this.fx.selRing.visible = false;
    if (this.hoverI !== null && this.geoms[this.hoverI]) {
      const gm = this.geoms[this.hoverI];
      this.fx.hoverRing.visible = true;
      this.fx.hoverRing.position.copy(gm.pos).add(new THREE.Vector3(0, 0.06, 0));
      this.fx.hoverRing.quaternion.copy(gm.quat);
    } else this.fx.hoverRing.visible = false;
  }

  tileWorld(i: number): THREE.Vector3 | null {
    return this.geoms[i] ? this.geoms[i].pos.clone() : null;
  }

  waterCount(): number {
    return this.water ? this.water.mesh.count : 0;
  }

  /** project world point to screen css coords (for floating text) */
  project(v: THREE.Vector3): { x: number; y: number; visible: boolean } {
    const p = v.clone().project(this.cam.cam);
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((p.x + 1) / 2) * rect.width + rect.left,
      y: ((1 - p.y) / 2) * rect.height + rect.top,
      visible: p.z < 1 && p.z > -1,
    };
  }

  focusTile(i: number, strong = false): void {
    const gm = this.geoms[i];
    if (!gm) return;
    this.cam.focus(gm.pos, !strong);
  }

  focusHub(): void {
    if (this.g) this.focusTile(this.g.hubIndex);
  }

  // -------------------------------------------------------------------------
  // FX playback
  // -------------------------------------------------------------------------

  playFx(list: Fx[]): void {
    if (!this.g) return;
    for (const f of list) {
      switch (f.kind) {
        case 'place': {
          const gm = this.geoms[f.tile];
          if (!gm) break;
          this.popTimers.set(f.tile, 0.42);
          this.fx.shock(gm.pos, gm.quat, new THREE.Color(1.0, 0.78, 0.4), 2.6, 0.55);
          if (!this.reduceMotion) this.cam.shake(0.05);
          break;
        }
        case 'transform': {
          const gm = this.geoms[f.tile];
          if (!gm) break;
          const died = f.to === 'rockwaste';
          this.flashTimers.set(f.tile, 0.8);
          this.flashAmp.set(f.tile, died ? -1 : 0.9);
          this.fx.shock(gm.pos, gm.quat, died ? new THREE.Color(1, 0.35, 0.2) : new THREE.Color(0.45, 0.85, 0.5), 2.2, 0.7);
          break;
        }
        case 'combo': {
          for (const ti of f.tiles) {
            const gm = this.geoms[ti];
            if (gm) this.fx.shock(gm.pos, gm.quat, new THREE.Color(0.5, 1, 0.75), 3.2, 0.9);
          }
          this.comboMarkers.push({ tiles: f.tiles, t: 2.2 });
          if (!this.reduceMotion) {
            const c = this.geoms[f.tiles[0]];
            if (c) this.cam.shake(0.1);
          }
          this.cb.onMilestoneFlash('good');
          break;
        }
        case 'float': {
          this.cb.onFloatText(f.tile, f.text, f.tone);
          break;
        }
        case 'event': {
          break; // modal handles presentation
        }
        case 'milestone': {
          this.cb.onMilestoneFlash(f.tone);
          if (f.tone === 'good' && !this.reduceMotion) this.cam.shake(0.06);
          break;
        }
        case 'unlock': {
          this.cb.onFloatText(this.g.hubIndex, '✦', 'info');
          this.cb.onMilestoneFlash('info');
          break;
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // frame loop
  // -------------------------------------------------------------------------

  private frame(): void {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastNow) / 1000);
    this.lastNow = now;
    this.time += dt;
    this.fps.tick(dt);
    if (this.autoRotate) this.cam.orbit(dt * 0.05, 0);
    this.cam.update(dt, this.reduceMotion);
    if (this.terrain) {
      const u = this.terrain.mat.uniforms;
      u.uTime.value = this.time;
      u.uSunDir.value.copy(this.atmo.sunDir);
      u.uSunCol.value.setRGB(1.0, 0.95, 0.85);
      const night = Math.max(0, 0.35 - this.atmo.sunDir.y) / 0.35;
      u.uAmbCol.value.setRGB(0.3 + 0.18 * (1 - night), 0.36 + 0.16 * (1 - night), 0.46 + 0.1 * (1 - night));
      u.uDayLight.value = 1 - night * 0.75;
      u.uGrid.value = this.gridOn ? 0.85 : this.g && this.validTiles.length > 0 ? 0.22 : 0.08;
    }
    if (this.water) {
      const u = this.water.mat.uniforms;
      u.uTime.value = this.time;
      u.uSunDir.value.copy(this.atmo.sunDir);
      const u2 = this.terrain?.mat.uniforms;
      if (u2) {
        u.uAmbCol.value.copy(u2.uAmbCol.value);
        u.uSunCol.value.copy(u2.uSunCol.value);
      }
    }
    this.veg?.setTime(this.time, this.g ? 0.5 + clamp01(this.g.planet.humidity / 80) : 0.8);
    this.particles?.setTime(this.time);
    if (this.g) this.atmo.update(dt, this.g.planet.humidity, this.g.planet.oxygen, this.renderer.getClearColor(new THREE.Color()).clone().lerp(new THREE.Color(0.3, 0.4, 0.55), 0.3), this.cam.cam.position);

    // flash + pop decay
    if (this.terrain) {
      let needFlush = false;
      for (const [i, t] of this.flashTimers) {
        const nt = t - dt;
        const v = Math.max(0, nt / 0.8);
        const amp = this.flashAmp.get(i) ?? 0.8;
        this.terrain.setFlash(i, nt <= 0 ? 0 : amp * v * v);
        if (nt <= 0) { this.flashTimers.delete(i); this.flashAmp.delete(i); }
        needFlush = true;
      }
      if (needFlush) this.terrain.iFlagsFlush();
      for (const [i, t] of this.popTimers) {
        const nt = t - dt;
        const f = 1 - Math.max(0, nt) / 0.42;
        const pop = 1 + 0.12 * Math.sin(f * Math.PI);
        const gm = this.geoms[i];
        if (gm) {
          const m = new THREE.Matrix4().compose(gm.pos, gm.quat, new THREE.Vector3(pop, 1, pop));
          this.terrain.mesh.setMatrixAt(i, m);
          this.terrain.mesh.instanceMatrix.needsUpdate = true;
        }
        if (nt <= 0) {
          this.popTimers.delete(i);
          if (gm) {
            const m = new THREE.Matrix4().compose(gm.pos, gm.quat, new THREE.Vector3(1, 1, 1));
            this.terrain.mesh.setMatrixAt(i, m);
            this.terrain.mesh.instanceMatrix.needsUpdate = true;
          }
        }
      }
    }
    for (let i = this.comboMarkers.length - 1; i >= 0; i--) {
      this.comboMarkers[i].t -= dt;
      if (this.comboMarkers[i].t <= 0) this.comboMarkers.splice(i, 1);
    }
    if (this.comboMarkers.length) this.refreshOverlay();

    this.fx.setTime(this.time);
    this.fx.update(dt);
    this.renderer.render(this.scene, this.cam.cam);
    this.frameStats.draws = this.renderer.info.render.calls;
    this.frameStats.tris = this.renderer.info.render.triangles;
  }

  setKeys(k: Set<string>): void {
    this.cam.keys = k;
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    this.disposeLayers();
    this.renderer.dispose();
  }

  private disposeLayers(): void {
    if (this.terrain) this.scene.remove(this.terrain.mesh);
    if (this.water) this.scene.remove(this.water.mesh);
    if (this.veg) for (const m of this.veg.meshes) this.scene.remove(m);
    if (this.particles) this.scene.remove(this.particles.mesh);
    this.terrain = null;
    this.water = null;
    this.veg = null;
    this.particles = null;
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const hexCache = new WeakMap<GameState, Hex[]>();
function mapHex(g: GameState, i: number): Hex {
  let arr = hexCache.get(g);
  if (!arr) {
    arr = computeCoords(g.mapR);
    hexCache.set(g, arr);
  }
  return arr[i];
}

const keyIdxCache = new WeakMap<GameState, Map<string, number>>();
function hexIdx(g: GameState, h: Hex): number {
  let m = keyIdxCache.get(g);
  if (!m) {
    m = new Map();
    computeCoords(g.mapR).forEach((c, i) => m!.set(hexKey(c.q, c.r), i));
    keyIdxCache.set(g, m);
  }
  const i = m.get(hexKey(h.q, h.r));
  return i === undefined ? -1 : i;
}

const coordCache = new Map<number, Hex[]>();
function computeCoords(r: number): Hex[] {
  let c = coordCache.get(r);
  if (!c) {
    c = [];
    for (let rr = -r; rr <= r; rr++) {
      const qMin = Math.max(-r, -rr - r);
      const qMax = Math.min(r, -rr + r);
      for (let q = qMin; q <= qMax; q++) c.push({ q, r: rr });
    }
    coordCache.set(r, c);
  }
  return c;
}

function domeQuat(x: number, z: number): THREE.Quaternion {
  // face along the dome normal: for y = -c(x²+z²), surface normal ∝ (2cx, 1, 2cz)
  const c = 0.011;
  const n = new THREE.Vector3(2 * c * x, 1, 2 * c * z).normalize();
  return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
}
