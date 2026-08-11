// Axial coordinate hex-grid math (pointy-top), Red Blob Games conventions.

export interface Axial {
  q: number;
  r: number;
}

export function hexId(q: number, r: number): string {
  return `${q},${r}`;
}

export function axialFromId(id: string): Axial {
  const [q, r] = id.split(",").map(Number);
  return { q, r };
}

export const AXIAL_DIRECTIONS: Axial[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export function neighbors(a: Axial): Axial[] {
  return AXIAL_DIRECTIONS.map((d) => ({ q: a.q + d.q, r: a.r + d.r }));
}

export function hexDistance(a: Axial, b: Axial): number {
  const aq = a.q, ar = a.r, as = -a.q - a.r;
  const bq = b.q, br = b.r, bs = -b.q - b.r;
  return Math.max(Math.abs(aq - bq), Math.abs(ar - br), Math.abs(as - bs));
}

/** All axial coords within a hexagonal board of the given radius, centered on origin. */
export function hexagonBoard(radius: number): Axial[] {
  const result: Axial[] = [];
  for (let q = -radius; q <= radius; q++) {
    const r1 = Math.max(-radius, -q - radius);
    const r2 = Math.min(radius, -q + radius);
    for (let r = r1; r <= r2; r++) {
      result.push({ q, r });
    }
  }
  return result;
}

export function axialToPixel(a: Axial, size: number): { x: number; y: number } {
  const x = size * (Math.sqrt(3) * a.q + (Math.sqrt(3) / 2) * a.r);
  const y = size * ((3 / 2) * a.r);
  return { x, y };
}

/** Corner points of a pointy-top hex centered at (cx, cy). */
export function hexCorners(cx: number, cy: number, size: number): [number, number][] {
  const corners: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    corners.push([cx + size * Math.cos(angle), cy + size * Math.sin(angle)]);
  }
  return corners;
}

/** Round fractional axial coordinates to the nearest hex. */
export function axialRound(q: number, r: number): Axial {
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  let rs = Math.round(s);
  const qDiff = Math.abs(rq - q);
  const rDiff = Math.abs(rr - r);
  const sDiff = Math.abs(rs - s);
  if (qDiff > rDiff && qDiff > sDiff) {
    rq = -rr - rs;
  } else if (rDiff > sDiff) {
    rr = -rq - rs;
  }
  return { q: rq, r: rr };
}

export function pixelToAxial(x: number, y: number, size: number): Axial {
  const q = ((Math.sqrt(3) / 3) * x - (1 / 3) * y) / size;
  const r = ((2 / 3) * y) / size;
  return axialRound(q, r);
}
