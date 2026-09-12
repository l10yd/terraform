/**
 * Hex grid math — pointy-top axial coordinates.
 * q = column-ish, r = row-ish. The grid is a hex-shaped map of given radius.
 */

export interface Hex {
  q: number;
  r: number;
}

/** Pointy-top neighbor directions, ordered E, NE, NW, W, SW, SE (clockwise from E). */
export const DIRS: readonly Hex[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export function hexKey(q: number, r: number): string {
  return `${q},${r}`;
}

export function hexFromKey(key: string): Hex {
  const [q, r] = key.split(',').map(Number);
  return { q, r };
}

export function hexAdd(a: Hex, b: Hex): Hex {
  return { q: a.q + b.q, r: a.r + b.r };
}

export function hexDistance(a: Hex, b: Hex): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

/** All tile keys of a hexagonal map of `radius`. Deterministic order (r, then q). */
export function hexMapCoords(radius: number): Hex[] {
  const out: Hex[] = [];
  for (let r = -radius; r <= radius; r++) {
    const qMin = Math.max(-radius, -r - radius);
    const qMax = Math.min(radius, -r + radius);
    for (let q = qMin; q <= qMax; q++) out.push({ q, r });
  }
  return out;
}

/** Neighbors of a hex, restricted to a set of valid keys. */
export function neighborsOf(hex: Hex, valid: Set<string>): Hex[] {
  const out: Hex[] = [];
  for (const d of DIRS) {
    const n = hexAdd(hex, d);
    if (valid.has(hexKey(n.q, n.r))) out.push(n);
  }
  return out;
}

// ---------------------------------------------------------------------------
// World layout — the map sits on a subtle dome so the horizon curves like a
// planet seen from a low strategic camera. Elevation is applied per tile.
// ---------------------------------------------------------------------------

export const HEX_SIZE = 1; // circumradius in world units
export const DOME_CURVATURE = 0.011; // how strongly the disc bends down at edges

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Flat plane position of a hex (before elevation / dome). */
export function axialToPlane(hex: Hex, size = HEX_SIZE): { x: number; z: number } {
  const x = size * Math.sqrt(3) * (hex.q + hex.r / 2);
  const z = size * 1.5 * hex.r;
  return { x, z };
}

/** Height of the dome at a plane position (negative at edges). */
export function domeHeight(x: number, z: number): number {
  return -DOME_CURVATURE * (x * x + z * z);
}

/** Vertical world units per elevation level. */
export const ELEV_STEP = 0.26;
/** Waterline (top of sea level) in elevation units relative to tile base. */
export const SEA_LEVEL_Y = 0.62 * ELEV_STEP;

export function cornerAngles(size = HEX_SIZE): number[] {
  // pointy-top in the (x,z) plane: corner at (0,±1) and (±0.866,±0.5)
  const out: number[] = [];
  for (let i = 0; i < 6; i++) out.push((Math.PI / 180) * (60 * i + 90));
  return out;
}

/** The 6 corner offsets (local, x/z) of a pointy-top hex. */
export function hexCorners(size = HEX_SIZE): { x: number; z: number }[] {
  return cornerAngles(size).map((a) => ({ x: Math.cos(a) * size, z: Math.sin(a) * size }));
}

/** Plane position → fractional axial coords. */
export function planeToAxial(x: number, z: number, size = HEX_SIZE): { q: number; r: number } {
  const q = (Math.sqrt(3) / 3 * x - z / 3) / size;
  const r = (2 / 3 * z) / size;
  return { q, r };
}

/** Round fractional axial to the nearest hex. */
export function axialRound(qf: number, rf: number): Hex {
  const sf = -qf - rf;
  let q = Math.round(qf);
  let r = Math.round(rf);
  const s = Math.round(sf);
  const dq = Math.abs(q - qf);
  const dr = Math.abs(r - rf);
  const ds = Math.abs(s - sf);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return { q, r };
}
