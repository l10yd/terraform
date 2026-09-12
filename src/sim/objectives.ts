/**
 * Objectives — the primary goal plus 3 random optional goals per run.
 * prog() returns 0..1 for progress bars; done when >= 1.
 */
import { neighborsIdx } from './state';
import type { GameState } from './types';

export interface ObjectiveDef {
  id: string;
  bonus: number;
  prog: (g: GameState) => number;
}

function countBiome(g: GameState, b: string, devMin = 0): number {
  return g.tiles.filter((t) => t.biome === b && t.dev >= devMin).length;
}

export const OBJECTIVE_POOL: ObjectiveDef[] = [
  { id: 'bio70', bonus: 1200, prog: (g) => g.planet.bio / 70 },
  {
    id: 'green_industry', bonus: 1000,
    prog: (g) => Math.min(1, Math.min(g.planet.pollution <= 12 ? 1 : 1 - (g.planet.pollution - 12) / 25, g.planet.bio >= 40 ? 1 : g.planet.bio / 40)),
  },
  {
    id: 'three_watersheds', bonus: 900,
    prog: (g) => Math.min(1, g.combos.filter((c) => c.id === 'watershed').length / 3),
  },
  { id: 'five_forests', bonus: 700, prog: (g) => Math.min(1, countBiome(g, 'forest', 2) / 5) },
  {
    id: 'temp_band', bonus: 800,
    prog: (g) => (g.planet.temp >= -2 && g.planet.temp <= 22 ? 1 : 0.5),
  },
  {
    id: 'great_corridor', bonus: 1100,
    prog: (g) => Math.min(1, biggestNetwork(g) / 14),
  },
  {
    id: 'power_grid', bonus: 800,
    prog: (g) => Math.min(1, (g.tiles.filter((t) => t.structure === 'solar').length / 4 + g.tiles.filter((t) => t.structure === 'battery').length / 2) ),
  },
  { id: 'three_habitats', bonus: 700, prog: (g) => Math.min(1, countBiome2(g, 'habitat') / 3) },
  { id: 'tech12', bonus: 900, prog: (g) => Math.min(1, g.techDone.length / 12) },
  {
    id: 'ocean_seven', bonus: 600,
    prog: (g) => Math.min(1, (countBiome(g, 'ocean') + countBiome(g, 'river') * 0.5) / 9),
  },
  {
    id: 'balanced_world', bonus: 1300,
    prog: (g) => {
      const kinds = new Set(g.tiles.filter((t) => t.dev > 0).map((t) => t.biome));
      return Math.min(1, kinds.size / 7);
    },
  },
];

function countBiome2(g: GameState, s: string): number {
  return g.tiles.filter((t) => t.structure === s).length;
}

export function biggestNetwork(g: GameState): number {
  const LIVING = new Set(['grassland', 'forest', 'wetland', 'river', 'tropical', 'ecozone', 'tundra', 'alpine']);
  const nei = neighborsIdx(g.mapR);
  const seen = new Uint8Array(g.tiles.length);
  let best = 0;
  for (let i = 0; i < g.tiles.length; i++) {
    if (seen[i] || !LIVING.has(g.tiles[i].biome) || g.tiles[i].dev <= 0) continue;
    let size = 0;
    const stack = [i];
    seen[i] = 1;
    while (stack.length) {
      const c = stack.pop()!;
      size++;
      for (const nb of nei[c]) {
        if (!seen[nb] && LIVING.has(g.tiles[nb].biome) && g.tiles[nb].dev > 0) {
          seen[nb] = 1;
          stack.push(nb);
        }
      }
    }
    best = Math.max(best, size);
  }
  return best;
}

export function getObjective(id: string): ObjectiveDef | undefined {
  if (id === 'primary_self_sustaining') return PRIMARY;
  return OBJECTIVE_POOL.find((o) => o.id === id);
}

export const PRIMARY: ObjectiveDef = {
  id: 'primary_self_sustaining',
  bonus: 2500,
  prog: (g) => {
    const p = g.planet;
    const q = (v: number, target: number) => Math.min(1, v / target);
    return (q(p.stability, 65) + q(p.bio, 55) + q(p.oxygen, 16) + q(p.water, 50) + q(Math.max(0, 30 - p.pollution), 25)) / 5;
  },
};

export function primaryMet(g: GameState): boolean {
  const p = g.planet;
  return p.stability >= 65 && p.bio >= 55 && p.oxygen >= 16 && p.water >= 50 && p.pollution <= 30;
}
