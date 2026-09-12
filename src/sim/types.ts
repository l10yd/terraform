/**
 * Simulation types — the entire game state is a plain, serializable object.
 * No functions, no Maps/Sets (use arrays), all numbers/strings.
 */

export type BiomeId =
  | 'barren' | 'rockwaste' | 'mineralfield'
  | 'tundra' | 'grassland' | 'forest' | 'wetland'
  | 'desert' | 'ocean' | 'alpine' | 'tropical'
  | 'ecozone' | 'river';

export type StructureId =
  | 'hub' | 'solar' | 'geo' | 'extractor' | 'atmos' | 'research'
  | 'habitat' | 'biodivlab' | 'weather' | 'battery' | 'mine';

export type TechId = string;

export type ResId = 'water' | 'minerals' | 'energy' | 'biomass' | 'research';

export type ResMap = Record<ResId, number>;

export interface TileState {
  /** elevation 0(deep basin)..5(peak) */
  elev: number;
  biome: BiomeId;
  /** development stage 0..3 — drives vegetation density / visual maturity */
  dev: number;
  /** local moisture 0..100 */
  moist: number;
  /** soil fertility 0..100 */
  fert: number;
  /** local pollution 0..100 */
  poll: number;
  /** mineral deposit richness 0..3 */
  dep: number;
  /** geothermal vent present */
  geo: 0 | 1;
  structure: StructureId | null;
  /** cycle when last transformed — renderer anims; informational */
  tTf: number;
  /** suitability 0..1 recomputed each cycle (clamped smooth) */
  suit: number;
}

export interface PlanetState {
  /** surface temperature in °C, -80..60 meaningful range */
  temp: number;
  /** global water stock index 0..100 */
  water: number;
  /** oxygen % of atmosphere 0..100 (21 ≈ earthlike) */
  oxygen: number;
  /** humidity 0..100 */
  humidity: number;
  /** biodiversity 0..100 */
  bio: number;
  /** atmospheric pressure 0..100 */
  pressure: number;
  /** average soil fertility 0..100 */
  fert: number;
  /** derived composite stability 0..100 */
  stability: number;
  /** global pollution 0..100 */
  pollution: number;
}

export interface ActiveModifier {
  id: string;
  cycles: number;
  /** numeric payload (multipliers etc.) */
  data: number[];
}

export interface PendingChoice {
  eventId: string;
  /** cycle it appeared */
  cycle: number;
}

export interface ObjectiveState {
  id: string;
  done: boolean;
}

export interface GameStats {
  placed: number;
  structures: number;
  combos: number;
  eventsSeen: number;
  decisionsMade: number;
  peakBio: number;
  peakWater: number;
  techs: number;
  tilesLost: number;
}

export interface SnapshotFrame {
  cycle: number;
  /** biome ids as array of indices (see BIOME_ORDER) */
  b: number[];
  /** dev stage per tile */
  d: number[];
}

export type GameMode = 'standard' | 'arid' | 'frozen' | 'volcanic' | 'ecological' | 'hardcore' | 'daily';

export interface EndInfo {
  type: 'victory' | 'collapse';
  cycle: number;
  score: number;
  grade: string;
}

export interface GameState {
  version: number;
  seed: string;
  mode: GameMode;
  mapR: number;
  hubIndex: number;
  rng: { a: number; b: number; c: number; d: number };
  cycle: number;
  /** index = position in the canonical coord list (see state.ts coordsOf) */
  tiles: TileState[];
  inTerritory: number[]; // 0/1 cached territory
  planet: PlanetState;
  res: ResMap;
  /** research: id being researched or null, plus remaining rp */
  techCurrent: TechId | null;
  techDone: TechId[];
  techProgress: number;
  modifiers: ActiveModifier[];
  pendingChoice: PendingChoice | null;
  recentEvents: { eventId: string; cycle: number; choice?: string }[];
  objectives: ObjectiveState[];
  /** cycles for which primary-goal stability requirement has been met */
  stableCycles: number;
  /** consecutive crisis cycles (stability collapse track) */
  crisis: number;
  stats: GameStats;
  phase: number;
  score: number;
  end: EndInfo | null;
  /** optional per-tile combo flags for renderer (bit per combo id) */
  combos: { id: string; tiles: number[] }[];
  snapshots: SnapshotFrame[];
  planetName: string;
}

export interface FxPlace {
  kind: 'place';
  tile: number;
  biome: BiomeId;
  structure: StructureId | null;
}
export interface FxTransform {
  kind: 'transform';
  tile: number;
  from: BiomeId;
  to: BiomeId;
}
export interface FxFloat {
  kind: 'float';
  tile: number;
  text: string;
  tone: 'good' | 'bad' | 'info';
}
export interface FxCombo {
  kind: 'combo';
  id: string;
  tiles: number[];
}
export interface FxEvent {
  kind: 'event';
  eventId: string;
  choice?: string;
}
export interface FxMilestone {
  kind: 'milestone';
  key: string;
  tone: 'good' | 'bad' | 'info';
}
export interface FxUnlock {
  kind: 'unlock';
  what: 'tech' | 'biome' | 'structure';
  id: string;
}

export type Fx =
  | FxPlace | FxTransform | FxFloat | FxCombo | FxEvent | FxMilestone | FxUnlock;

/** Player actions. Everything else is automatic on placement. */
export type Action =
  | { type: 'place'; tile: number; biome?: BiomeId; structure?: StructureId }
  | { type: 'wait' }
  | { type: 'research'; tech: TechId }
  | { type: 'choice'; eventId: string; option: number };

export interface ActionResult {
  state: GameState;
  fx: Fx[];
  /** non-fatal reason if action was rejected (state unchanged) */
  error?: string;
}

/** Aggregate yields used for display & economy. */
export interface Yields {
  prod: ResMap;
  use: ResMap;
  dTemp: number;
  dOxy: number;
  dHum: number;
  dPressure: number;
  dBio: number;
  dFert: number;
  dPoll: number;
  dWaterStock: number;
}
