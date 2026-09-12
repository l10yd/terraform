/**
 * Adjacency engine: per-tile yields with neighbor bonuses, combo detection,
 * ecological network (corridor) scoring. The single source of truth used by
 * economy, preview diffing and the renderer overlays.
 */
import { BIOMES, COMBOS, GRID_COMBO_STRUCTS, LIVING_BIOMES, STRUCTURES, WATER_BIOMES, type YieldsSpec } from './defs';
import { neighborsIdx, withinDist, mapIndex, type TechAgg } from './state';
import { hexDistance } from '../core/hex';
import type { BiomeId, GameState, Yields } from './types';

export interface TileYield {
  wProd: number; wUse: number; mProd: number; eProd: number; eUse: number;
  bio: number; rp: number;
  dT: number; dO2: number; dH: number; dP: number; dPoll: number;
  moistAdd: number; fertAdd: number;
  bioPts: number;
  combos: string[];
  netMult: number;
}

export interface Derived {
  ty: TileYield[];
  totals: Yields;
  combosFound: { id: string; tiles: number[] }[];
  netSize: number[]; // connected component size per tile (0 = not in network)
  distinctBiomes: number;
  livingTiles: number;
  waterTiles: number;
  forestTiles: number;
  structCount: Record<string, number>;
  powerDeficit: boolean;
}

const LIVING_SET = new Set<string>(LIVING_BIOMES);
const WATER_SET = new Set<string>(WATER_BIOMES);
const devFactor = (dev: number) => 0.35 + 0.65 * (dev / 3);

export function emptyYield(): TileYield {
  return {
    wProd: 0, wUse: 0, mProd: 0, eProd: 0, eUse: 0, bio: 0, rp: 0,
    dT: 0, dO2: 0, dH: 0, dP: 0, dPoll: 0, moistAdd: 0, fertAdd: 0,
    bioPts: 0, combos: [], netMult: 1,
  };
}

function addScaled(dst: TileYield, y: YieldsSpec, s: number): void {
  dst.wProd += (y.wProd ?? 0) * s;
  dst.wUse += (y.wUse ?? 0) * s;
  dst.mProd += (y.mProd ?? 0) * s;
  dst.eProd += (y.eProd ?? 0) * s;
  dst.eUse += (y.eUse ?? 0) * s;
  dst.bio += (y.bio ?? 0) * s;
  dst.rp += (y.rp ?? 0) * s;
  dst.dT += (y.dT ?? 0) * s;
  dst.dO2 += (y.dO2 ?? 0) * s;
  dst.dH += (y.dH ?? 0) * s;
  dst.dP += (y.dP ?? 0) * s;
  dst.dPoll += (y.dPoll ?? 0) * s;
  dst.moistAdd += (y.moistAdd ?? 0) * s;
  dst.fertAdd += (y.fertAdd ?? 0) * s;
}

export function deriveAll(g: GameState, agg: TechAgg): Derived {
  const n = g.tiles.length;
  const nei = neighborsIdx(g.mapR);
  const p = g.planet;
  const ty: TileYield[] = new Array(n);
  const netSize = new Array(n).fill(0);

  // ---- networks (connected living components) -----------------------------
  {
    const seen = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      if (seen[i] || !LIVING_SET.has(g.tiles[i].biome) || g.tiles[i].dev <= 0) continue;
      const members: number[] = [];
      const stack = [i];
      seen[i] = 1;
      while (stack.length) {
        const c = stack.pop()!;
        members.push(c);
        for (const nb of nei[c]) {
          if (!seen[nb] && LIVING_SET.has(g.tiles[nb].biome) && g.tiles[nb].dev > 0) {
            seen[nb] = 1;
            stack.push(nb);
          }
        }
      }
      const size = members.length;
      for (const m of members) netSize[m] = size;
    }
  }
  const netBoost = agg.climate.netLinkBoost ?? 0;

  // ---- combos ---------------------------------------------------------------
  const combosFound: { id: string; tiles: number[] }[] = [];
  const usedByCombo = new Map<string, Uint8Array>();
  const coords = mapIndex(g.mapR).coords;
  for (const cdef of COMBOS) usedByCombo.set(cdef.id, new Uint8Array(n));

  // grid combo: solar + battery pair
  {
    const used = usedByCombo.get('grid')!;
    for (let i = 0; i < n; i++) {
      const t = g.tiles[i];
      if (t.structure !== GRID_COMBO_STRUCTS[0] && t.structure !== GRID_COMBO_STRUCTS[1]) continue;
      const partner = t.structure === GRID_COMBO_STRUCTS[0] ? GRID_COMBO_STRUCTS[1] : GRID_COMBO_STRUCTS[0];
      if (used[i]) continue;
      const nbWith = nei[i].filter((j) => g.tiles[j].structure === partner && !used[j]);
      if (nbWith.length === 0) continue;
      const group = [i, nbWith[0]];
      // extend through chains of solar/battery adjacent to each other
      for (let k = 2; k < group.length + 8; k++) {
        const added: number[] = [];
        for (const gi of group) {
          for (const j of nei[gi]) {
            const s = g.tiles[j].structure;
            if (!used[j] && !group.includes(j) && (s === 'solar' || s === 'battery')) added.push(j);
          }
        }
        if (added.length === 0) break;
        group.push(added[0]);
      }
      for (const gi of group) used[gi] = 1;
      combosFound.push({ id: 'grid', tiles: group });
    }
  }

  // biome-set combos anchored per tile
  for (const cdef of COMBOS) {
    if (cdef.id === 'grid') continue;
    const used = usedByCombo.get(cdef.id)!;
    for (let i = 0; i < n; i++) {
      if (used[i]) continue;
      const have = new Map<BiomeId, number>();
      const anchor = g.tiles[i].biome;
      if (cdef.requires.includes(anchor)) have.set(anchor, i);
      for (const j of nei[i]) {
        const b = g.tiles[j].biome;
        if (cdef.requires.includes(b) && !have.has(b)) have.set(b, j);
      }
      if (have.size !== cdef.requires.length) continue;
      const group = [...have.values()];
      for (const gi of group) used[gi] = 1;
      combosFound.push({ id: cdef.id, tiles: group });
    }
  }

  // ---- per-tile yields --------------------------------------------------------
  for (let i = 0; i < n; i++) {
    const t = g.tiles[i];
    const y = emptyYield();
    const bdef = BIOMES[t.biome];
    const s = devFactor(t.dev) * Math.max(0.15, t.suit);

    // base biome contribution (only meaningful with dev)
    if (t.dev > 0 || WATER_SET.has(t.biome)) addScaled(y, bdef.y, s);

    // temperature-scaled ocean evaporation feeds humidity
    if (t.biome === 'ocean') {
      const evap = Math.max(0, Math.min(1.4, (p.temp + 45) / 35));
      y.dH *= evap;
      y.moistAdd *= (0.4 + evap);
      y.wProd += 0.12 * evap * (t.moist / 100);
    }
    // ice stores water; melting releases it
    if (t.biome === 'ocean' && p.temp < -8) y.wProd = 0;

    // ---- adjacency pairs ----
    let nearWater = 0; let nearForest = 0; let nearLiving = 0; let distinct = 0;
    const kinds = new Set<BiomeId>();
    for (const j of nei[i]) {
      const o = g.tiles[j];
      if (WATER_SET.has(o.biome)) nearWater++;
      if (o.biome === 'forest' || o.biome === 'tropical') nearForest++;
      if (LIVING_SET.has(o.biome)) nearLiving++;
      if (o.biome !== 'barren' && o.biome !== 'rockwaste') kinds.add(o.biome);
    }
    distinct = kinds.size;

    switch (t.biome) {
      case 'forest':
        y.bioPts += 3 * nearWater * devFactor(t.dev);
        y.bio += 0.15 * nearLiving;
        if (nearWater > 0) y.moistAdd += 0.5;
        break;
      case 'wetland':
        y.bioPts += 4 * nearForest;
        y.dH += 0.1 * distinct;
        if (nearLiving > 2) y.bio += 0.3;
        break;
      case 'grassland':
        y.bioPts += 2.5 * (nearWater + nearForest);
        if (nearForest > 0) y.fertAdd += 1.5;
        break;
      case 'alpine': {
        // rainfall potential: mountains near water seed the whole region
        const rain = (agg.climate.rainBoost ?? 0) * 5;
        y.moistAdd += nearWater * (1.5 + rain);
        y.bioPts += nearWater * 2;
        break;
      }
      case 'river':
        y.bioPts += 3 * nearLiving;
        y.moistAdd += 1.2 * nei[i].filter((j) => !WATER_SET.has(g.tiles[j].biome)).length * 0.4;
        break;
      case 'ecozone':
        y.bioPts += 6 * distinct;
        y.rp += 0.15 * distinct;
        break;
      case 'tropical':
        y.bioPts += 4 * nearWater + 2 * distinct;
        break;
      default:
        break;
    }
    // base biodiversity points for living tiles
    if (LIVING_SET.has(t.biome)) y.bioPts += (bdef.y.bioBase ?? 0) * devFactor(t.dev) * t.suit;

    // ---- structure ----
    if (t.structure) {
      const sdef = STRUCTURES[t.structure];
      addScaled(y, sdef.y, 1);
      y.dPoll += sdef.pollution * agg.pollutionMult;
      switch (t.structure) {
        case 'solar': {
          const deserts = nei[i].filter((j) => g.tiles[j].biome === 'desert').length;
          const clouds = Math.min(0.5, p.humidity / 200 + p.temp / 400);
          y.eProd *= 1 + 0.5 * deserts - clouds + (t.elev >= 3 ? 0.15 : 0);
          const shade = nei[i].filter((j) => j !== i && (g.tiles[j].biome === 'forest' || g.tiles[j].biome === 'tropical')).length;
          y.eProd *= Math.max(0.3, 1 - 0.18 * shade);
          break;
        }
        case 'research': {
          let d2 = 0;
          const ks = new Set<BiomeId>();
          for (const j of withinDist(g.mapR, i, 2)) {
            const b = g.tiles[j].biome;
            if (b !== 'barren' && b !== 'rockwaste') ks.add(b);
          }
          d2 = Math.min(8, ks.size);
          y.rp *= 1 + 0.18 * d2;
          break;
        }
        case 'extractor': {
          if (nearWater > 0) y.wProd *= 1.4;
          if (p.temp < -20) y.wProd *= 0.5; // frozen feedstock
          break;
        }
        case 'mine': {
          const fragile = nei[i].filter((j) => LIVING_SET.has(g.tiles[j].biome)).length;
          y.dPoll += 0.12 * fragile * agg.pollutionMult;
          if (t.dep === 0) y.mProd = 0;
          else y.mProd *= 0.6 + 0.3 * t.dep;
          break;
        }
        case 'geo': {
          if (t.geo === 0) y.eProd = 0.2;
          break;
        }
        case 'habitat': {
          const healthy = nei[i].filter((j) => {
            const o = g.tiles[j];
            return LIVING_SET.has(o.biome) && o.dev >= 1 && o.suit > 0.5;
          }).length;
          y.rp += 0.15 * healthy;
          y.bioPts += 4 * healthy;
          y.dPoll += 0.08 * (6 - healthy) * agg.pollutionMult;
          break;
        }
        case 'battery': {
          const solarNb = nei[i].filter((j) => g.tiles[j].structure === 'solar').length;
          y.eProd += 0.25 * solarNb;
          break;
        }
        case 'biodivlab': {
          y.bioPts += 3;
          break;
        }
        case 'weather': {
          y.dH += 0.25;
          break;
        }
        default:
          break;
      }
    }

    // ---- network multiplier ----
    const size = netSize[i];
    let nm = 1;
    if (size >= 3) nm = Math.min(1.75, 0.9 + size * 0.055 + netBoost);
    else if (size > 0) nm = 0.75; // fragmented penalty
    y.netMult = nm;
    y.bioPts *= nm;
    y.bio *= nm;
    ty[i] = y;
  }

  // apply combo bonuses
  for (const cf of combosFound) {
    const cdef = COMBOS.find((c) => c.id === cf.id)!;
    for (const j of cf.tiles) {
      const y = ty[j];
      y.rp += cdef.bonus.rp ?? 0;
      y.bio += cdef.bonus.bio ?? 0;
      y.eProd += cdef.bonus.eProd ?? 0;
      y.wProd += cdef.bonus.wProd ?? 0;
      y.dH += cdef.bonus.dH ?? 0;
      y.dO2 += cdef.bonus.dO2 ?? 0;
      y.bioPts += 4;
      y.combos.push(cdef.id);
    }
  }

  // weather structure moisture aura (applied after loop so tiles exist)
  for (let i = 0; i < n; i++) {
    if (g.tiles[i].structure !== 'weather') continue;
    for (const j of withinDist(g.mapR, i, 2)) {
      const h = hexDistance(coords[i], coords[j]);
      ty[j].moistAdd += h <= 1 ? 2.2 : 1.1;
    }
  }
  // biodivlab radius-1 boost needs forward refs; patch in second pass
  for (let i = 0; i < n; i++) {
    if (g.tiles[i].structure === 'biodivlab') {
      for (const j of nei[i]) {
        const o = g.tiles[j];
        if (LIVING_SET.has(o.biome)) ty[j].bioPts += 3 * devFactor(o.dev) * o.suit;
      }
    }
  }

  // ---- totals ---------------------------------------------------------------
  const totals: Yields = {
    prod: { water: 0.6, minerals: 0.8, energy: 0.6, biomass: 0, research: 0.7 },
    use: { water: 0, minerals: 0, energy: 0, biomass: 0, research: 0 },
    dTemp: 0, dOxy: 0, dHum: 0, dPressure: 0, dBio: 0, dFert: 0, dPoll: 0, dWaterStock: 0,
  };
  const allKinds = new Set<BiomeId>();
  let livingTiles = 0; let waterTiles = 0; let forestTiles = 0;
  const structCount: Record<string, number> = {};
  let powerDeficit = false;

  for (let i = 0; i < n; i++) {
    const t = g.tiles[i];
    const y = ty[i];
    totals.prod.water += y.wProd;
    totals.use.water += y.wUse;
    totals.prod.minerals += y.mProd;
    totals.prod.energy += y.eProd;
    totals.use.energy += y.eUse;
    totals.prod.biomass += y.bio;
    totals.prod.research += y.rp;
    totals.dTemp += y.dT;
    totals.dOxy += y.dO2;
    totals.dHum += y.dH;
    totals.dPressure += y.dP;
    totals.dPoll += y.dPoll * agg.pollutionMult;
    if (t.biome !== 'barren') allKinds.add(t.biome);
    if (LIVING_SET.has(t.biome) && t.dev > 0) { livingTiles++; }
    if (WATER_SET.has(t.biome)) waterTiles++;
    if (t.biome === 'forest' || t.biome === 'tropical') forestTiles++;
    if (t.structure) structCount[t.structure] = (structCount[t.structure] ?? 0) + 1;
  }
  for (const k of Object.keys(totals.prod)) {
    totals.prod[k as keyof typeof totals.prod] *= agg.prodMult[k] ?? 1;
  }
  // global life adds pressure & diversity bonus to research
  totals.dPressure += livingTiles * 0.004 + waterTiles * 0.002;
  totals.prod.research *= 1 + Math.min(0.5, allKinds.size * 0.04);
  powerDeficit = totals.use.energy > totals.prod.energy;
  if (powerDeficit) {
    // brownout: cut production of energy-hungry things
    const f = Math.max(0.5, totals.prod.energy / Math.max(0.01, totals.use.energy));
    totals.prod.minerals *= f;
    totals.prod.research *= f;
    totals.prod.biomass *= f;
  }

  return {
    ty, totals, combosFound, netSize,
    distinctBiomes: allKinds.size, livingTiles, waterTiles, forestTiles,
    structCount, powerDeficit,
  };
}
