/**
 * Heuristic bot used by the balance tests — plays a plausible game so we can
 * validate economy pacing, phase progression and determinism headlessly.
 */
import {
  BIOMES, TECHS, aggregateTechs, act, checkPlacement, deriveAll, biomeCost,
  newGame, neighborsIdx, stateHash, mulberryRng,
} from './.build/sim.mjs';

export function botGame(seed, mode = 'standard', maxCycles = 160, randSeed = 1) {
  const rnd = mulberryRng(randSeed);
  let g = newGame(seed, mode, 10);
  const log = [];
  let cycles = 0;
  while (!g.end && cycles < maxCycles) {
    cycles++;
    g = botStep(g, rnd);
    if (cycles % 20 === 0) {
      log.push({ cycle: g.cycle, ...g.planet, res: { ...g.res }, techs: g.techDone.length, phase: g.phase, placed: g.stats.placed });
    }
    if (g.cycle > maxCycles + 5) break;
  }
  return { g, log, cycles };
}

function costSum(cost) {
  return (cost.water ?? 0) * 1 + (cost.minerals ?? 0) * 1 + (cost.energy ?? 0) * 1.2 + (cost.biomass ?? 0) * 1.5;
}

function botStep(g0, rnd) {
  let g = g0;
  const agg = aggregateTechs(g);

  if (g.pendingChoice) {
    const r = act(g, { type: 'choice', eventId: g.pendingChoice.eventId, option: Math.floor(rnd() * 3) % 3 });
    if (!r.error) g = r.state;
  }

  if (!g.techCurrent) {
    const avail = Object.values(TECHS)
      .filter((t) => !g.techDone.includes(t.id) && t.reqs.every((r) => g.techDone.includes(r)))
      .sort((a, b) => a.cost - b.cost);
    if (avail.length) {
      const r = act(g, { type: 'research', tech: avail[0].id });
      if (!r.error) g = r.state;
    }
  }

  const nei = neighborsIdx(g.mapR);
  let best = null;

  for (let i = 0; i < g.tiles.length; i++) {
    if (!g.inTerritory[i]) continue;
    const t = g.tiles[i];
    if (t.structure && t.structure !== 'hub') continue;
    for (const b of Object.keys(BIOMES)) {
      const def = BIOMES[b];
      if (!def.placeable) continue;
      if (def.unlock && !g.techDone.includes(def.unlock)) continue;
      const chk = checkPlacement(g, agg, i, b);
      if (!chk.ok) continue;
      const ct = biomeCost(g, agg, b);
      if (!canAffordBudget(g, ct)) continue;
      const nearWater = nei[i].filter((j) => ['ocean', 'river', 'wetland'].includes(g.tiles[j].biome)).length;
      const nearLiving = nei[i].filter((j) => g.tiles[j].dev > 0).length;
      let score = def.suit({ ...t, biome: b, dev: 2, moist: Math.max(t.moist, nearWater * 8) }, g.planet) * 12;
      score -= costSum(ct) * 0.5;
      if ((b === 'forest' || b === 'grassland' || b === 'tundra') && nearWater > 0) score += 3;
      if (b === 'ocean' && t.elev <= 1) score += 4;
      if (b === 'river' && nearWater > 0) score += 5;
      if (b === 'tundra' && g.planet.temp < 5) score += 3;
      if (b === 'grassland' && g.planet.temp >= 5) score += 3;
      score += nearLiving * 1.2;
      if (t.fert > 25 && ['forest', 'grassland', 'tundra'].includes(b)) score += 2;
      if (score > (best?.score ?? 0)) best = { score, tile: i, biome: b };
    }
  }

  // strategic builds
  if (g.res.water > 14 && !g.tiles.some((t) => t.structure === 'extractor') && g.stats.placed > 2) {
    for (let i = 0; i < g.tiles.length; i++) {
      if (!g.inTerritory[i] || g.tiles[i].structure) continue;
      if (checkPlacement(g, agg, i, undefined, 'extractor').ok) {
        const r = act(g, { type: 'place', tile: i, structure: 'extractor' });
        if (!r.error) return r.state;
      }
    }
  }
  if (g.res.minerals > 24 && !g.tiles.some((t) => t.structure === 'research')) {
    for (let i = 0; i < g.tiles.length; i++) {
      if (!g.inTerritory[i] || g.tiles[i].structure) continue;
      if (checkPlacement(g, agg, i, undefined, 'research').ok) {
        const r = act(g, { type: 'place', tile: i, structure: 'research' });
        if (!r.error) return r.state;
      }
    }
  }
  if (g.techDone.includes('nrg_pv') && g.res.minerals > 14) {
    for (let i = 0; i < g.tiles.length; i++) {
      if (!g.inTerritory[i] || g.tiles[i].structure) continue;
      if (checkPlacement(g, agg, i, undefined, 'solar').ok && (g.tiles[i].biome === 'desert' || g.planet.humidity < 60)) {
        const r = act(g, { type: 'place', tile: i, structure: 'solar' });
        if (!r.error) return r.state;
      }
    }
  }

  if (best) {
    const r = act(g, { type: 'place', tile: best.tile, biome: best.biome });
    if (!r.error) return r.state;
  }
  const r = act(g, { type: 'wait' });
  return r.error ? g0 : r.state;
}

function canAffordBudget(g, ct) {
  return Object.keys(ct).every((k) => g.res[k] >= (ct[k] ?? 0) + 2);
}

export { stateHash, deriveAll };
