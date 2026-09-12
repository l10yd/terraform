/**
 * Deterministic RNG utilities.
 * The whole simulation draws randomness exclusively from RngState, which is
 * fully serialized into save games. Given the same state and the same action
 * sequence, the sim always produces the same result.
 */

/** mulberry32 hash of an arbitrary string → uint32 seed. */
export function hashString(str: string): number {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** One step of mulberry32 (used for stateless hashing helpers). */
export function mulberry32Next(a: number): [number, number] {
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, a];
}

/** Full sfc32 state (4 × uint32) — serializable. */
export interface RngState {
  a: number;
  b: number;
  c: number;
  d: number;
}

export function seedRng(seed: string | number): RngState {
  const s = typeof seed === 'number' ? seed >>> 0 : hashString(seed);
  // KDF via splitmix-style rounds so nearby seeds decorrelate.
  let x = s >>> 0;
  const next = () => {
    x = (x + 0x9e3779b9) | 0;
    let t = x;
    t = Math.imul(t ^ (t >>> 16), 0x21f0aaad) >>> 0;
    t = Math.imul(t ^ (t >>> 15), 0x735a2d97) >>> 0;
    return (t ^ (t >>> 15)) >>> 0;
  };
  const st: RngState = { a: next(), b: next(), c: next(), d: next() };
  // Warm up.
  for (let i = 0; i < 12; i++) rngFloat(st);
  return st;
}

/** Returns [float 0..1, newState]. Pure: the caller keeps the returned state. */
export function rngFloat(st: RngState): [number, RngState] {
  let { a, b, c, d } = st;
  d = (d + 1) | 0;
  const t = (a + b) | 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) | 0;
  c = ((c << 21) | (c >>> 11)) | 0;
  c = (c + t) | 0;
  d = (d + t) | 0;
  return [((d >>> 0) / 4294967296), { a: a >>> 0, b: b >>> 0, c: c >>> 0, d: d >>> 0 }];
}

/** Integer in [0, max). */
export function rngInt(st: RngState, max: number): [number, RngState] {
  const [f, s] = rngFloat(st);
  return [Math.floor(f * max), s];
}

/** Pick a random element. */
export function rngPick<T>(st: RngState, arr: readonly T[]): [T, RngState] {
  const [i, s] = rngInt(st, arr.length);
  return [arr[i], s];
}

/** Stateless 2D value hash in [0,1] — for procedural textures on the grid. */
export function hash2d(seed: number, x: number, y: number): number {
  let h = seed >>> 0;
  h = Math.imul(h ^ (x * 0x9e3779b9 + 0x85ebca6b), 0xc2b2ae35);
  h ^= h >>> 13;
  h = Math.imul(h ^ (y * 0x85ebca6b + 0x27d4eb2f), 0x165667b1);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise on axial hex coords (deterministic, cheap). */
export function hexNoise(seed: number, q: number, r: number, scale: number): number {
  const x = q / scale;
  const y = r / scale;
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const s = (n: number) => n * n * (3 - 2 * n);
  const u = s(xf);
  const v = s(yf);
  const a = hash2d(seed, xi, yi);
  const b = hash2d(seed, xi + 1, yi);
  const c = hash2d(seed, xi, yi + 1);
  const d2 = hash2d(seed, xi + 1, yi + 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d2 * u) * v;
}

/** Fractal hex noise, 3 octaves, [0,1]. */
export function fbmHex(seed: number, q: number, r: number, baseScale = 7): number {
  let amp = 1;
  let total = 0;
  let norm = 0;
  let scale = baseScale;
  for (let i = 0; i < 3; i++) {
    total += hexNoise(seed + i * 7919, q, r, scale) * amp;
    norm += amp;
    amp *= 0.5;
    scale *= 0.45;
  }
  return total / norm;
}
