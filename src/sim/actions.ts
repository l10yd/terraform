/**
 * Player actions: placement rules, costs, chain reactions and what-if preview.
 * Preview clones only the touched tiles and re-runs the adjacency engine, so
 * the numbers shown before committing are exactly what will happen.
 */
import { BIOMES, FREE_STRUCTURES, LIVING_BIOMES, STRUCTURES, type RuleCtx } from './defs';
import { aggregateTechs, computeTerritory, neighborsIdx, tileIdxByKey, withinDist, type TechAgg } from './state';
import { mapIndex } from './state';
import { neighborsOfIdx } from './generation';
import { rngFloat, type RngState } from '../core/rng';
import { deriveAll } from './adjacency';
import type { BiomeId, Fx, GameState, ResMap, StructureId, TileState } from './types';

export function isBiomeUnlocked(g: GameState, agg: TechAgg, b: BiomeId): boolean {
  const def = BIOMES[b];
  if (!def.placeable) return false;
  return def.unlock === null || g.techDone.includes(def.unlock);
}

export function isStructureUnlocked(g: GameState, agg: TechAgg, s: StructureId): boolean {
  const def = STRUCTURES[s];
  if (def.unlock === null || FREE_STRUCTURES.includes(s)) return true;
  return agg.unlockedStructures.has(s) || g.techDone.includes(def.unlock);
}

export function buildCtx(g: GameState, i: number): RuleCtx {
  const nei = neighborsIdx(g.mapR);
  const nearBiomes = new Set<BiomeId>();
  const near2Biomes = new Set<BiomeId>();
  for (const j of nei[i]) nearBiomes.add(g.tiles[j].biome);
  for (const j of withinDist(g.mapR, i, 2)) near2Biomes.add(g.tiles[j].biome);
  const distinctNearBiomes = [...nearBiomes].filter((b) => b !== 'barren' && b !== 'rockwaste').length;
  return {
    neighbors: nei[i].map((j) => g.tiles[j]),
    nearBiomes, near2Biomes, distinctNearBiomes,
  };
}

export function biomeCost(g: GameState, agg: TechAgg, b: BiomeId): Partial<ResMap> {
  const base = BIOMES[b].cost;
  const m = agg.biomeCostMult[b] ?? 1;
  const out: Partial<ResMap> = {};
  (Object.keys(base) as (keyof ResMap)[]).forEach((k) => {
    out[k] = Math.max(1, Math.round((base[k] ?? 0) * m));
  });
  return out;
}

export function structureCost(g: GameState, agg: TechAgg, s: StructureId): Partial<ResMap> {
  const base = STRUCTURES[s].cost;
  const out: Partial<ResMap> = {};
  (Object.keys(base) as (keyof ResMap)[]).forEach((k) => {
    out[k] = Math.max(1, Math.round((base[k] ?? 0) * agg.structCostMult));
  });
  return out;
}

export function canAfford(res: ResMap, cost: Partial<ResMap>): boolean {
  return (Object.keys(cost) as (keyof ResMap)[]).every((k) => res[k] >= (cost[k] ?? 0));
}

export function payCost(res: ResMap, cost: Partial<ResMap>): void {
  (Object.keys(cost) as (keyof ResMap)[]).forEach((k) => { res[k] -= cost[k] ?? 0; });
}

export interface PlacementCheck {
  ok: boolean;
  reason?: string; // i18n key
}

/** Full validity check for placing biome or structure on a tile. */
export function checkPlacement(g: GameState, agg: TechAgg, i: number, biome?: BiomeId, structure?: StructureId): PlacementCheck {
  if (i < 0 || i >= g.tiles.length) return { ok: false, reason: 'err.noTile' };
  if (g.end) return { ok: false, reason: 'err.gameOver' };
  if (!g.inTerritory[i]) return { ok: false, reason: 'err.notInTerritory' };
  const t = g.tiles[i];

  if (biome) {
    const def = BIOMES[biome];
    if (!isBiomeUnlocked(g, agg, biome)) return { ok: false, reason: 'err.locked' };
    if (t.biome === biome) return { ok: false, reason: 'err.sameBiome' };
    if (t.structure) return { ok: false, reason: 'err.occupied' };
    if (def.req && !def.req(t, g, i, buildCtx(g, i))) return { ok: false, reason: def.reqKey };
    const cost = biomeCost(g, agg, biome);
    if (!canAfford(g.res, cost)) return { ok: false, reason: 'err.cost' };
    return { ok: true };
  }

  if (structure) {
    const def = STRUCTURES[structure];
    if (structure === 'hub') return { ok: false, reason: 'err.noBuildHub' };
    if (!isStructureUnlocked(g, agg, structure)) return { ok: false, reason: 'err.locked' };
    if (t.structure) return { ok: false, reason: 'err.occupied' };
    if (def.forbidBiome?.includes(t.biome)) return { ok: false, reason: 'err.badTerrain' };
    if (def.req && !def.req(t, g, i, buildCtx(g, i))) return { ok: false, reason: def.reqKey };
    const cost = structureCost(g, agg, structure);
    if (!canAfford(g.res, cost)) return { ok: false, reason: 'err.cost' };
    return { ok: true };
  }
  return { ok: false, reason: 'err.nothingSelected' };
}

/** After the raw placement, possible cascades. Returns transform FX. */
export function chainReactions(g: GameState, i: number, fx: Fx[]): void {
  const t = g.tiles[i];
  const p = g.planet;
  let rng: RngState = g.rng;
  const nei = neighborsOfIdx(g, i);
  const roll = (prob: number): boolean => {
    const [r, s] = rngFloat(rng);
    rng = s;
    return r < prob;
  };

  if (t.biome === 'alpine') {
    // rain shadow → river or wetland forms downhill
    const low = nei.filter((j) => g.tiles[j].elev <= 2 && (g.tiles[j].biome === 'barren' || g.tiles[j].biome === 'rockwaste'));
    for (const j of low) {
      const w = g.tiles[j];
      if (w.moist > 45 && roll(0.22)) {
        const from = w.biome;
        w.biome = BIOMES.river.unlock === null || g.techDone.includes('hyd_rivers') ? 'river' : 'wetland';
        w.moist = Math.max(w.moist, 55);
        w.tTf = g.cycle;
        fx.push({ kind: 'transform', tile: j, from, to: w.biome });
        break;
      } else if (w.moist > 30 && roll(0.1)) {
        w.moist = Math.min(100, w.moist + 18);
        break;
      }
    }
  }

  if (t.biome === 'forest' || t.biome === 'tropical') {
    // seeds drift to nearby soil
    for (const j of nei) {
      const w = g.tiles[j];
      if ((w.biome === 'barren' || w.biome === 'rockwaste') && w.fert > 25 && w.moist > 25 && roll(0.12)) {
        const from = w.biome;
        w.biome = 'grassland';
        w.dev = 0.3;
        w.tTf = g.cycle;
        fx.push({ kind: 'transform', tile: j, from, to: 'grassland' });
      }
    }
  }

  if (t.biome === 'ocean') {
    // shore moisture rush
    for (const j of nei) {
      g.tiles[j].moist = Math.min(100, g.tiles[j].moist + 14);
    }
    if (p.temp > -4 && t.elev === 0) {
      // flood spreading into an adjacent basin
      const low = nei.filter((j) => g.tiles[j].elev === 0 && g.tiles[j].biome === 'barren');
      if (low.length && roll(0.18)) {
        const j = low[0];
        const from = g.tiles[j].biome;
        g.tiles[j].biome = 'ocean';
        g.tiles[j].moist = 70;
        g.tiles[j].tTf = g.cycle;
        fx.push({ kind: 'transform', tile: j, from, to: 'ocean' });
      }
    }
  }

  if (t.biome === 'river') {
    // river finds the sea: extend downhill toward water
    const down = nei.filter((j) => g.tiles[j].elev < t.elev + 0.001 && (g.tiles[j].biome === 'barren' || g.tiles[j].biome === 'rockwaste'));
    if (down.length && roll(0.16)) {
      down.sort((a, b) => g.tiles[a].elev - g.tiles[b].elev);
      const j = down[0];
      const from = g.tiles[j].biome;
      g.tiles[j].biome = 'river';
      g.tiles[j].moist = Math.max(g.tiles[j].moist, 55);
      g.tiles[j].tTf = g.cycle;
      fx.push({ kind: 'transform', tile: j, from, to: 'river' });
    }
    for (const j of nei) g.tiles[j].moist = Math.min(100, g.tiles[j].moist + 8);
  }

  if (t.biome === 'ecozone') {
    for (const j of nei) {
      const w = g.tiles[j];
      if (['grassland', 'forest', 'wetland', 'tropical', 'tundra'].includes(w.biome)) {
        w.dev = Math.min(3, w.dev + 0.35);
        w.fert = Math.min(100, w.fert + 6);
      }
    }
  }

  g.rng = rng as GameState['rng'];
}

/** Apply the (already checked) placement immediately. */
export function applyPlacement(g: GameState, agg: TechAgg, i: number, fx: Fx[], biome?: BiomeId, structure?: StructureId): boolean {
  const check = checkPlacement(g, agg, i, biome, structure);
  if (!check.ok) return false;
  const t = g.tiles[i];

  if (biome) {
    const cost = biomeCost(g, agg, biome);
    payCost(g.res, cost);
    const from = t.biome;
    t.biome = biome;
    if (biome === 'rockwaste') t.dev = 1;
    else if (biome === 'ocean' || biome === 'river') t.dev = 3;
    else {
      t.dev = Math.max(0.6, t.dev);
      // terraforming groundwork: the crew conditions soil & microclimate at
      // the site. Climate pulls the tile back toward true environmental
      // suitability afterwards — planting where nothing can live still dies.
      t.suit = Math.max(t.suit, 0.5);
      t.fert = Math.max(t.fert, 24);
      t.moist = Math.max(t.moist, 14);
    }
    t.tTf = g.cycle;
    g.stats.placed++;
    fx.push({ kind: 'place', tile: i, biome, structure: null });
    if (from !== biome) fx.push({ kind: 'transform', tile: i, from, to: biome });
    chainReactions(g, i, fx);
    return true;
  }

  if (structure) {
    const cost = structureCost(g, agg, structure);
    payCost(g.res, cost);
    t.structure = structure;
    if (t.dev < 1 && t.biome === 'barren') t.biome = 'rockwaste';
    t.tTf = g.cycle;
    g.stats.placed++;
    g.stats.structures++;
    fx.push({ kind: 'place', tile: i, biome: t.biome, structure });
    if (structure === 'habitat') computeTerritory(g, 2 + agg.rangeAdd);
    return true;
  }
  return false;
}

export interface Preview {
  ok: boolean;
  reason?: string;
  cost: Partial<ResMap>;
  deltas: { res: Partial<ResMap>; planet: Partial<Record<keyof GameState['planet'], number>> };
  comboIds: string[];
  affected: number[]; // tiles whose yields change meaningfully
}

/**
 * What-if preview: clone touched tile state, rerun derivation, diff.
 * Used by the hover panel (§27) and by the placement confirmation.
 */
export function previewPlacement(g: GameState, i: number, biome?: BiomeId, structure?: StructureId): Preview {
  const agg = aggregateTechs(g);
  const before = deriveAll(g, agg);
  const t = g.tiles[i];
  const saved: TileState = { ...t };
  const ok = checkPlacement(g, agg, i, biome, structure).ok;
  const cost = biome ? biomeCost(g, agg, biome) : structure ? structureCost(g, agg, structure) : {};
  if (!ok) {
    return {
      ok: false, reason: checkPlacement(g, agg, i, biome, structure).reason, cost,
      deltas: { res: {}, planet: {} }, comboIds: [], affected: [],
    };
  }
  // mutate tile, rerun derivation, then restore
  try {
    if (biome) {
      t.biome = biome;
      t.dev = ['ocean', 'river'].includes(biome) ? 3 : Math.max(t.dev, biome === 'rockwaste' ? 1 : 0.6);
      if (LIVING_BIOMES.includes(biome)) {
        // mirror the groundwork from applyPlacement so the preview is honest
        t.suit = Math.max(t.suit, 0.5);
        t.fert = Math.max(t.fert, 24);
        t.moist = Math.max(t.moist, 14);
      }
      t.suit = Math.max(t.suit, BIOMES[biome].suit({ ...t }, g.planet));
    }
    if (structure) t.structure = structure;
    const after = deriveAll(g, agg);
    const res: Partial<ResMap> = {};
    (['water', 'minerals', 'energy', 'biomass', 'research'] as const).forEach((k) => {
      const v = (after.totals.prod[k] - after.totals.use[k]) - (before.totals.prod[k] - before.totals.use[k]);
      if (Math.abs(v) >= 0.05) res[k] = Math.round(v * 10) / 10;
    });
    const planet: Preview['deltas']['planet'] = {};
    const pairs: [keyof GameState['planet'], number][] = [
      ['temp', after.totals.dTemp - before.totals.dTemp],
      ['oxygen', after.totals.dOxy - before.totals.dOxy],
      ['humidity', after.totals.dHum - before.totals.dHum],
      ['bio', after.totals.dBio - before.totals.dBio],
      ['pollution', after.totals.dPoll - before.totals.dPoll],
      ['pressure', after.totals.dPressure - before.totals.dPressure],
    ];
    for (const [k, v] of pairs) if (Math.abs(v) >= 0.01) planet[k] = Math.round(v * 100) / 100;
    const affected: number[] = [];
    for (let j = 0; j < g.tiles.length; j++) {
      const a = before.ty[j];
      const b2 = after.ty[j];
      const diff = Math.abs(a.bioPts - b2.bioPts) + Math.abs(a.wProd - b2.wProd) + Math.abs(a.eProd - b2.eProd)
        + Math.abs(a.mProd - b2.mProd) + Math.abs(a.rp - b2.rp) + Math.abs(a.moistAdd - b2.moistAdd);
      if (diff > 0.05) affected.push(j);
    }
    const newCombos = after.combosFound.filter((c) => c.tiles.includes(i) ||
      !before.combosFound.some((bc) => bc.id === c.id && bc.tiles.length === c.tiles.length));
    return { ok: true, cost, deltas: { res, planet }, comboIds: newCombos.map((c) => c.id), affected };
  } finally {
    Object.assign(t, saved);
  }
}

export function findHubIndex(g: GameState): number {
  for (let i = 0; i < g.tiles.length; i++) if (g.tiles[i].structure === 'hub') return i;
  return 0;
}

export { tileIdxByKey, mapIndex };
