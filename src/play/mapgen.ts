import { hexId, hexagonBoard, neighbors } from "./hex";
import type { Continent, ResourceType, Tile } from "./types";
import { RESOURCE_TYPES } from "./types";

export const BOARD_RADIUS = 3;
const CONTINENT_NAMES = ["Nordmark", "Sudholm", "Ostrand", "Westfeld", "Kernland", "Fernau"];
const CONTINENT_COLORS = ["#4a7c59", "#7c4a6b", "#4a5f7c", "#7c6b4a", "#6b4a7c", "#4a7c6b"];

export type Rng = () => number;

function shuffle<T>(arr: T[], rng: Rng): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Weighted pool of dice-sum number tokens (2-12, excluding 7), weighted like real dice pips. */
function numberPool(count: number, rng: Rng): number[] {
  const weights: [number, number][] = [
    [2, 1], [3, 2], [4, 3], [5, 4], [6, 5],
    [8, 5], [9, 4], [10, 3], [11, 2], [12, 1],
  ];
  const totalWeight = weights.reduce((s, [, w]) => s + w, 0);
  const pool: number[] = [];
  for (let i = 0; i < count; i++) {
    let x = rng() * totalWeight;
    for (const [num, w] of weights) {
      if (x < w) {
        pool.push(num);
        break;
      }
      x -= w;
    }
  }
  return pool;
}

export function generateMap(rng: Rng = Math.random): { tiles: Record<string, Tile>; tileOrder: string[]; continents: Continent[] } {
  const coords = hexagonBoard(BOARD_RADIUS);
  const ids = coords.map((c) => hexId(c.q, c.r));
  const coordById = new Map(coords.map((c) => [hexId(c.q, c.r), c]));

  // --- Continent partition: multi-source BFS flood-fill from random seed hexes ---
  const seedCount = Math.min(CONTINENT_NAMES.length, 5);
  const seeds = shuffle(ids, rng).slice(0, seedCount);
  const continentOf = new Map<string, number>();
  const frontier: string[][] = seeds.map((s) => [s]);
  seeds.forEach((s, i) => continentOf.set(s, i));
  let remaining = ids.length - seeds.length;
  while (remaining > 0) {
    for (let i = 0; i < frontier.length && remaining > 0; i++) {
      const next: string[] = [];
      for (const id of frontier[i]) {
        const coord = coordById.get(id)!;
        for (const n of neighbors(coord)) {
          const nid = hexId(n.q, n.r);
          if (coordById.has(nid) && !continentOf.has(nid)) {
            continentOf.set(nid, i);
            next.push(nid);
            remaining--;
          }
        }
      }
      frontier[i] = next;
    }
    // Safety valve: if every frontier is exhausted but tiles remain unassigned
    // (can't happen on a contiguous hexagon board, but guard anyway).
    if (frontier.every((f) => f.length === 0)) break;
  }
  // Any stragglers (shouldn't occur) join continent 0.
  for (const id of ids) if (!continentOf.has(id)) continentOf.set(id, 0);

  const continents: Continent[] = [];
  for (let i = 0; i < seedCount; i++) {
    const tileIds = ids.filter((id) => continentOf.get(id) === i);
    continents.push({
      id: i,
      name: CONTINENT_NAMES[i],
      color: CONTINENT_COLORS[i % CONTINENT_COLORS.length],
      tileIds,
      bonus: Math.max(1, Math.ceil(tileIds.length / 3)),
    });
  }

  // --- Resource + number assignment ---
  const wastelandCount = Math.max(2, Math.round(ids.length * 0.1));
  const shuffledIds = shuffle(ids, rng);
  const wastelandIds = new Set(shuffledIds.slice(0, wastelandCount));
  const resourceIds = shuffledIds.slice(wastelandCount);

  const resourcePool: ResourceType[] = [];
  for (let i = 0; i < resourceIds.length; i++) {
    resourcePool.push(RESOURCE_TYPES[i % RESOURCE_TYPES.length]);
  }
  const shuffledResources = shuffle(resourcePool, rng);
  const numbers = numberPool(resourceIds.length, rng);

  const tiles: Record<string, Tile> = {};
  for (const id of ids) {
    const coord = coordById.get(id)!;
    const isWasteland = wastelandIds.has(id);
    const idx = resourceIds.indexOf(id);
    tiles[id] = {
      id,
      q: coord.q,
      r: coord.r,
      continentId: continentOf.get(id)!,
      resource: isWasteland ? null : shuffledResources[idx],
      number: isWasteland ? null : numbers[idx],
      ownerId: null,
      armies: 0,
      level: 0,
      hasFort: false,
    };
  }

  return { tiles, tileOrder: ids, continents };
}
