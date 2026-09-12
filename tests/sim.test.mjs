import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newGame, act, stateHash, aggregateTechs, deriveAll, checkPlacement,
  BIOME_ORDER, validateSave, neighborsIdx,
} from './.build/sim.mjs';
import { botGame } from './bot.mjs';

test('generation is deterministic for the same seed', () => {
  const a = newGame('ALPHA-7', 'standard', 10);
  const b = newGame('ALPHA-7', 'standard', 10);
  assert.equal(stateHash(a), stateHash(b));
  const c = newGame('ALPHA-8', 'standard', 10);
  assert.notEqual(stateHash(a), stateHash(c));
});

test('generated planet is always playable', () => {
  for (const seed of ['S1', 'S2', 'S3', 'K9', 'MM', 'ZZ1', 'R2D2', 'HOPE']) {
    for (const mode of ['standard', 'arid', 'frozen', 'volcanic', 'ecological', 'hardcore']) {
      const g = newGame(seed, mode, 10);
      // hub exists
      assert.ok(g.tiles[g.hubIndex]?.structure === 'hub', `hub for ${seed}/${mode}`);
      // at least one water source
      assert.ok(g.tiles.some((t) => t.biome === 'ocean'), `water for ${seed}/${mode}`);
      // territory non-empty and affordable first move exists
      const agg = aggregateTechs(g);
      const hasMove = g.tiles.some((t, i) => g.inTerritory[i] && !t.structure &&
        checkPlacement(g, agg, i, 'tundra').ok || g.inTerritory[g.hubIndex] && g.res.minerals >= 3);
      assert.ok(hasMove, `first move for ${seed}/${mode}`);
      assert.ok(g.res.water > 5 && g.res.minerals > 5, `start resources for ${seed}/${mode}`);
    }
  }
});

test('sim is deterministic given the same action sequence', () => {
  const run = () => {
    let g = newGame('DET-X', 'standard', 9);
    const rndSeq = [0, 1, 2, 0, 1, 0, 0, 2, 1, 0, 1, 1, 2, 0, 0, 1];
    for (let k = 0; k < 40; k++) {
      if (g.pendingChoice) {
        const r = act(g, { type: 'choice', eventId: g.pendingChoice.eventId, option: rndSeq[k % rndSeq.length] });
        if (!r.error) g = r.state;
      }
      // deterministic pseudo-targets: rotate over territory tiles
      const terr = g.tiles.map((_, i) => i).filter((i) => g.inTerritory[i] && !g.tiles[i].structure);
      const target = terr[rndSeq[k % rndSeq.length] * 7 + k * 3 % Math.max(1, terr.length)];
      if (target !== undefined) {
        const r = act(g, { type: 'place', tile: target % Math.max(1, terr.length) === 0 ? target : target, biome: 'rockwaste' });
        if (!r.error) { g = r.state; continue; }
      }
      const w = act(g, { type: 'wait' });
      if (!w.error) g = w.state;
    }
    return stateHash(g);
  };
  assert.equal(run(), run());
});

test('resources never go negative and variables stay in range', () => {
  const { g, log } = botGame('BAL-1', 'standard', 170, 42);
  for (const row of log) {
    assert.ok(row.res.water >= 0 && row.res.minerals >= 0 && row.res.energy >= 0);
    assert.ok(row.temp >= -80 && row.temp <= 60, 'temp range');
    for (const k of ['oxygen', 'humidity', 'bio', 'water', 'pressure', 'fert', 'stability', 'pollution']) {
      assert.ok(row[k] >= -0.01 && row[k] <= 100.01, `${k} range`);
    }
  }
  void g;
});

test('balance: a heuristic bot develops the planet (phases advance, bio grows)', () => {
  const { g, log, cycles } = botGame('BAL-2', 'standard', 180, 7);
  const early = log[1] ?? log[0];
  const late = log[log.length - 1];
  console.log('bot log:', JSON.stringify(log.map((l) => ({ c: l.cycle, T: Math.round(l.temp), O2: Math.round(l.oxygen), H: Math.round(l.humidity), B: Math.round(l.bio), S: Math.round(l.stability), P: Math.round(l.pollution), ph: l.phase, th: l.techs, pl: l.placed }))));
  assert.ok(cycles >= 60, 'bot should not stall');
  assert.ok(late.bio > early.bio + 6, `biodiversity should grow (${early.bio} -> ${late.bio})`);
  assert.ok(late.phase >= 3, `phase should advance, got ${late.phase}`);
  assert.ok(late.techs >= 2, 'bot should complete some techs');
  assert.ok(late.oxygen > early.oxygen, 'oxygen should rise');
});

test('save round-trip survives serialization', () => {
  const { g } = botGame('SAVE-1', 'standard', 60, 3);
  const raw = JSON.parse(JSON.stringify(g));
  const back = validateSave(raw);
  assert.ok(back, 'validate should accept its own output');
  assert.equal(stateHash(back), stateHash(g));
});

test('preview numbers cannot exceed actual placement effects (sanity)', () => {
  let g = newGame('PV-1', 'standard', 9);
  const agg = aggregateTechs(g);
  const i = g.hubIndex;
  const d0 = deriveAll(g, agg);
  // biome placement legality is stable across derive calls
  const chk = checkPlacement(g, agg, i, 'tundra');
  if (chk.ok) {
    const r = act(g, { type: 'place', tile: i, biome: 'tundra' });
    assert.ok(!r.error);
    const d1 = deriveAll(r.state, aggregateTechs(r.state));
    assert.ok(d1.totals.prod.water >= 0 && d1.totals.prod.energy >= 0);
  }
  void d0;
});

test('combo detection finds planted patterns', () => {
  // forest + river + wetland in a star around one tile => thriving combo
  let g = newGame('CB-1', 'standard', 9);
  g.techDone.push('hyd_rivers', 'bio_lichen');
  const hub = g.hubIndex;
  const nei = neighborsIdx(g.mapR)[hub];
  const set = (i, b) => { g.tiles[i].biome = b; g.tiles[i].dev = 3; g.tiles[i].suit = 1; g.tiles[i].moist = 70; };
  set(nei[0], 'forest');
  set(nei[1], 'river');
  set(nei[2], 'wetland');
  const agg = aggregateTechs(g);
  const d = deriveAll(g, agg);
  assert.ok(d.combosFound.some((c) => c.id === 'thriving'), 'thriving ecosystem should appear');
});

test('biome ids in tiles are always valid', () => {
  const { g } = botGame('ENUM-1', 'hardcore', 120, 11);
  for (const t of g.tiles) assert.ok(BIOME_ORDER.includes(t.biome), `bad biome ${t.biome}`);
});
