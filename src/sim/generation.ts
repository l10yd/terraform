/**
 * Procedural, seeded planet generation with balance guarantees:
 * always enough starting water, deposits and viable first moves.
 */
import { hexDistance, hexKey } from '../core/hex';
import { fbmHex, hash2d, mulberry32Next, rngInt, type RngState } from '../core/rng';
import { computeTerritory, mapIndex, setRng } from './state';
import { pushSnapshot } from './snapshot';
import { OBJECTIVE_POOL } from './objectives';
import type { GameMode, GameState } from './types';

interface ModeCfg {
  iceCount: number; basinCount: number; moistBias: number; tempStart: number;
  depBias: number; geoBias: number; resMult: number; techStart: string | null;
}

export const MODE_CFG: Record<GameMode, ModeCfg> = {
  standard: { iceCount: 3, basinCount: 2, moistBias: 0, tempStart: -16, depBias: 0, geoBias: 0, resMult: 1, techStart: null },
  arid: { iceCount: 1, basinCount: 1, moistBias: -18, tempStart: -8, depBias: 0.02, geoBias: 0, resMult: 0.9, techStart: null },
  frozen: { iceCount: 6, basinCount: 1, moistBias: 10, tempStart: -48, depBias: -0.01, geoBias: 0, resMult: 1, techStart: null },
  volcanic: { iceCount: 2, basinCount: 2, moistBias: 0, tempStart: -10, depBias: 0.04, geoBias: 0.06, resMult: 1.05, techStart: null },
  ecological: { iceCount: 3, basinCount: 2, moistBias: 6, tempStart: -18, depBias: -0.02, geoBias: -0.03, resMult: 1, techStart: 'bio_lichen' },
  hardcore: { iceCount: 2, basinCount: 1, moistBias: -6, tempStart: -22, depBias: 0, geoBias: 0, resMult: 0.62, techStart: null },
  daily: { iceCount: 3, basinCount: 2, moistBias: 0, tempStart: -16, depBias: 0, geoBias: 0, resMult: 1, techStart: null },
};

const NAME_A = ['Kepler', 'Aurel', 'Nyx', 'Talos', 'Vesper', 'Ceres', 'Onyx', 'Rhea', 'Pallas', 'Iju', 'Kalo', 'Mira', 'Erid', 'Solara', 'Tycho', 'Umbra', 'Viva', 'Xan'];
const NAME_B = ['-9b', '-IV', '-Prime', ' Minor', ' Major', '-c', ' VII', '-IX', ' Dawn', '.2', ' Reach', '-3'];

export function planetNameFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(h, 31) + seed.charCodeAt(i)) | 0;
  let s = h >>> 0;
  let a: number, b: number;
  [a, s] = mulberry32Next(s);
  [b, s] = mulberry32Next(s);
  return NAME_A[Math.floor(a * NAME_A.length)] + NAME_B[Math.floor(b * NAME_B.length)];
}

export function seedNum(seed: string): number {
  let h = 0x9e3779b9;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x85ebca6b) >>> 0;
  }
  return h >>> 0;
}

const DIR6: [number, number][] = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

export function neighborsOfIdx(g: GameState, i: number): number[] {
  const { coords, keyToIdx } = mapIndex(g.mapR);
  const h = coords[i];
  const out: number[] = [];
  for (const d of DIR6) {
    const j = keyToIdx.get(hexKey(h.q + d[0], h.r + d[1]));
    if (j !== undefined) out.push(j);
  }
  return out;
}

function withinRing(g: GameState, i: number, d: number): number[] {
  const { coords } = mapIndex(g.mapR);
  const h = coords[i];
  const out: number[] = [];
  for (let j = 0; j < coords.length; j++) if (hexDistance(coords[j], h) <= d) out.push(j);
  return out;
}

export function generatePlanet(g: GameState): void {
  const cfg = MODE_CFG[g.mode];
  const { coords } = mapIndex(g.mapR);
  const n = g.tiles.length;
  const S = seedNum(g.seed);
  const rng: RngState = { ...g.rng };

  // --- hub: near center, prefer elevation 2 ------------------------------
  let hub = 0;
  let bestScore = -Infinity;
  const centerBand = (g.mapR * 2) / 3;
  for (let i = 0; i < n; i++) {
    const h = coords[i];
    const distC = hexDistance(h, { q: 0, r: 0 });
    if (distC > centerBand) continue;
    const e = Math.round(fbmHex(S + 11, h.q, h.r, 6) * 5);
    const sc = -distC * 2 - Math.abs(e - 2) * 6 + hash2d(S, h.q, h.r) * 2;
    if (sc > bestScore) { bestScore = sc; hub = i; }
  }

  // --- terrain fields ------------------------------------------------------
  for (let i = 0; i < n; i++) {
    const h = coords[i];
    const t = g.tiles[i];
    const cont = fbmHex(S + 1, h.q, h.r, 11);
    const detail = fbmHex(S + 2, h.q, h.r, 4.5);
    let elev = cont * 4.4 + detail * 1.8 - 0.55;
    elev += Math.max(0, hexDistance(h, { q: 0, r: 0 }) - (g.mapR - 3)) * 0.5;
    t.elev = Math.max(0, Math.min(5, Math.round(elev)));
    t.moist = Math.max(0, Math.min(100,
      (t.elev <= 1 ? 30 : t.elev === 2 ? 12 : 6) +
      fbmHex(S + 3, h.q, h.r, 7) * 30 + cfg.moistBias + hash2d(S + 4, h.q, h.r) * 12));
    t.fert = Math.max(0, Math.min(100,
      fbmHex(S + 5, h.q, h.r, 8) * 42 + (t.elev === 2 ? 8 : 0) + hash2d(S + 6, h.q, h.r) * 10 - 6));
    const depRoll = hash2d(S + 7, h.q * 3 + 1, h.r * 5 + 2);
    t.dep = depRoll < 0.02 + cfg.depBias ? 3 : depRoll < 0.06 + cfg.depBias ? 2 : depRoll < 0.12 + cfg.depBias ? 1 : 0;
    t.geo = hash2d(S + 8, h.q * 7 + 3, h.r * 9 + 5) < 0.022 + cfg.geoBias ||
      (t.elev >= 4 && hash2d(S + 9, h.q, h.r) < 0.05 + cfg.geoBias) ? 1 : 0;
    t.biome = 'barren';
    t.suit = 0;
    t.dev = 0; t.poll = 0; t.structure = null; t.tTf = 0;
  }

  // --- starting water: polar ice shelves + dead basins ----------------------
  let icePlaced = 0;
  const rimOrder = [...Array(n).keys()].sort((a, b) =>
    hexDistance(coords[b], { q: 0, r: 0 }) - hexDistance(coords[a], { q: 0, r: 0 }));
  for (const i of rimOrder) {
    if (icePlaced >= cfg.iceCount) break;
    const t = g.tiles[i];
    if (t.elev <= 2 && hash2d(S + 12, coords[i].q, coords[i].r) > 0.35) {
      t.biome = 'ocean'; t.moist = Math.max(t.moist, 62); t.suit = 0.5;
      const nb = neighborsOfIdx(g, i);
      if (nb.length > 0 && g.tiles[nb[0]].elev <= t.elev + 1) {
        g.tiles[nb[0]].biome = 'ocean'; g.tiles[nb[0]].moist = 55;
      }
      icePlaced++;
    }
  }
  let basins = 0;
  const basinOrder = [...Array(n).keys()].sort((a, b) => g.tiles[a].elev - g.tiles[b].elev || a - b);
  for (const i of basinOrder) {
    if (basins >= cfg.basinCount) break;
    const t = g.tiles[i];
    if (t.elev === 0 && i !== hub) {
      t.biome = 'ocean'; t.moist = 70; t.suit = 0.5;
      for (const nb of neighborsOfIdx(g, i).slice(0, 2)) {
        if (g.tiles[nb].elev <= 1 && g.tiles[nb].biome === 'barren') {
          g.tiles[nb].biome = 'ocean'; g.tiles[nb].moist = 58;
        }
      }
      basins++;
    }
  }

  // Guarantees ---------------------------------------------------------------
  let nearestWater = Infinity;
  for (let i = 0; i < n; i++) {
    if (g.tiles[i].biome === 'ocean') nearestWater = Math.min(nearestWater, hexDistance(coords[i], coords[hub]));
  }
  if (nearestWater > 4) {
    for (const i of withinRing(g, hub, 3)) {
      if (g.tiles[i].elev <= 1) { g.tiles[i].biome = 'ocean'; g.tiles[i].moist = 60; break; }
    }
  }
  let rich = 0;
  for (let i = 0; i < n; i++) if (g.tiles[i].dep >= 2) rich++;
  if (rich < 3) {
    for (const i of withinRing(g, hub, g.mapR)) {
      if (g.tiles[i].dep < 2) { g.tiles[i].dep = 2; rich++; if (rich >= 4) break; }
    }
  }
  for (const i of withinRing(g, hub, 2)) {
    const h = coords[i];
    if (hash2d(S + 13, h.q, h.r) > 0.62) g.tiles[i].dep = Math.max(g.tiles[i].dep, 2);
  }

  // --- hub -------------------------------------------------------------------
  const hubT = g.tiles[hub];
  hubT.biome = 'barren';
  hubT.elev = Math.max(2, hubT.elev);
  hubT.structure = 'hub';
  hubT.fert = Math.max(hubT.fert, 20);
  hubT.moist = Math.max(hubT.moist, 18);
  g.hubIndex = hub;

  // --- planet vars --------------------------------------------------------------
  const oceanTiles = g.tiles.reduce((s2, t) => s2 + (t.biome === 'ocean' ? 1 : 0), 0);
  g.planet.temp = cfg.tempStart;
  g.planet.water = Math.min(30, 6 + oceanTiles * 0.9);
  g.planet.oxygen = g.mode === 'frozen' ? 3 : 5;
  g.planet.humidity = Math.max(2, 4 + oceanTiles * 0.6 + (g.mode === 'frozen' ? -2 : 0));
  g.planet.pressure = g.mode === 'frozen' ? 10 : 18;

  // --- starting resources (seeded jitter) ---------------------------------------
  let [j1, rs1] = rngInt(rng, 9); let [j2, rs2] = rngInt(rs1, 11); let [, rs3] = rngInt(rs2, 7);
  const rm = cfg.resMult;
  g.res = {
    water: Math.round(16 * rm) + j1,
    minerals: Math.round(20 * rm) + j2,
    energy: Math.round(8 * rm) + rs3.a % 6,
    biomass: 0,
    research: Math.round(6 * rm),
  };
  setRng(g, { a: rs3.a, b: rs3.b, c: rs3.c, d: rs3.d });
  if (cfg.techStart && !g.techDone.includes(cfg.techStart)) g.techDone.push(cfg.techStart);

  g.planetName = planetNameFor(g.seed);
  computeTerritory(g, 2);

  // --- starter objectives (3 distinct random optional goals) --------------------
  const pickPool = [...OBJECTIVE_POOL];
  let cur2 = g.rng as RngState;
  const chosenIds: string[] = [];
  for (let k = 0; k < 3 && pickPool.length > 0; k++) {
    const [i, s] = rngInt(cur2, pickPool.length);
    cur2 = s;
    chosenIds.push(pickPool.splice(i, 1)[0].id);
  }
  setRng(g, cur2);
  g.objectives = [
    { id: 'primary_self_sustaining', done: false },
    ...chosenIds.map((id) => ({ id, done: false })),
  ];

  pushSnapshot(g, true);
}
