/**
 * Climate & ecology simulation. Everything is interconnected:
 *   forest → oxygen → humidity → rainfall → vegetation → biodiversity
 *   industry → heat + pollution → drying → desertification → forest dieback
 */
import { BIOMES, LIVING_BIOMES } from './defs';
import { neighborsIdx, setRng, type TechAgg } from './state';
import type { Derived } from './adjacency';
import { rngFloat, type RngState } from '../core/rng';
import type { BiomeId, Fx, GameState } from './types';

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const LIVING = new Set<string>(LIVING_BIOMES);

/** planet-level step: one climate cycle */
export function stepPlanet(g: GameState, agg: TechAgg, d: Derived, fx: Fx[]): void {
  const p = g.planet;
  const m = g.modifiers;
  const mod = (id: string) => m.find((x) => x.id === id);

  const t = p.temp;

  // temperature: radiative balance + greenhouse (O2/pressure/pollution) +
  // water-vapor loop (vegetation → humidity → warming) + cloud albedo &
  // thermal emission negative feedbacks. Self-recovering at both extremes:
  // deep freeze warms slowly on its own (sublimated ices, outgassing),
  // overheating burns off humidity and cools back down.
  const cool = -(t + 110) * 0.0015;
  const greenhouse = (p.oxygen * 0.004 + p.pressure * 0.004 + p.pollution * 0.006) * (1 + (agg.climate.greenhouse ?? 0)) + (agg.climate.greenhouseBase ?? 0);
  const humidityWarm = p.humidity * 0.0045;
  const cloudCool = -Math.max(0, p.humidity - 45) * 0.005;
  const hotCool = -Math.max(0, t - 28) * 0.012;
  const iceAlbedo = -Math.max(0, -t - 25) * 0.0025;
  let dT = cool + greenhouse + humidityWarm + cloudCool + hotCool + iceAlbedo + d.totals.dTemp + (agg.climate.tempDrift ?? 0);
  if (mod('solarFlare')) dT -= 0.3;
  if (mod('icestorm')) dT -= 0.5;
  if (mod('superstorm')) dT -= 0.2;
  if (mod('eruption')) dT += 0.6;
  if (mod('dustveil')) dT -= 0.6;
  p.temp = clamp(t + dT, -80, 60);

  // humidity: evaporation (from water tiles & surface moist) vs precipitation
  const evap = d.totals.dHum * 0.5 + d.waterTiles * 0.02 * clamp((p.temp + 30) / 45, 0, 1.4) + p.water * 0.003;
  const rain = clamp(p.humidity / 100, 0, 1) * (0.55 + (agg.climate.rainBoost ?? 0)) * (1 + countAlpineNearWater(g) * 0.02);
  let rainUse = rain * (mod('drought') ? 0.4 : 1);
  p.humidity = clamp(p.humidity + evap - rainUse * 0.8 - Math.max(0, p.humidity - 85) * 0.02, 0, 100);

  // oxygen: photosynthesis minus natural loss; boosted by O2 techs
  const photo = d.totals.dOxy * 0.4 * (1 - p.pollution / 160) * (0.6 + p.humidity / 180);
  const oxyLoss = 0.02 + p.pollution * 0.004;
  p.oxygen = clamp(p.oxygen + photo - oxyLoss + (agg.climate.o2Boost ?? 0) * Math.max(0, photo) * 0.4, 0, 100);

  // pressure: outgassing scaled by life and techs; slow escape
  p.pressure = clamp(p.pressure + d.totals.dPressure + (agg.climate.pressureGain ?? 0) * 0.05 + p.oxygen * 0.002 - 0.012, 0, 100);

  // pollution: industrial input vs natural decay (wetlands/ecozone clean it)
  p.pollution = clamp(p.pollution + d.totals.dPoll - (0.25 + d.waterTiles * 0.004 + countBiome(g, 'ecozone') * 0.05 + countBiome(g, 'wetland') * 0.02) * (mod('ecoBoom') ? 1.5 : 1), 0, 100);

  // global water index: surface water + soil moisture + temp (ice locked)
  const avgMoist = g.tiles.reduce((s, x) => s + x.moist, 0) / g.tiles.length;
  const moistTarget = clamp(d.waterTiles * 1.6 + avgMoist * 0.55 + g.res.water * 0.08 + (p.temp > -5 ? 8 : 0), 0, 100);
  p.water = p.water + (moistTarget - p.water) * 0.15;

  // avg fertility of the surface
  const fertTarget = clamp(g.tiles.reduce((s, x) => s + x.fert, 0) / g.tiles.length, 0, 100);
  p.fert = p.fert + (fertTarget - p.fert) * 0.2;

  // biodiversity: approach target from ecosystem points
  const bioTarget = clamp(Math.sqrt(bioPoints(g, d)) * 5.4 - p.pollution * 0.55 - (mod('pest') ? 8 : 0) + (mod('ecoBoom') ? 6 : 0), 0, 100);
  p.bio = clamp(p.bio + (bioTarget - p.bio) * 0.18, 0, 100);

  // stability composite
  const tempOK = 1 - clamp(Math.abs(p.temp - 8) / 45, 0, 1);
  const pollOK = 1 - clamp(p.pollution / 60, 0, 1);
  const humOK = 1 - clamp(Math.abs(p.humidity - 48) / 60, 0, 1);
  const oxyOK = clamp(p.oxygen / 22, 0, 1);
  const bioOK = clamp(p.bio / 70, 0, 1);
  const stabTarget = clamp((tempOK * 0.26 + pollOK * 0.2 + humOK * 0.14 + oxyOK * 0.2 + bioOK * 0.2) * 100, 0, 100);
  p.stability = clamp(p.stability + (stabTarget - p.stability) * 0.22, 0, 100);
}

function countBiome(g: GameState, b: BiomeId): number {
  let c = 0;
  for (const t of g.tiles) if (t.biome === b) c++;
  return c;
}

function countAlpineNearWater(g: GameState): number {
  const nei = neighborsIdx(g.mapR);
  let c = 0;
  for (let i = 0; i < g.tiles.length; i++) {
    if (g.tiles[i].biome !== 'alpine') continue;
    if (nei[i].some((j) => g.tiles[j].biome === 'ocean' || g.tiles[j].biome === 'river' || g.tiles[j].moist > 55)) c++;
  }
  return c;
}

function bioPoints(g: GameState, d: Derived): number {
  let pts = 0;
  for (let i = 0; i < g.tiles.length; i++) pts += d.ty[i].bioPts;
  return Math.max(0, pts);
}

/** per-tile weathering / moisture / growth / succession / dieback */
export function stepTiles(g: GameState, agg: TechAgg, d: Derived, fx: Fx[]): void {
  const p = g.planet;
  const nei = neighborsIdx(g.mapR);
  const n = g.tiles.length;
  let rng: RngState = g.rng;

  const mod = (id: string) => g.modifiers.find((x) => x.id === id);
  const drought = !!mod('drought');
  const ecoBoom = !!mod('ecoBoom');
  const pest = !!mod('pest');
  const rainGlobal = clamp(p.humidity / 100, 0, 1) * (drought ? 0.4 : 1) * (1 + (agg.climate.rainBoost ?? 0));

  const newMoist = new Array<number>(n);
  const newFert = new Array<number>(n);
  const newPoll = new Array<number>(n);

  for (let i = 0; i < n; i++) {
    const t = g.tiles[i];
    const y = d.ty[i];
    // moisture: rain + local adds, minus evaporation (heat) and uptake (living)
    let moist = t.moist + y.moistAdd;
    moist += rainGlobal * (2.2 + (t.elev <= 1 ? 1 : 0)) * 0.5;
    const evap = clamp((p.temp + 5) / 45, 0, 1) * (t.biome === 'ocean' ? 0.6 : 1.6);
    moist -= evap * (t.moist > 30 ? 1 : 0.4);
    if (LIVING.has(t.biome)) moist -= t.dev * 0.35; // uptake
    if (p.temp < -18) moist *= 0.995; // locked as ice (still counted)
    newMoist[i] = clamp(moist, 0, 100);

    // fertility: litter from living tiles, weathering, pollution damage
    let fert = t.fert + y.fertAdd * 0.3;
    if (LIVING.has(t.biome) && t.dev > 0.5) fert += 0.5 * t.dev * rainGlobal;
    fert -= t.poll * 0.02 + Math.max(0, p.temp - 30) * 0.02;
    fert += 0.02; // slow primordial weathering
    newFert[i] = clamp(fert, 0, 100);

    // pollution: settles near sources, disperses
    let poll = t.poll;
    for (const j of nei[i]) {
      const o = g.tiles[j];
      if (o.structure === 'mine' || o.structure === 'geo' || o.structure === 'hub') poll += 0.12 * agg.pollutionMult;
    }
    if (t.structure === 'mine' || t.structure === 'geo') poll += 0.25 * agg.pollutionMult;
    poll -= 0.1 + (t.biome === 'wetland' ? 0.25 : 0) + (t.biome === 'ecozone' ? 0.4 : 0);
    newPoll[i] = clamp(poll + Math.max(0, p.pollution - 40) * 0.004, 0, 100);
  }

  for (let i = 0; i < n; i++) {
    g.tiles[i].moist = newMoist[i];
    g.tiles[i].fert = newFert[i];
    g.tiles[i].poll = newPoll[i];
  }

  // suitability + dev growth + dieback + succession ---------------------------
  for (let i = 0; i < n; i++) {
    const t = g.tiles[i];
    const def = BIOMES[t.biome];
    const target = def.suit(t, p);
    t.suit = t.suit + (target - t.suit) * 0.25;

    if (t.structure === 'hub') { continue; }

    if (LIVING.has(t.biome) || t.biome === 'mineralfield' || t.biome === 'desert') {
      // An established ecosystem (dev≥1.5) conditions its own microclimate,
      // so player groundwork is never thrown away — but extreme hostility
      // still wins eventually.
      const support = Math.min(1, t.suit + (t.dev >= 1.5 ? 0.18 : 0));
      if (support > 0.38) {
        const prevDev = t.dev;
        t.dev = Math.min(3, t.dev + def.grow * (support - 0.22) * (ecoBoom ? 1.8 : 1));
        if (prevDev < 1.5 && t.dev >= 1.5) {
          // ecosystem has conditioned its ground — visible milestone
          fx.push({ kind: 'float', tile: i, text: `${def.icon}✓`, tone: 'good' });
        } else if (prevDev < 3 && t.dev >= 3) {
          fx.push({ kind: 'float', tile: i, text: `${def.icon}✸`, tone: 'good' });
        }
      } else if (t.suit < 0.16) {
        t.dev = Math.max(0, t.dev - 0.1);
        if (t.dev <= 0.02 && t.biome !== 'barren' && t.biome !== 'rockwaste' && !t.structure) {
          // biome collapse → planet reclaims it
          const from = t.biome;
          t.biome = 'rockwaste';
          t.dev = 0;
          t.tTf = g.cycle;
          g.stats.tilesLost++;
          fx.push({ kind: 'transform', tile: i, from, to: 'rockwaste' });
        }
      }
      if (pest && (t.biome === 'forest' || t.biome === 'tropical')) {
        t.dev = Math.max(0, t.dev - 0.12);
      }
    }
  }

  // Emergent spread: moss creeps outward, rivers seek low ground.
  // Deliberately SLOW and demanding: the planet does not restore itself —
  // idling must never substitute for play.
  const spreadProb = (ecoBoom ? 2 : 1) * (0.012 + p.stability * 0.0002);
  for (let i = 0; i < n; i++) {
    const t = g.tiles[i];
    if (t.biome !== 'barren' && t.biome !== 'rockwaste') continue;
    for (const j of nei[i]) {
      const src = g.tiles[j];
      if (!LIVING.has(src.biome) || src.dev < 2) continue;
      const def = BIOMES[src.biome];
      const s2 = def.suit(t, p);
      if (s2 < 0.68) continue;
      let [r1, s] = rngFloat(rng); rng = s;
      if (r1 < spreadProb * s2) {
        t.biome = src.biome;
        t.dev = 0.25;
        t.tTf = g.cycle;
        fx.push({ kind: 'transform', tile: i, from: 'barren', to: t.biome });
        break;
      }
    }
    // riverbank wetlands emerge near water with moisture
    if (t.biome !== 'barren' && t.biome !== 'rockwaste') continue;
    if (t.elev <= 2 && t.moist > 62 && t.fert > 35) {
      let nearW = nei[i].some((j) => g.tiles[j].biome === 'river' || g.tiles[j].biome === 'wetland' || (g.tiles[j].biome === 'ocean' && t.moist > 70));
      if (nearW) {
        let [r2, s] = rngFloat(rng); rng = s;
        if (r2 < 0.02) {
          t.biome = 'wetland'; t.dev = 0.2; t.tTf = g.cycle;
          fx.push({ kind: 'transform', tile: i, from: 'barren', to: 'wetland' });
        }
      }
    }
  }

  setRng(g, rng);
}

/** dev as integer stage for renderers/snapshots */
export const devStage = (dev: number): number => Math.floor(clamp(dev, 0, 2.999));
