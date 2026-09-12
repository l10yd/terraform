/**
 * Facade for UI code: stable re-exports of the sim helpers the interface needs.
 */
export { BIOMES, STRUCTURES, RES_IDS, TECHS, TECH_BRANCHES, COMBOS, BIOME_ORDER } from './defs';
export type { BiomeDef, StructureDef, TechDef, ComboDef, TechBranch } from './defs';
export type { BiomeId, StructureId, TechId, ResId, ResMap, GameState, Fx, Action } from './types';
export { biomeCost, structureCost, canAfford, isStructureUnlocked, isBiomeUnlocked, checkPlacement, previewPlacement, buildCtx } from './actions';
export { aggregateTechs } from './state';
export { neighborsIdx, coordsOf } from './state';
export { getObjective, OBJECTIVE_POOL, PRIMARY } from './objectives';
export { loadGame, saveGame, hasSave, clearSave, newGame, dailySeed, loadMeta, saveMeta } from './serialize';
export { act, endCycle, openSandbox } from './turn';
export { computeScore } from './victory';
export type { ScoreParts } from './victory';
export { snapshotAt } from './snapshot';
export type { GameMode, EndInfo, PendingChoice, ObjectiveState, GameStats } from './types';
export { deriveAll } from './adjacency';
export type { Preview } from './actions';
export type { Derived } from './adjacency';

import type { GameState } from './types';
import { getObjective } from './objectives';

export function getObjectiveLite(id: string): { prog: (g: GameState) => number; bonus: number } | undefined {
  return getObjective(id);
}
