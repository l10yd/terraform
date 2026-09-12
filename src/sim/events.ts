/**
 * Environmental events. They must create decisions, not just punishment:
 * every event changes the planet through the player's own choice.
 */
import { BIOMES } from './defs';
import { neighborsIdx } from './state';
import { rngFloat, rngInt, type RngState } from '../core/rng';
import { mapIndex } from './state';
import type { Fx, GameState } from './types';

export interface EventOption {
  key: string;
  apply: (g: GameState, fx: Fx[]) => void;
}

export interface EventDef {
  id: string;
  kind: 'instant' | 'choice';
  good: boolean;
  cond: (g: GameState) => boolean;
  weight: (g: GameState) => number;
  /** instant events: apply right away (may add modifiers) */
  apply?: (g: GameState, fx: Fx[]) => void;
  options?: EventOption[];
}

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

function addMod(g: GameState, id: string, cycles: number, data: number[] = []): void {
  const ex = g.modifiers.find((m) => m.id === id);
  if (ex) { ex.cycles = Math.max(ex.cycles, cycles); return; }
  g.modifiers.push({ id, cycles, data });
}

function floatPlanet(g: GameState, k: keyof GameState['planet'], v: number): void {
  const p = g.planet;
  (p[k] as number) = clamp(p[k] as number + v, k === 'temp' ? -80 : 0, k === 'temp' ? 60 : 100);
}

function pickTiles(g: GameState, count: number, pred: (i: number) => boolean, rng: RngState): [number[], RngState] {
  const pool: number[] = [];
  for (let i = 0; i < g.tiles.length; i++) if (pred(i)) pool.push(i);
  const out: number[] = [];
  let r = rng;
  for (let k = 0; k < count && pool.length > 0; k++) {
    const [i, s] = rngInt(r, pool.length);
    r = s;
    out.push(pool.splice(i, 1)[0]);
  }
  return [out, r];
}

export const EVENTS: EventDef[] = [
  {
    id: 'solarflare', kind: 'instant', good: false,
    cond: () => true, weight: (g) => 4 + g.techDone.filter((t) => t.startsWith('nrg')).length * 2,
    apply: (g, fx) => {
      addMod(g, 'solarFlare', 3);
      fx.push({ kind: 'milestone', key: 'ev.solarflare.applied', tone: 'bad' });
    },
  },
  {
    id: 'icestorm', kind: 'instant', good: false,
    cond: (g) => g.planet.temp < 2, weight: (g) => clamp(10 - g.planet.temp, 2, 14),
    apply: (g, fx) => {
      floatPlanet(g, 'temp', -2.5);
      addMod(g, 'icestorm', 2);
      fx.push({ kind: 'milestone', key: 'ev.icestorm.applied', tone: 'bad' });
    },
  },
  {
    id: 'drought', kind: 'instant', good: false,
    cond: (g) => g.planet.temp > 8 && g.planet.humidity > 25,
    weight: (g) => clamp((g.planet.temp - 5) / 3, 1, 10),
    apply: (g, fx) => {
      addMod(g, 'drought', 4);
      floatPlanet(g, 'humidity', -8);
      for (const t of g.tiles) if (t.biome === 'grassland' && t.moist < 30) t.moist -= 6;
      fx.push({ kind: 'milestone', key: 'ev.drought.applied', tone: 'bad' });
    },
  },
  {
    id: 'superstorm', kind: 'instant', good: false,
    cond: (g) => g.planet.humidity > 45 && g.planet.water > 25,
    weight: (g) => g.planet.humidity / 12,
    apply: (g, fx) => {
      let rng = g.rng as RngState;
      floatPlanet(g, 'humidity', -12);
      floatPlanet(g, 'temp', -1.5);
      // carve rivers in low ground
      const [low, r2] = pickTiles(g, 2, (i) => g.tiles[i].elev <= 2 && (g.tiles[i].biome === 'barren' || g.tiles[i].biome === 'rockwaste'), rng);
      rng = r2;
      for (const i of low) {
        const t = g.tiles[i];
        if (t.moist > 30) {
          const from = t.biome;
          t.biome = 'river'; t.dev = 3; t.moist = 75; t.tTf = g.cycle;
          fx.push({ kind: 'transform', tile: i, from, to: 'river' });
        }
      }
      // knock down some dev
      for (const t of g.tiles) if ((t.biome === 'forest' || t.biome === 'tropical') && t.dev > 1) t.dev -= 0.4;
      g.rng = rng as GameState['rng'];
      fx.push({ kind: 'milestone', key: 'ev.superstorm.applied', tone: 'bad' });
    },
  },
  {
    id: 'meteor', kind: 'choice', good: false,
    cond: () => true, weight: () => 3.5,
    options: [
      {
        key: 'ev.meteor.a', apply: (g, fx) => {
          g.res.minerals += 55; g.res.research += 8;
          addMod(g, 'dustveil', 2);
          fx.push({ kind: 'float', tile: g.hubIndex, text: '+55⛁', tone: 'good' });
        },
      },
      {
        key: 'ev.meteor.b', apply: (g, fx) => {
          // redirect into a basin → new water reservoir
          const cand = [...g.tiles.keys()].filter((i) => g.tiles[i].elev <= 1 && g.tiles[i].biome !== 'ocean');
          if (cand.length) {
            const i = cand[g.cycle % cand.length];
            const t = g.tiles[i];
            const from = t.biome;
            t.biome = 'ocean'; t.moist = 80; t.dev = 3; t.tTf = g.cycle;
            g.res.water += 25;
            fx.push({ kind: 'transform', tile: i, from, to: 'ocean' });
          } else g.res.water += 35;
          floatPlanet(g, 'temp', 1.5);
        },
      },
      {
        key: 'ev.meteor.c', apply: (g, fx) => {
          floatPlanet(g, 'bio', -6);
          const nei = neighborsIdx(g.mapR);
          const dmg = new Set<number>();
          for (let i = 0; i < g.tiles.length; i++) {
            if (g.tiles[i].poll > 0) for (const j of nei[i]) dmg.add(j);
          }
          const hit = [...dmg].filter((i) => BIOMES[g.tiles[i].biome].placeable && g.tiles[i].dev > 0);
          for (const i of hit.slice(0, 6)) {
            const t = g.tiles[i];
            t.dev = 0;
            t.poll = Math.min(100, t.poll + 30);
            fx.push({ kind: 'float', tile: i, text: '✖', tone: 'bad' });
          }
          g.stats.tilesLost += Math.min(6, hit.length);
        },
      },
    ],
  },
  {
    id: 'aquifer', kind: 'choice', good: true,
    cond: (g) => g.cycle > 6, weight: () => 4,
    options: [
      {
        key: 'ev.aquifer.a', apply: (g, fx) => {
          g.res.water += 80;
          floatPlanet(g, 'bio', -4);
          floatPlanet(g, 'fert', -3);
          fx.push({ kind: 'float', tile: g.hubIndex, text: '+80💧', tone: 'good' });
        },
      },
      {
        key: 'ev.aquifer.b', apply: (g, fx) => {
          addMod(g, 'aquiferGuard', 14);
          for (const t of g.tiles) t.moist = clamp(t.moist + 8, 0, 100);
          fx.push({ kind: 'milestone', key: 'ev.aquifer.preserved', tone: 'good' });
        },
      },
      {
        key: 'ev.aquifer.c', apply: (g, fx) => {
          const { keyToIdx } = mapIndex(g.mapR);
          const { coords } = mapIndex(g.mapR);
          void keyToIdx;
          let made = 0;
          for (let i = 0; i < coords.length && made < 3; i++) {
            const t = g.tiles[i];
            if (t.elev <= 2 && (t.biome === 'barren' || t.biome === 'rockwaste') && made < 3 && i % 7 === g.cycle % 7) {
              const from = t.biome;
              t.biome = 'river'; t.dev = 3; t.moist = 70; t.tTf = g.cycle;
              fx.push({ kind: 'transform', tile: i, from, to: 'river' });
              made++;
            }
          }
          g.res.water += 20;
        },
      },
    ],
  },
  {
    id: 'eruption', kind: 'instant', good: false,
    cond: (g) => g.tiles.some((t) => t.geo === 1), weight: (g) => (g.mode === 'volcanic' ? 9 : 3.5) - (g.planet.stability / 25),
    apply: (g, fx) => {
      let rng = g.rng as RngState;
      const [hot, r2] = pickTiles(g, 3, (i) => g.tiles[i].elev >= 3, rng);
      rng = r2;
      for (const i of hot) {
        const t = g.tiles[i];
        for (const nb of neighborsIdx(g.mapR)[i]) {
          const o = g.tiles[nb];
          if (o.dev > 0.4 && rng) {
            const [r, s] = rngFloat(rng); rng = s;
            if (r < 0.5) {
              const from = o.biome;
              o.dev = 0; o.poll = clamp(o.poll + 22, 0, 100);
              if (from === 'barren' || from === 'rockwaste') o.fert = clamp(o.fert + 12, 0, 100);
              if (o.biome === 'forest' && r < 0.25) { o.biome = 'rockwaste'; o.tTf = g.cycle; fx.push({ kind: 'transform', tile: nb, from, to: 'rockwaste' }); }
            } else {
              o.fert = clamp(o.fert + 14, 0, 100); // ash makes soil
            }
          }
        }
        t.dep = Math.min(3, t.dep + 1);
      }
      floatPlanet(g, 'temp', 3);
      floatPlanet(g, 'pollution', 7);
      g.rng = rng as GameState['rng'];
      fx.push({ kind: 'milestone', key: 'ev.eruption.applied', tone: 'bad' });
    },
  },
  {
    id: 'pestbloom', kind: 'instant', good: false,
    cond: (g) => g.tiles.filter((t) => t.biome === 'forest' || t.biome === 'tropical').length > 10,
    weight: (g) => g.tiles.filter((t) => t.biome === 'forest').length / 8,
    apply: (g, fx) => {
      addMod(g, 'pest', 3);
      fx.push({ kind: 'milestone', key: 'ev.pest.applied', tone: 'bad' });
    },
  },
  {
    id: 'ecoboom', kind: 'instant', good: true,
    cond: (g) => g.planet.bio > 40,
    weight: (g) => (g.planet.bio - 35) / 8,
    apply: (g, fx) => {
      addMod(g, 'ecoBoom', 4);
      g.res.biomass += 20;
      fx.push({ kind: 'milestone', key: 'ev.ecoboom.applied', tone: 'good' });
    },
  },
  {
    id: 'aurora', kind: 'choice', good: true,
    cond: (g) => g.planet.pressure > 20, weight: () => 2.5,
    options: [
      { key: 'ev.aurora.a', apply: (g, fx) => { g.res.research += 18; fx.push({ kind: 'float', tile: g.hubIndex, text: '+18◉', tone: 'good' }); } },
      { key: 'ev.aurora.b', apply: (g, fx) => { g.res.energy += 22; addMod(g, 'geoSurge', 2); fx.push({ kind: 'float', tile: g.hubIndex, text: '+22⚡', tone: 'good' }); } },
      { key: 'ev.aurora.c', apply: (g) => { floatPlanet(g, 'stability', 4); floatPlanet(g, 'bio', 2); } },
    ],
  },
  {
    id: 'seedship', kind: 'choice', good: true,
    cond: (g) => g.cycle > 14 && g.planet.oxygen > 8, weight: () => 2,
    options: [
      {
        key: 'ev.seedship.a', apply: (g, fx) => {
          // accept biological cargo: +biomass & random biome boost
          g.res.biomass += 30;
          for (const t of g.tiles) if (BIOMES[t.biome].id !== 'barren') { t.fert = clamp(t.fert + 6, 0, 100); }
          fx.push({ kind: 'float', tile: g.hubIndex, text: '+30❧', tone: 'good' });
        },
      },
      {
        key: 'ev.seedship.b', apply: (g, fx) => {
          g.res.minerals += 40; g.res.energy += 10;
          fx.push({ kind: 'float', tile: g.hubIndex, text: '+40⛁', tone: 'good' });
        },
      },
      {
        key: 'ev.seedship.c', apply: (g) => {
          addMod(g, 'aquiferGuard', 10);
          floatPlanet(g, 'stability', 3);
          floatPlanet(g, 'bio', 3);
        },
      },
    ],
  },
  {
    id: 'geosurge', kind: 'instant', good: true,
    cond: (g) => g.tiles.some((t) => t.geo === 1),
    weight: () => 2,
    apply: (g, fx) => {
      addMod(g, 'geoSurge', 3);
      fx.push({ kind: 'milestone', key: 'ev.geosurge.applied', tone: 'good' });
    },
  },
];

export const EVENT_MAP = new Map<string, EventDef>(EVENTS.map((e) => [e.id, e] as const));

/** roll for a new event; returns pendingChoice set */
export function rollEvent(g: GameState, fx: Fx[]): void {
  if (g.pendingChoice) return;
  let rng = g.rng as RngState;
  const volc = g.mode === 'volcanic';
  const pChance = clamp(0.13 + (volc ? 0.05 : 0) + (g.mode === 'hardcore' ? 0.05 : 0) - (g.planet.stability / 10) * 0.02, 0.05, 0.3);
  const [r, s] = rngFloat(rng);
  rng = s;
  if (r >= pChance) { g.rng = rng as GameState['rng']; return; }
  const eligible = EVENTS.filter((e) => e.cond(g));
  const weights = eligible.map((e) => Math.max(0.1, e.weight(g)));
  const total = weights.reduce((a, b) => a + b, 0);
  const [pick, s2] = rngFloat(rng);
  rng = s2;
  let acc = pick * total;
  let ev: EventDef | undefined;
  for (let i = 0; i < eligible.length; i++) {
    acc -= weights[i];
    if (acc <= 0) { ev = eligible[i]; break; }
  }
  if (!ev) { g.rng = rng as GameState['rng']; return; }
  g.stats.eventsSeen++;
  if (ev.kind === 'instant') {
    ev.apply!(g, fx);
    g.recentEvents.push({ eventId: ev.id, cycle: g.cycle });
  } else {
    g.pendingChoice = { eventId: ev.id, cycle: g.cycle };
    g.recentEvents.push({ eventId: ev.id, cycle: g.cycle });
  }
  if (g.recentEvents.length > 30) g.recentEvents.shift();
  g.rng = rng as GameState['rng'];
}

export function resolveChoice(g: GameState, option: number, fx: Fx[]): boolean {
  if (!g.pendingChoice) return false;
  const ev = EVENTS.find((e) => e.id === g.pendingChoice!.eventId);
  if (!ev || !ev.options || option < 0 || option >= ev.options.length) return false;
  ev.options[option].apply(g, fx);
  g.stats.decisionsMade++;
  g.recentEvents.push({ eventId: ev.id, cycle: g.cycle, choice: ev.options[option].key });
  g.pendingChoice = null;
  fx.push({ kind: 'event', eventId: ev.id });
  return true;
}

/** multiplier from active modifiers for economy */
export function economyMod(g: GameState): Record<string, number> {
  const out: Record<string, number> = { energy: 1, water: 1, research: 1, minerals: 1, biomass: 1 };
  for (const m of g.modifiers) {
    if (m.id === 'solarFlare') out.energy *= 0.5;
    if (m.id === 'geoSurge') out.energy *= 1.4;
    if (m.id === 'aurora') out.research *= 1.25;
    if (m.id === 'drought') out.water *= 0.7;
    if (m.id === 'dustveil') out.energy *= 0.8;
  }
  return out;
}
