/**
 * Save/load: versioned, validated, corruption-tolerant (graceful fallback,
 * never crashes the game on a bad save).
 */
import { SAVE_VERSION, blankState } from './state';
import { generatePlanet } from './generation';
import { mapIndex } from './state';
import { BIOME_ORDER } from './defs';
import type { GameMode, GameState } from './types';

const SAVE_KEY = 'terraform_save_v1';
const META_KEY = 'terraform_meta_v1';

export interface Meta {
  bestScores: Record<string, number>; // mode -> best score
  runs: number;
  lastSeed?: string;
  tutorialSeen?: boolean;
}

export function loadMeta(): Meta {
  const def: Meta = { bestScores: {}, runs: 0 };
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return def;
    const m = JSON.parse(raw);
    if (typeof m !== 'object' || m === null) return def;
    return { bestScores: m.bestScores ?? {}, runs: m.runs ?? 0, lastSeed: m.lastSeed, tutorialSeen: m.tutorialSeen };
  } catch {
    return def;
  }
}

export function saveMeta(m: Meta): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(m));
  } catch { /* private mode etc. */ }
}

export function saveGame(g: GameState): boolean {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(g));
    return true;
  } catch {
    return false;
  }
}

export function hasSave(): boolean {
  try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; }
}

export function clearSave(): void {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}

/** Validate a parsed save; returns a usable state or null. */
export function validateSave(raw: unknown): GameState | null {
  try {
    if (typeof raw !== 'object' || raw === null) return null;
    const g = raw as GameState;
    if (g.version !== SAVE_VERSION) return null;
    if (typeof g.seed !== 'string' || typeof g.cycle !== 'number') return null;
    if (!Array.isArray(g.tiles) || g.tiles.length !== 3 * g.mapR * (g.mapR + 1) + 1) return null;
    if (typeof g.hubIndex !== 'number' || g.hubIndex < 0 || g.hubIndex >= g.tiles.length) return null;
    if (!g.planet || typeof g.planet.temp !== 'number' || typeof g.planet.bio !== 'number') return null;
    if (!g.res || typeof g.res.water !== 'number') return null;
    if (!Array.isArray(g.rng ? [g.rng.a] : []) || typeof g.rng?.a !== 'number') return null;
    // normalize enums defensively
    const biomeSet = new Set<string>(BIOME_ORDER);
    for (const t of g.tiles) {
      if (!biomeSet.has(t.biome)) t.biome = 'barren';
      t.dev = Math.max(0, Math.min(3, Number(t.dev) || 0));
      t.moist = Math.max(0, Math.min(100, Number(t.moist) || 0));
      t.fert = Math.max(0, Math.min(100, Number(t.fert) || 0));
      t.poll = Math.max(0, Math.min(100, Number(t.poll) || 0));
      t.elev = Math.max(0, Math.min(5, Number(t.elev) || 0));
      if (t.structure === undefined) t.structure = null;
    }
    if (!Array.isArray(g.objectives) || g.objectives.length === 0) g.objectives = [{ id: 'primary_self_sustaining', done: false }];
    if (!Array.isArray(g.snapshots)) g.snapshots = [];
    if (typeof g.crisis !== 'number') g.crisis = 0;
    void mapIndex; // touch caches
    return g;
  } catch {
    return null;
  }
}

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return validateSave(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function dailySeed(date = new Date()): string {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return `PLANET-${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function newGame(seed: string, mode: GameMode, mapR = 12): GameState {
  const g = blankState(seed, mode, mapR, '');
  generatePlanet(g);
  return g;
}
