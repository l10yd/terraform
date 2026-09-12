/**
 * Static content definitions: biomes, structures, technologies, combos.
 * These are code (pure data + pure functions), never part of saved state.
 */
import type { BiomeId, StructureId, TechId, ResId, ResMap, TileState, PlanetState, GameState } from './types';

export const RES_IDS: ResId[] = ['water', 'minerals', 'energy', 'biomass', 'research'];
export const BIOME_ORDER: BiomeId[] = [
  'barren', 'rockwaste', 'mineralfield', 'tundra', 'grassland', 'forest', 'wetland',
  'desert', 'ocean', 'alpine', 'tropical', 'ecozone', 'river',
];
export const LIVING_BIOMES: BiomeId[] = ['tundra', 'grassland', 'forest', 'wetland', 'alpine', 'tropical', 'ecozone', 'river'];
export const WATER_BIOMES: BiomeId[] = ['ocean', 'river'];

export interface SuitFn {
  (t: TileState, p: PlanetState): number; // 0..1
}
export interface PlaceReq {
  (t: TileState, g: GameState, idx: number, ctx: RuleCtx): boolean;
}
export interface YieldsSpec {
  wProd?: number; wUse?: number; mProd?: number; eProd?: number; eUse?: number;
  bio?: number; rp?: number;
  /** planet deltas per cycle at dev=3, suit=1 (scaled by suit*devFactor) */
  dT?: number; dO2?: number; dH?: number; dP?: number; dPoll?: number;
  /** local effects */
  moistAdd?: number; fertAdd?: number;
  /** base biodiversity value */
  bioBase?: number;
}

export interface BiomeDef {
  id: BiomeId;
  /** can the player place this biome directly? */
  placeable: boolean;
  unlock: TechId | null;
  cost: Partial<ResMap>;
  icon: string;
  /** rgb 0..1 for rendering / UI chips */
  color: [number, number, number];
  y: YieldsSpec;
  suit: SuitFn;
  /** placement terrain requirement; message key if false */
  req: PlaceReq | null;
  reqKey: string;
  /** how quickly dev can rise here per cycle when suit is high (0..3 scale) */
  grow: number;
  descKey: string;
}

/** Extra context passed to placement rules that need neighbor info. */
export interface RuleCtx {
  neighbors: (TileState | null)[]; // 6
  nearBiomes: Set<BiomeId>; // biome of neighbor tiles
  near2Biomes: Set<BiomeId>;
  distinctNearBiomes: number;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
/** bell curve: 1 at center, 0 outside half-width */
function bell(x: number, c: number, w: number): number {
  const d = Math.abs(x - c) / w;
  return d >= 1 ? 0 : 1 - d * d;
}
const minScale = (x: number, need: number) => clamp01(x / need);

export const BIOMES: Record<BiomeId, BiomeDef> = {
  barren: {
    id: 'barren', placeable: false, unlock: null, cost: {}, icon: '∅',
    color: [0.40, 0.365, 0.32], y: { bioBase: 0 }, suit: () => 1, req: null, reqKey: '',
    grow: 0, descKey: 'biome.barren',
  },
  rockwaste: {
    id: 'rockwaste', placeable: true, unlock: null, cost: { minerals: 3 }, icon: '▒',
    color: [0.33, 0.32, 0.315], y: { bioBase: 1, mProd: 0.15, fertAdd: 2 },
    suit: (t) => 0.35 + 0.2 * clamp01(t.elev / 4), req: null, reqKey: '',
    grow: 0.06, descKey: 'biome.rockwaste',
  },
  mineralfield: {
    id: 'mineralfield', placeable: true, unlock: 'geo_seismic', cost: { minerals: 6, energy: 3 }, icon: '◆',
    color: [0.355, 0.385, 0.44], y: { bioBase: 2, mProd: 1.6, dPoll: 0.25 },
    suit: (t) => (t.dep > 0 ? 0.5 + 0.18 * t.dep : 0), req: (t) => t.dep > 0, reqKey: 'req.deposit',
    grow: 0.05, descKey: 'biome.mineralfield',
  },
  tundra: {
    id: 'tundra', placeable: true, unlock: null, cost: { water: 4, minerals: 3 }, icon: '❄',
    color: [0.5, 0.565, 0.52], y: { bioBase: 6, dO2: 0.10, bio: 0.25, moistAdd: 0.5, fertAdd: 3 },
    suit: (t, p) => bell(p.temp, -6, 36) * minScale(t.fert, 16) * clamp01(0.3 + t.moist / 40),
    req: (t) => t.elev <= 4, reqKey: 'req.lowland', grow: 0.13, descKey: 'biome.tundra',
  },
  grassland: {
    id: 'grassland', placeable: true, unlock: null, cost: { water: 6, minerals: 4 }, icon: '≈',
    color: [0.34, 0.62, 0.22], y: { bioBase: 12, dO2: 0.22, dH: 0.18, bio: 0.5, moistAdd: 0.8, fertAdd: 4 },
    suit: (t, p) => bell(p.temp, 7, 33) * minScale(t.fert, 26) * minScale(t.moist, 22),
    req: (t) => t.elev >= 1 && t.elev <= 3, reqKey: 'req.plains', grow: 0.18, descKey: 'biome.grassland',
  },
  forest: {
    id: 'forest', placeable: true, unlock: null, cost: { water: 11, minerals: 6 }, icon: '♠',
    color: [0.1, 0.34, 0.13], y: { bioBase: 20, dO2: 0.5, dH: 0.4, dT: -0.018, bio: 1.0, moistAdd: 1.6, fertAdd: 5 },
    suit: (t, p) => bell(p.temp, 9, 33) * minScale(t.fert, 40) * minScale(t.moist, 34),
    req: null, reqKey: '', grow: 0.14, descKey: 'biome.forest',
  },
  wetland: {
    id: 'wetland', placeable: true, unlock: 'bio_lichen', cost: { water: 8, minerals: 4, biomass: 2 }, icon: '≋',
    color: [0.15, 0.44, 0.33], y: { bioBase: 24, dO2: 0.3, dH: 0.55, bio: 1.4, moistAdd: 2.2, fertAdd: 6, dPoll: -0.2 },
    suit: (t, p) => bell(p.temp, 11, 34) * minScale(t.moist, 50) * minScale(t.fert, 32),
    req: (t, _g, _i, ctx) => t.elev <= 2 && (t.moist >= 45 || hasWaterNeighbor(ctx)),
    reqKey: 'req.wetlow', grow: 0.11, descKey: 'biome.wetland',
  },
  desert: {
    id: 'desert', placeable: true, unlock: null, cost: { minerals: 3 }, icon: '∴',
    color: [0.68, 0.56, 0.34], y: { bioBase: 2, dT: 0.012, dH: -0.25 },
    suit: (t, p) => clamp01(0.25 + (p.temp - 5) / 40) * (t.moist < 55 ? 1 : 0.25),
    req: (t) => t.elev <= 3, reqKey: 'req.lowland', grow: 0.05, descKey: 'biome.desert',
  },
  ocean: {
    id: 'ocean', placeable: true, unlock: null, cost: { water: 12, minerals: 6 }, icon: '◉',
    color: [0.09, 0.28, 0.46], y: { bioBase: 8, dH: 0.8, dT: 0.0, moistAdd: 4 },
    suit: (t, p) => (t.elev <= 1 ? 1 : 0.15) * clamp01((p.temp + 60) / 45),
    req: (t, _g, _i, ctx) => t.elev <= 1 && (t.moist >= 35 || hasWaterNeighbor(ctx)),
    reqKey: 'req.basin', grow: 0.14, descKey: 'biome.ocean',
  },
  alpine: {
    id: 'alpine', placeable: true, unlock: 'geo_orogeny', cost: { minerals: 14, energy: 4 }, icon: '▲',
    color: [0.55, 0.58, 0.63], y: { bioBase: 9, dH: 0.5, moistAdd: 2.5, dT: -0.006 },
    suit: (t) => (t.elev >= 3 ? 1 : 0.2),
    req: (t) => t.elev >= 3, reqKey: 'req.highland', grow: 0.08, descKey: 'biome.alpine',
  },
  tropical: {
    id: 'tropical', placeable: true, unlock: 'bio_canopy', cost: { water: 15, minerals: 8, biomass: 5 }, icon: '❖',
    color: [0.14, 0.47, 0.23], y: { bioBase: 34, dO2: 0.75, dH: 0.6, dT: -0.010, bio: 1.8, moistAdd: 1.8, fertAdd: 4 },
    suit: (t, p) => bell(p.temp, 26, 16) * minScale(t.fert, 55) * minScale(t.moist, 48),
    req: (t) => t.elev >= 1 && t.elev <= 2, reqKey: 'req.lowland', grow: 0.13, descKey: 'biome.tropical',
  },
  ecozone: {
    id: 'ecozone', placeable: true, unlock: 'hab_terra', cost: { water: 16, minerals: 12, biomass: 8, energy: 6 }, icon: '✳',
    color: [0.26, 0.62, 0.42], y: { bioBase: 42, dO2: 0.5, dH: 0.5, bio: 2.4, moistAdd: 1.5, fertAdd: 8, dPoll: -0.5 },
    suit: (t, p) => bell(p.temp, 16, 26) * minScale(t.fert, 65) * minScale(t.moist, 45),
    req: (t, _g, _i, ctx) => ctx.distinctNearBiomes >= 2, reqKey: 'req.diversity',
    grow: 0.1, descKey: 'biome.ecozone',
  },
  river: {
    id: 'river', placeable: true, unlock: 'hyd_rivers', cost: { water: 7, minerals: 4 }, icon: '∿',
    color: [0.22, 0.48, 0.68], y: { bioBase: 14, dH: 0.3, moistAdd: 5, dO2: 0.08 },
    suit: (t) => (t.elev <= 3 ? 0.9 : 0.3),
    req: (_t, _g, _i, ctx) => hasWaterNeighbor(ctx), reqKey: 'req.waterlink',
    grow: 0.12, descKey: 'biome.river',
  },
};

function hasWaterNeighbor(ctx: RuleCtx): boolean {
  return ctx.nearBiomes.has('ocean') || ctx.nearBiomes.has('river') || ctx.nearBiomes.has('wetland');
}

export const STRUCTURE_ORDER: StructureId[] = [
  'hub', 'solar', 'battery', 'extractor', 'mine', 'geo', 'research', 'atmos', 'biodivlab', 'weather', 'habitat',
];

export interface StructureDef {
  id: StructureId;
  unlock: TechId | null;
  cost: Partial<ResMap>;
  icon: string;
  color: [number, number, number];
  /** per-cycle production at planet-normal conditions */
  y: YieldsSpec;
  /** placement requirement */
  req: PlaceReq | null;
  reqKey: string;
  /** adjacency flavor: production multiplier per matching neighbor biome (see adjStructure) */
  descKey: string;
  pollution: number;
  /** cannot coexist with biome */
  forbidBiome?: BiomeId[];
}

export const STRUCTURES: Record<StructureId, StructureDef> = {
  hub: {
    id: 'hub', unlock: null, cost: {}, icon: '⌂', color: [0.72, 0.62, 0.45],
    y: { mProd: 0.6, eProd: 0.5, rp: 0.3, wProd: 0.4 }, req: null, reqKey: '', pollution: 0.15,
    descKey: 'struct.hub',
  },
  solar: {
    id: 'solar', unlock: 'nrg_pv', cost: { minerals: 8 }, icon: '☀', color: [0.75, 0.65, 0.35],
    y: { eProd: 2.2 }, req: (t) => t.elev <= 3, reqKey: 'req.lowland', pollution: 0,
    descKey: 'struct.solar', forbidBiome: ['ocean', 'river'],
  },
  battery: {
    id: 'battery', unlock: 'nrg_grid', cost: { minerals: 10, energy: 4 }, icon: '▣', color: [0.5, 0.55, 0.68],
    y: { eProd: 0.3 }, req: null, reqKey: '', pollution: 0.05, descKey: 'struct.battery',
  },
  extractor: {
    id: 'extractor', unlock: null, cost: { minerals: 9, energy: 3 }, icon: '↊', color: [0.45, 0.6, 0.66],
    y: { wProd: 2.6, eUse: 0.8, dPoll: 0.1 }, req: (t, _g, _i, ctx) => t.moist >= 30 || hasWaterNeighbor(ctx),
    reqKey: 'req.ice', pollution: 0.1, descKey: 'struct.extractor',
  },
  mine: {
    id: 'mine', unlock: 'geo_drill', cost: { minerals: 6, energy: 4 }, icon: '⛏', color: [0.55, 0.47, 0.4],
    y: { mProd: 3.2, eUse: 0.6, dPoll: 0.5, fertAdd: -6 }, req: (t) => t.dep >= 2, reqKey: 'req.richdeposit',
    pollution: 0.5, descKey: 'struct.mine', forbidBiome: ['ocean', 'river', 'ecozone', 'wetland'],
  },
  geo: {
    id: 'geo', unlock: 'nrg_geo', cost: { minerals: 14 }, icon: '♨', color: [0.66, 0.42, 0.32],
    y: { eProd: 3.6, dPoll: 0.6, dT: 0.04 }, req: (t) => t.geo === 1, reqKey: 'req.geothermal',
    pollution: 0.6, descKey: 'struct.geo',
  },
  research: {
    id: 'research', unlock: null, cost: { minerals: 10, energy: 4 }, icon: '⚗', color: [0.52, 0.55, 0.72],
    y: { rp: 2.2, eUse: 1.0 }, req: null, reqKey: '', pollution: 0.05, descKey: 'struct.research',
  },
  atmos: {
    id: 'atmos', unlock: 'atm_processor', cost: { minerals: 16, energy: 6 }, icon: '⇪', color: [0.56, 0.66, 0.72],
    y: { dO2: 1.6, dH: 0.6, eUse: 2.0, dT: 0.08 }, req: (t) => t.elev <= 3, reqKey: 'req.lowland',
    pollution: 0.1, descKey: 'struct.atmos',
  },
  biodivlab: {
    id: 'biodivlab', unlock: 'bio_diversity', cost: { minerals: 12, biomass: 6, energy: 4 }, icon: '❈', color: [0.4, 0.66, 0.5],
    y: { rp: 0.8, bio: 0.6, eUse: 0.6 }, req: null, reqKey: '', pollution: 0, descKey: 'struct.biodivlab',
  },
  weather: {
    id: 'weather', unlock: 'atm_control', cost: { minerals: 14, energy: 8 }, icon: '⛆', color: [0.48, 0.62, 0.75],
    y: { eUse: 1.4, dH: 0.8, moistAdd: 2 }, req: null, reqKey: '', pollution: 0, descKey: 'struct.weather',
  },
  habitat: {
    id: 'habitat', unlock: 'hab_prefab', cost: { minerals: 14, energy: 3, water: 6 }, icon: '⌾', color: [0.7, 0.66, 0.58],
    y: { rp: 0.5, eUse: 0.8, wUse: 1.0, dPoll: 0.2 }, req: null, reqKey: '', pollution: 0.15,
    descKey: 'struct.habitat', forbidBiome: ['ocean', 'river', 'alpine'],
  },
};

// ---------------------------------------------------------------------------
// Technologies
// ---------------------------------------------------------------------------

export type TechBranch = 'geology' | 'hydrology' | 'biology' | 'atmosphere' | 'energy' | 'habitats';
export const TECH_BRANCHES: TechBranch[] = ['geology', 'hydrology', 'biology', 'atmosphere', 'energy', 'habitats'];

export type ModKind =
  | 'biomeCostMult' | 'structCostMult' | 'prodMult' | 'unlockBiome' | 'unlockStructure'
  | 'rangeAdd' | 'climate' | 'softCapAdd' | 'bioMult' | 'pollutionMult' | 'placeOnTerritoryOnly'
  | 'riverFree' | 'eventGoodMult' | 'snapshots';

export interface TechMod {
  kind: ModKind;
  target?: string; // res id / biome id / climate key
  val: number;
}

export interface TechDef {
  id: TechId;
  branch: TechBranch;
  tier: number;
  cost: number;
  reqs: TechId[];
  mods: TechMod[];
  icon: string;
  descKey: string;
}

export const TECHS: Record<string, TechDef> = {};
function tech(d: Omit<TechDef, 'mods'> & { mods?: TechMod[] }): void {
  TECHS[d.id] = { mods: [], ...d };
}

tech({ id: 'geo_drill', branch: 'geology', tier: 1, cost: 34, reqs: [], icon: '⛏', descKey: 'tech.geo_drill', mods: [{ kind: 'unlockStructure', target: 'mine', val: 1 }] });
tech({ id: 'geo_seismic', branch: 'geology', tier: 2, cost: 58, reqs: ['geo_drill'], icon: '◫', descKey: 'tech.geo_seismic', mods: [{ kind: 'unlockBiome', target: 'mineralfield', val: 1 }, { kind: 'prodMult', target: 'minerals', val: 1.15 }] });
tech({ id: 'geo_orogeny', branch: 'geology', tier: 3, cost: 96, reqs: ['geo_seismic'], icon: '▲', descKey: 'tech.geo_orogeny', mods: [{ kind: 'unlockBiome', target: 'alpine', val: 1 }, { kind: 'climate', target: 'rainBoost', val: 0.15 }] });
tech({ id: 'geo_mantle', branch: 'geology', tier: 4, cost: 150, reqs: ['geo_orogeny'], icon: '☊', descKey: 'tech.geo_mantle', mods: [{ kind: 'prodMult', target: 'minerals', val: 1.2 }, { kind: 'climate', target: 'volcRisk', val: -0.5 }] });

tech({ id: 'hyd_rivers', branch: 'hydrology', tier: 1, cost: 36, reqs: [], icon: '∿', descKey: 'tech.hyd_rivers', mods: [{ kind: 'unlockBiome', target: 'river', val: 1 }] });
tech({ id: 'hyd_aquifer', branch: 'hydrology', tier: 2, cost: 62, reqs: ['hyd_rivers'], icon: 'ↆ', descKey: 'tech.hyd_aquifer', mods: [{ kind: 'prodMult', target: 'water', val: 1.25 }, { kind: 'climate', target: 'moistDrift', val: 0.4 }] });
tech({ id: 'hyd_seedcloud', branch: 'hydrology', tier: 3, cost: 104, reqs: ['hyd_aquifer'], icon: '☁', descKey: 'tech.hyd_seedcloud', mods: [{ kind: 'climate', target: 'rainBoost', val: 0.2 }, { kind: 'unlockStructure', target: 'weather', val: 1 }] });
tech({ id: 'hyd_comet', branch: 'hydrology', tier: 4, cost: 168, reqs: ['hyd_seedcloud'], icon: '☄', descKey: 'tech.hyd_comet', mods: [{ kind: 'prodMult', target: 'water', val: 1.3 }, { kind: 'climate', target: 'oceanFill', val: 6 }] });

tech({ id: 'bio_lichen', branch: 'biology', tier: 1, cost: 30, reqs: [], icon: '❋', descKey: 'tech.bio_lichen', mods: [{ kind: 'unlockBiome', target: 'wetland', val: 1 }, { kind: 'biomeCostMult', target: 'tundra', val: 0.8 }] });
tech({ id: 'bio_mycorrhiza', branch: 'biology', tier: 2, cost: 56, reqs: ['bio_lichen'], icon: '❂', descKey: 'tech.bio_mycorrhiza', mods: [{ kind: 'climate', target: 'netLinkBoost', val: 0.2 }, { kind: 'biomeCostMult', target: 'forest', val: 0.85 }] });
tech({ id: 'bio_canopy', branch: 'biology', tier: 3, cost: 100, reqs: ['bio_mycorrhiza'], icon: '❖', descKey: 'tech.bio_canopy', mods: [{ kind: 'unlockBiome', target: 'tropical', val: 1 }, { kind: 'bioMult', val: 1.15 }] });
tech({ id: 'bio_diversity', branch: 'biology', tier: 4, cost: 158, reqs: ['bio_canopy'], icon: '⚛', descKey: 'tech.bio_diversity', mods: [{ kind: 'unlockStructure', target: 'biodivlab', val: 1 }, { kind: 'bioMult', val: 1.2 }] });

tech({ id: 'atm_greenhouse', branch: 'atmosphere', tier: 1, cost: 34, reqs: [], icon: '♨', descKey: 'tech.atm_greenhouse', mods: [{ kind: 'climate', target: 'greenhouse', val: 0.25 }, { kind: 'climate', target: 'greenhouseBase', val: 0.06 }] });
tech({ id: 'atm_processor', branch: 'atmosphere', tier: 2, cost: 64, reqs: ['atm_greenhouse'], icon: '⇪', descKey: 'tech.atm_processor', mods: [{ kind: 'unlockStructure', target: 'atmos', val: 1 }, { kind: 'climate', target: 'o2Boost', val: 0.2 }] });
tech({ id: 'atm_pressure', branch: 'atmosphere', tier: 3, cost: 108, reqs: ['atm_processor'], icon: '⊙', descKey: 'tech.atm_pressure', mods: [{ kind: 'climate', target: 'pressureGain', val: 0.35 }, { kind: 'climate', target: 'tempDrift', val: -0.04 }] });
tech({ id: 'atm_control', branch: 'atmosphere', tier: 4, cost: 165, reqs: ['atm_pressure'], icon: '◍', descKey: 'tech.atm_control', mods: [{ kind: 'eventGoodMult', val: 1.5 }, { kind: 'climate', target: 'disasterShield', val: 0.4 }] });

tech({ id: 'nrg_pv', branch: 'energy', tier: 1, cost: 32, reqs: [], icon: '☀', descKey: 'tech.nrg_pv', mods: [{ kind: 'unlockStructure', target: 'solar', val: 1 }] });
tech({ id: 'nrg_grid', branch: 'energy', tier: 2, cost: 58, reqs: ['nrg_pv'], icon: '▣', descKey: 'tech.nrg_grid', mods: [{ kind: 'unlockStructure', target: 'battery', val: 1 }, { kind: 'softCapAdd', target: 'energy', val: 60 }, { kind: 'prodMult', target: 'energy', val: 1.1 }] });
tech({ id: 'nrg_geo', branch: 'energy', tier: 3, cost: 102, reqs: ['nrg_grid'], icon: '♨', descKey: 'tech.nrg_geo', mods: [{ kind: 'unlockStructure', target: 'geo', val: 1 }, { kind: 'prodMult', target: 'energy', val: 1.15 }] });
tech({ id: 'nrg_fusion', branch: 'energy', tier: 4, cost: 170, reqs: ['nrg_geo'], icon: '✦', descKey: 'tech.nrg_fusion', mods: [{ kind: 'prodMult', target: 'energy', val: 1.3 }, { kind: 'climate', target: 'tempDrift', val: -0.03 }] });

tech({ id: 'hab_prefab', branch: 'habitats', tier: 1, cost: 40, reqs: [], icon: '⌾', descKey: 'tech.hab_prefab', mods: [{ kind: 'unlockStructure', target: 'habitat', val: 1 }, { kind: 'rangeAdd', val: 1 }] });
tech({ id: 'hab_expansion', branch: 'habitats', tier: 2, cost: 70, reqs: ['hab_prefab'], icon: '⧉', descKey: 'tech.hab_expansion', mods: [{ kind: 'rangeAdd', val: 2 }] });
tech({ id: 'hab_arcology', branch: 'habitats', tier: 3, cost: 115, reqs: ['hab_expansion'], icon: '⌬', descKey: 'tech.hab_arcology', mods: [{ kind: 'prodMult', target: 'research', val: 1.25 }, { kind: 'pollutionMult', val: 0.8 }] });
tech({ id: 'hab_terra', branch: 'habitats', tier: 4, cost: 178, reqs: ['hab_arcology', 'bio_diversity'], icon: '✳', descKey: 'tech.hab_terra', mods: [{ kind: 'unlockBiome', target: 'ecozone', val: 1 }, { kind: 'bioMult', val: 1.25 }] });

export const STARTER_TECHS: TechId[] = [];

/** Structures available from cycle 1 (research station is a starting build too). */
export const FREE_STRUCTURES: StructureId[] = ['extractor', 'research'];

// ---------------------------------------------------------------------------
// Combos — reward clever adjacency. Evaluated per anchor tile.
// ---------------------------------------------------------------------------

export interface ComboDef {
  id: string;
  /** required biomes that must all appear in anchor + neighbors */
  requires: BiomeId[];
  /** per-tile bonus applied to every member tile of the combo */
  bonus: { rp?: number; bio?: number; eProd?: number; wProd?: number; dH?: number; dO2?: number };
  descKey: string;
}

export const COMBOS: ComboDef[] = [
  { id: 'watershed', requires: ['alpine', 'forest', 'river'], bonus: { wProd: 0.6, bio: 1.5 }, descKey: 'combo.watershed' },
  { id: 'thriving', requires: ['forest', 'wetland', 'river'], bonus: { bio: 2.2, dO2: 0.25 }, descKey: 'combo.thriving' },
  { id: 'grid', requires: ['grassland'], bonus: { eProd: 0.8, rp: 0.4 }, descKey: 'combo.grid' }, // solar+battery adjacency handled in code
  { id: 'hotspot', requires: ['forest', 'wetland', 'grassland', 'river'], bonus: { bio: 3.2, rp: 0.5 }, descKey: 'combo.hotspot' },
  { id: 'oasisis', requires: ['river', 'grassland'], bonus: { bio: 1.2, wProd: 0.4 }, descKey: 'combo.oasisis' },
];

/** battery/solar structures must be neighbors for the grid combo */
export const GRID_COMBO_STRUCTS: [StructureId, StructureId] = ['solar', 'battery'];

// ---------------------------------------------------------------------------
// Placement tray grouping & icons helpers
// ---------------------------------------------------------------------------

export function biomeColorHex(id: BiomeId): string {
  const [r, g, b] = BIOMES[id].color;
  const c = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

export interface CostMod {
  cost: Partial<ResMap>;
}

export function scaleCost(cost: Partial<ResMap>, m: number): CostMod {
  const out: Partial<ResMap> = {};
  for (const k of RES_IDS) {
    const v = cost[k as ResId];
    if (v) out[k as ResId] = Math.max(1, Math.round(v * m));
  }
  return { cost: out };
}

export function costText(cost: Partial<ResMap>): string {
  const icons: Record<ResId, string> = { water: '💧', minerals: '⛁', energy: '⚡', biomass: '❧', research: '◉' };
  return RES_IDS.filter((k) => cost[k]).map((k) => `${icons[k]}${cost[k]}`).join(' ');
}
