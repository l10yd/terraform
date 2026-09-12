/**
 * Idle-game check: pure "Observe Cycle" spam (auto-picking the first option on
 * every event) must NOT snowball into a win. Run: npm run build:simtest && node qa/idle.mjs
 */
import { newGame, act } from '../tests/.build/sim.mjs';

for (const seed of ['IDLE1', 'IDLE2', 'IDLE3', 'IDLE4']) {
  let g = newGame(seed, 'standard', 11);
  let guard = 0;
  while (g.cycle < 160 && guard++ < 400) {
    if (g.pendingChoice) {
      const r = act(g, { type: 'choice', eventId: g.pendingChoice.eventId, option: 0 });
      if (r.error) { console.log(seed, 'choice err', r.error); break; }
      g = r.state;
      continue;
    }
    const r = act(g, { type: 'wait' });
    if (r.error) { console.log(seed, 'wait err', r.error); break; }
    g = r.state;
  }
  const living = g.tiles.filter((t) => t.dev > 0.5).length;
  const spread = g.tiles.filter((t) => t.biome !== 'barren' && t.biome !== 'rockwaste' && t.biome !== 'ocean' && t.biome !== 'desert' && t.biome !== 'mineralfield' && t.biome !== 'alpine').length;
  console.log(`${seed}: cyc=${g.cycle} end=${g.end ? g.end.type : 'none'} bio=${g.planet.bio.toFixed(0)} stab=${g.planet.stability.toFixed(0)} phase=${g.phase} livingTiles=${living} emergedBiomes=${spread}`);
}
