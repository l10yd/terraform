/**
 * Lightweight planet snapshots — every few cycles we record biome+dev per
 * tile. The end-of-game report replays these to show the planet transforming
 * from barren to alive (the emotional payoff).
 */
import { BIOME_ORDER } from './defs';
import type { GameState, SnapshotFrame } from './types';

export function pushSnapshot(g: GameState, force = false): void {
  const frame: SnapshotFrame = {
    cycle: g.cycle,
    b: g.tiles.map((t) => BIOME_ORDER.indexOf(t.biome)),
    d: g.tiles.map((t) => t.dev),
  };
  if (!force && g.snapshots.some((f) => f.cycle === g.cycle)) return;
  g.snapshots.push(frame);
  // thin out: keep ≤ 48 frames, always first & last
  while (g.snapshots.length > 48) {
    const keep: SnapshotFrame[] = [];
    for (let i = 0; i < g.snapshots.length; i++) {
      if (i % 2 === 0 || i === g.snapshots.length - 1) keep.push(g.snapshots[i]);
    }
    g.snapshots = keep;
  }
}

/** Interpolate between snapshot frames at a given cycle for the replay. */
export function snapshotAt(g: GameState, cycle: number): { b: number[]; d: number[] } {
  const snaps = g.snapshots;
  if (snaps.length === 0) return { b: [], d: [] };
  if (cycle <= snaps[0].cycle) return snaps[0];
  if (cycle >= snaps[snaps.length - 1].cycle) return snaps[snaps.length - 1];
  let lo = 0;
  while (lo < snaps.length - 1 && snaps[lo + 1].cycle < cycle) lo++;
  const a = snaps[lo];
  const b = snaps[lo + 1] ?? a;
  const span = Math.max(1, b.cycle - a.cycle);
  const f = Math.max(0, Math.min(1, (cycle - a.cycle) / span));
  const out = { b: a.b.map((x, i) => (f < 0.5 ? x : b.b[i])), d: a.d.map((x, i) => Math.round(x + (b.d[i] - x) * f)) };
  return out;
}
