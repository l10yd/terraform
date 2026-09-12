/**
 * Phases, victory/defeat, scoring and grade.
 */
import { computeTerritory } from './state';
import { biggestNetwork, getObjective, primaryMet } from './objectives';
import type { GameState } from './types';

export function computePhase(g: GameState): number {
  const p = g.planet;
  let ph = 1;
  if (p.oxygen >= 8 || p.water >= 25) ph = 2;
  if (ph >= 2 && (p.temp >= -5 || p.humidity >= 25)) ph = 3;
  if (ph >= 3 && p.bio >= 25) ph = 4;
  if (ph >= 4 && p.bio >= 45 && p.stability >= 50) ph = 5;
  if (ph >= 5 && p.bio >= 55 && p.stability >= 62 && g.techDone.length >= 10) ph = 6;
  return ph;
}

export interface ScoreParts {
  life: number;
  climate: number;
  water: number;
  tech: number;
  networks: number;
  habitats: number;
  objectives: number;
  efficiency: number;
  pollution: number;
  total: number;
  grade: string;
}

export function computeScore(g: GameState): ScoreParts {
  const p = g.planet;
  const living = g.tiles.filter((t) => t.dev > 0).length;
  const life = p.bio * 22 + living * 3.2;
  const climate = p.stability * 12 + Math.max(0, 40 - Math.abs(p.temp - 10)) * 9;
  const water = p.water * 9 + biggestNetwork(g) * 6;
  const tech = g.techDone.length * 46;
  const networks = g.combos.length * 42;
  const habitats = g.tiles.filter((t) => t.structure === 'habitat').length * 55;
  let objectives = 0;
  for (const o of g.objectives) {
    const def = getObjective(o.id);
    if (o.done && def) objectives += def.bonus / 6;
  }
  const efficiency = Math.max(0, 30 - g.cycle / 6) * 4 + p.oxygen * 3 + p.pressure * 1.2;
  const pollution = -p.pollution * 14;
  const raw = life + climate + water + tech + networks + habitats + objectives + efficiency + pollution + g.phase * 120;
  const total = Math.max(0, Math.round(raw * 2.2));
  const grade =
    total >= 12500 ? 'S+' : total >= 10500 ? 'S' : total >= 9000 ? 'A+' : total >= 7800 ? 'A' :
    total >= 6500 ? 'B+' : total >= 5200 ? 'B' : total >= 4000 ? 'C' : total >= 2800 ? 'D' : 'E';
  return { life, climate, water, tech, networks, habitats, objectives, efficiency, pollution, total, grade };
}

/** Check win / collapse each cycle. */
export function checkEnd(g: GameState): 'victory' | 'collapse' | null {
  if (g.end) return null;
  if (primaryMet(g)) {
    g.stableCycles++;
    if (g.stableCycles >= 8) return 'victory';
  } else {
    g.stableCycles = Math.max(0, g.stableCycles - 1);
  }
  if (g.planet.stability < 18 && g.cycle > 20) {
    g.crisis = (g.crisis ?? 0) + 1;
    if (g.crisis >= 6) return 'collapse';
  } else {
    g.crisis = Math.max(0, (g.crisis ?? 0) - 1);
  }
  return null;
}

export function finishGame(g: GameState, type: 'victory' | 'collapse'): void {
  const parts = computeScore(g);
  if (type === 'collapse') {
    // collapse forfeits most of the ecological bonus
    g.score = Math.round(parts.total * 0.45);
    const grade = g.score >= 6000 ? 'B' : g.score >= 4000 ? 'C' : g.score >= 2500 ? 'D' : 'E';
    g.end = { type, cycle: g.cycle, score: g.score, grade };
  } else {
    g.score = parts.total;
    g.end = { type, cycle: g.cycle, score: g.score, grade: parts.grade };
  }
  computeTerritory(g, 2);
}
