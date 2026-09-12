/**
 * The cycle pipeline. Every player placement (or wait) advances one cycle:
 * placement → economy → research → climate → ecology → modifiers → events →
 * objectives → phases → score → snapshot.
 */
import { TECHS } from './defs';
import { aggregateTechs, computeTerritory } from './state';
import { deriveAll } from './adjacency';
import { applyPlacement } from './actions';
import { stepPlanet, stepTiles } from './climate';
import { economyMod, resolveChoice, rollEvent } from './events';
import { getObjective, primaryMet } from './objectives';
import { checkEnd, computePhase, finishGame } from './victory';
import { pushSnapshot } from './snapshot';
import type { Action, ActionResult, Fx, GameState, ResId } from './types';

const DEFAULT_CAPS: Record<ResId, number> = { water: 140, minerals: 160, energy: 110, biomass: 120, research: 200 };

export function endCycle(g: GameState, fx: Fx[]): void {
  g.cycle++;
  const agg = aggregateTechs(g);
  computeTerritory(g, 2 + agg.rangeAdd);

  // ---- derivation & combos -------------------------------------------------
  const derived = deriveAll(g, agg);
  const prevKeys = new Set(g.combos.map((c) => `${c.id}:${[...c.tiles].sort((a, b) => a - b).join(',')}`));
  g.combos = derived.combosFound;
  for (const c of derived.combosFound) {
    const key = `${c.id}:${[...c.tiles].sort((a, b) => a - b).join(',')}`;
    if (!prevKeys.has(key)) {
      g.stats.combos++;
      fx.push({ kind: 'combo', id: c.id, tiles: c.tiles });
    }
  }

  // ---- economy ---------------------------------------------------------------
  const emod = economyMod(g);
  const soft = agg.softCapAdd;
  const capMult = (k: ResId, stock: number) => {
    const cap = DEFAULT_CAPS[k] + (soft[k] ?? 0);
    if (stock <= cap) return 1;
    return Math.max(0.2, cap / stock);
  };
  const net: Record<ResId, number> = {
    water: (derived.totals.prod.water * emod.water - derived.totals.use.water),
    minerals: (derived.totals.prod.minerals * emod.minerals),
    energy: (derived.totals.prod.energy * emod.energy - derived.totals.use.energy),
    biomass: (derived.totals.prod.biomass),
    research: (derived.totals.prod.research * emod.research),
  };
  // colony life support: the hub (and every habitat) eats power every cycle —
  // a do-nothing commander slowly walks the colony into a blackout
  net.energy -= 0.35 + g.tiles.reduce((s, x) => s + (x.structure === 'habitat' ? 0.15 : 0), 0);
  (Object.keys(net) as ResId[]).forEach((k) => {
    const gain = net[k] > 0 ? net[k] * capMult(k, g.res[k]) : net[k];
    g.res[k] = Math.max(0, g.res[k] + gain);
  });
  if (g.res.energy <= 0.5 && net.energy < 0) {
    g.planet.stability = Math.max(0, g.planet.stability - 1.1);
    if (g.cycle % 8 === 0) fx.push({ kind: 'milestone', key: 'st.blackout', tone: 'bad' });
  }

  // research auto-purchase -----------------------------------------------------
  if (g.techCurrent) {
    const def = TECHS[g.techCurrent];
    if (def && g.res.research >= def.cost && def.reqs.every((r) => g.techDone.includes(r))) {
      g.res.research -= def.cost;
      g.techDone.push(def.id);
      g.stats.techs = g.techDone.length;
      g.techCurrent = null;
      fx.push({ kind: 'unlock', what: 'tech', id: def.id });
      for (const m of def.mods) {
        if (m.kind === 'unlockBiome') fx.push({ kind: 'unlock', what: 'biome', id: m.target! });
        if (m.kind === 'unlockStructure') fx.push({ kind: 'unlock', what: 'structure', id: m.target! });
      }
    } else if (def) {
      g.techProgress = Math.min(1, g.res.research / def.cost);
    }
  } else {
    g.techProgress = 0;
  }

  // ---- climate & ecology -------------------------------------------------------
  const prevLost = g.stats.tilesLost;
  stepPlanet(g, agg, derived, fx);
  stepTiles(g, agg, derived, fx);
  if (g.stats.tilesLost > prevLost) {
    fx.push({ kind: 'milestone', key: 'st.tilesLost', tone: 'bad' });
  }
  if (derived.powerDeficit && g.cycle % 4 === 0) {
    fx.push({ kind: 'milestone', key: 'st.powerDeficit', tone: 'bad' });
  }

  // biomass production adds stock from living world
  g.res.biomass += Math.max(0, derived.totals.prod.biomass * 0.25);

  // ---- modifiers ---------------------------------------------------------------
  g.modifiers = g.modifiers.filter((m) => {
    m.cycles--;
    return m.cycles > 0;
  });

  // ---- events ----------------------------------------------------------------
  rollEvent(g, fx);

  // ---- objectives --------------------------------------------------------------
  for (const o of g.objectives) {
    if (o.done) continue;
    const def = getObjective(o.id);
    if (!def) continue;
    if (def.id === 'primary_self_sustaining') continue; // via checkEnd
    if (def.prog(g) >= 1) {
      o.done = true;
      fx.push({ kind: 'milestone', key: `obj.${o.id}.done`, tone: 'good' });
    }
  }

  // ---- phase / stats / score ---------------------------------------------------
  const ph = computePhase(g);
  if (ph !== g.phase) {
    g.phase = ph;
    fx.push({ kind: 'milestone', key: `phase.${ph}`, tone: 'info' });
  }
  g.stats.peakBio = Math.max(g.stats.peakBio, g.planet.bio);
  g.stats.peakWater = Math.max(g.stats.peakWater, g.planet.water);

  // ---- end checks ----------------------------------------------------------------
  const end = checkEnd(g);
  if (primaryMet(g) && !g.end) {
    if (g.stableCycles === 1) fx.push({ kind: 'milestone', key: 'phase.selfsustaining', tone: 'good' });
  }
  if (g.end === null && end) {
    finishGame(g, end);
    pushSnapshot(g, true);
    fx.push({ kind: 'milestone', key: end === 'victory' ? 'end.victory' : 'end.collapse', tone: end === 'victory' ? 'good' : 'bad' });
    return;
  }

  // ---- snapshot cadence ------------------------------------------------------------
  if (g.cycle % 3 === 0) pushSnapshot(g);
}

export function act(state: GameState, action: Action): ActionResult {
  if (state.end && action.type === 'place') return { state, fx: [], error: 'err.gameOver' };
  const g: GameState = structuredClone(state);
  const fx: Fx[] = [];

  switch (action.type) {
    case 'place': {
      const agg = aggregateTechs(g);
      const ok = applyPlacement(g, agg, action.tile, fx, action.biome, action.structure);
      if (!ok) return { state, fx: [], error: 'err.invalid' };
      endCycle(g, fx);
      return { state: g, fx };
    }
    case 'wait': {
      if (g.pendingChoice) return { state, fx: [], error: 'err.chooseFirst' };
      endCycle(g, fx);
      return { state: g, fx };
    }
    case 'research': {
      const def = TECHS[action.tech];
      if (!def) return { state, fx: [], error: 'err.noTech' };
      if (g.techDone.includes(def.id)) return { state, fx: [], error: 'err.doneAlready' };
      if (!def.reqs.every((r) => g.techDone.includes(r))) return { state, fx: [], error: 'err.reqs' };
      g.techCurrent = def.id;
      return { state: g, fx };
    }
    case 'choice': {
      const ok = resolveChoice(g, action.option, fx);
      if (!ok) return { state, fx: [], error: 'err.invalid' };
      return { state: g, fx };
    }
  }
}

/** continue after the ending (sandbox mode) */
export function openSandbox(state: GameState): GameState {
  const g = structuredClone(state);
  g.end = null;
  g.stableCycles = 0;
  return g;
}
