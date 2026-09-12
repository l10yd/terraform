/**
 * Game state helpers: construction, indices, territory, tech aggregation.
 */
import { hexMapCoords, hexKey, hexDistance, type Hex } from '../core/hex';
import { seedRng, type RngState } from '../core/rng';
import { BIOME_ORDER, TECHS, type TechMod } from './defs';
import type { BiomeId, GameMode, GameState, TileState } from './types';

export const SAVE_VERSION = 3;

export function coordsOf(mapR: number): Hex[] {
  return hexMapCoords(mapR);
}

export function makeTile(): TileState {
  return { elev: 2, biome: 'barren', dev: 0, moist: 0, fert: 0, poll: 0, dep: 0, geo: 0, structure: null, tTf: 0, suit: 0 };
}

export function blankState(seed: string, mode: GameMode, mapR: number, planetName: string): GameState {
  const n = 3 * mapR * (mapR + 1) + 1;
  const tiles: TileState[] = [];
  for (let i = 0; i < n; i++) tiles.push(makeTile());
  return {
    version: SAVE_VERSION,
    seed, mode, mapR,
    hubIndex: 0,
    rng: seedRng(seed) as unknown as GameState['rng'],
    cycle: 1,
    tiles,
    inTerritory: new Array(n).fill(0),
    planet: { temp: -24, water: 8, oxygen: 4, humidity: 6, bio: 0, pressure: 12, fert: 2, stability: 8, pollution: 0 },
    res: { water: 18, minerals: 22, energy: 10, biomass: 0, research: 8 },
    techCurrent: null, techDone: [], techProgress: 0,
    modifiers: [], pendingChoice: null, recentEvents: [],
    objectives: [],
    stableCycles: 0,
    crisis: 0,
    stats: { placed: 0, structures: 0, combos: 0, eventsSeen: 0, decisionsMade: 0, peakBio: 0, peakWater: 0, techs: 0, tilesLost: 0 },
    phase: 1, score: 0, end: null,
    combos: [],
    snapshots: [],
    planetName,
  };
}

/** Shared coord/key lookups per map radius. */
const indexCache = new Map<number, { coords: Hex[]; keyToIdx: Map<string, number> }>();
export function mapIndex(mapR: number): { coords: Hex[]; keyToIdx: Map<string, number> } {
  let e = indexCache.get(mapR);
  if (!e) {
    const coords = coordsOf(mapR);
    const keyToIdx = new Map<string, number>();
    coords.forEach((h, i) => keyToIdx.set(hexKey(h.q, h.r), i));
    e = { coords, keyToIdx };
    indexCache.set(mapR, e);
  }
  return e;
}

export function tileHex(g: GameState, i: number): Hex {
  return mapIndex(g.mapR).coords[i];
}

export function tileIdxByKey(g: GameState, key: string): number {
  const i = mapIndex(g.mapR).keyToIdx.get(key);
  return i === undefined ? -1 : i;
}

export const NEI_KEYS: number[][] = (() => {
  // filled lazily per map radius in neighborsIdx
  return [];
})();

const neiCache = new Map<number, number[][]>();
/** Neighbor tile indices for every tile index. */
export function neighborsIdx(mapR: number): number[][] {
  let n = neiCache.get(mapR);
  if (!n) {
    const { coords, keyToIdx } = mapIndex(mapR);
    n = coords.map((h) => {
      const out: number[] = [];
      for (const d of DIRS6) {
        const i = keyToIdx.get(hexKey(h.q + d[0], h.r + d[1]));
        if (i !== undefined) out.push(i);
      }
      return out;
    });
    neiCache.set(mapR, n);
  }
  return n;
}
const DIRS6: [number, number][] = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

/** Tiles within distance d (inclusive) of tile i. */
const ringCache = new Map<string, number[]>();
export function withinDist(mapR: number, i: number, d: number): number[] {
  const ck = `${mapR}:${i}:${d}`;
  let r = ringCache.get(ck);
  if (!r) {
    const { coords } = mapIndex(mapR);
    const h = coords[i];
    r = [];
    for (let j = 0; j < coords.length; j++) {
      if (hexDistance(h, coords[j]) <= d) r.push(j);
    }
    ringCache.set(ck, r);
  }
  return r;
}

/** Territory = tiles within range of the hub or any habitat. */
export function computeTerritory(g: GameState, range: number): void {
  const { coords } = mapIndex(g.mapR);
  const nei = neighborsIdx(g.mapR);
  const n = g.tiles.length;
  g.inTerritory = new Array(n).fill(0);
  const centers: number[] = [];
  for (let i = 0; i < n; i++) {
    if (g.tiles[i].structure === 'hub' || g.tiles[i].structure === 'habitat') centers.push(i);
  }
  if (centers.length === 0) centers.push(tIdxOfNearest(g, 0, 0));
  const dist = new Array<number>(n).fill(Infinity);
  const queue: number[] = [];
  for (const c of centers) {
    dist[c] = 0;
    g.inTerritory[c] = 1;
    queue.push(c);
  }
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    if (dist[cur] >= range) continue;
    for (const nb of nei[cur]) {
      if (dist[nb] > dist[cur] + 1) {
        dist[nb] = dist[cur] + 1;
        g.inTerritory[nb] = 1;
        queue.push(nb);
      }
    }
  }
  void coords;
}

function tIdxOfNearest(g: GameState, q: number, r: number): number {
  const { coords } = mapIndex(g.mapR);
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < coords.length; i++) {
    const d = hexDistance(coords[i], { q, r });
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

/** Aggregated effects of all completed techs. */
export interface TechAgg {
  biomeCostMult: Record<string, number>;
  structCostMult: number;
  prodMult: Record<string, number>;
  unlockedBiomes: Set<BiomeId>;
  unlockedStructures: Set<string>;
  rangeAdd: number;
  climate: Record<string, number>;
  softCapAdd: Record<string, number>;
  bioMult: number;
  pollutionMult: number;
  eventGoodMult: number;
}

export function aggregateTechs(g: GameState): TechAgg {
  const agg: TechAgg = {
    biomeCostMult: {}, structCostMult: 1, prodMult: {}, unlockedBiomes: new Set(),
    unlockedStructures: new Set(), rangeAdd: 0, climate: {}, softCapAdd: {}, bioMult: 1,
    pollutionMult: 1, eventGoodMult: 1,
  };
  for (const id of g.techDone) {
    const def = TECHS[id];
    if (!def) continue;
    for (const m of def.mods) applyMod(agg, m);
  }
  return agg;
}

function applyMod(agg: TechAgg, m: TechMod): void {
  switch (m.kind) {
    case 'biomeCostMult': agg.biomeCostMult[m.target!] = (agg.biomeCostMult[m.target!] ?? 1) * m.val; break;
    case 'structCostMult': agg.structCostMult *= m.val; break;
    case 'prodMult': agg.prodMult[m.target!] = (agg.prodMult[m.target!] ?? 1) * m.val; break;
    case 'unlockBiome': agg.unlockedBiomes.add(m.target as BiomeId); break;
    case 'unlockStructure': agg.unlockedStructures.add(m.target!); break;
    case 'rangeAdd': agg.rangeAdd += m.val; break;
    case 'climate': agg.climate[m.target!] = (agg.climate[m.target!] ?? 0) + m.val; break;
    case 'softCapAdd': agg.softCapAdd[m.target!] = (agg.softCapAdd[m.target!] ?? 0) + m.val; break;
    case 'bioMult': agg.bioMult *= m.val; break;
    case 'pollutionMult': agg.pollutionMult *= m.val; break;
    case 'eventGoodMult': agg.eventGoodMult *= m.val; break;
    default: break;
  }
}

export function biomeIndex(b: BiomeId): number {
  return BIOME_ORDER.indexOf(b);
}

export function rngOf(g: GameState): RngState {
  return g.rng as RngState;
}

export function setRng(g: GameState, s: RngState): void {
  g.rng = { a: s.a, b: s.b, c: s.c, d: s.d };
}

/** Cheap deterministic hash of the whole state (for determinism tests). */
export function stateHash(g: GameState): string {
  let h = 0x811c9dc5 >>> 0;
  const mix = (x: number) => {
    h ^= Math.round(x * 1000) | 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  };
  mix(g.cycle); mix(g.planet.temp); mix(g.planet.oxygen); mix(g.planet.humidity);
  mix(g.planet.bio); mix(g.planet.water); mix(g.planet.pressure); mix(g.planet.fert);
  mix(g.planet.stability); mix(g.planet.pollution);
  mix(g.res.water); mix(g.res.minerals); mix(g.res.energy); mix(g.res.biomass); mix(g.res.research);
  for (const t of g.tiles) {
    mix(biomeIndex(t.biome)); mix(t.dev); mix(t.moist); mix(t.fert); mix(t.poll); mix(t.elev);
    mix(t.structure ? 1 : 0);
  }
  mix(g.rng.a); mix(g.rng.b); mix(g.rng.c); mix(g.rng.d);
  mix(g.techProgress);
  return h.toString(16);
}
