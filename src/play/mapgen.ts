import { AXIAL_DIRECTIONS, hexId, hexagonBoard, hexDistance, neighbors } from "./hex";
import type { Continent, ResourceType, TerrainType, Tile } from "./types";
import { RESOURCE_TYPES, emptyPopulation, emptyUnits } from "./types";

export const BOARD_RADIUS = 6;
const CONTINENT_NAMES = ["Latium", "Achaia", "Numidia", "Ionia", "Hispania", "Illyrien"];
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

function addRiverPath(
  tiles: Record<string, Tile>,
  coordById: Map<string, { q: number; r: number }>,
  startId: string,
  rng: Rng
) {
  let currentId = startId;
  const visited = new Set<string>();
  for (let step = 0; step < BOARD_RADIUS + 4; step++) {
    const current = coordById.get(currentId);
    if (!current || visited.has(currentId)) return;
    visited.add(currentId);
    const currentDistance = hexDistance(current, { q: 0, r: 0 });
    if (currentDistance <= 1) return;
    const options = AXIAL_DIRECTIONS.map((d, direction) => ({
      direction,
      id: hexId(current.q + d.q, current.r + d.r),
      distance: hexDistance({ q: current.q + d.q, r: current.r + d.r }, { q: 0, r: 0 }),
    })).filter((option) => coordById.has(option.id) && option.distance < currentDistance);
    if (options.length === 0) return;
    const next = options[Math.floor(rng() * options.length)];
    const opposite = (next.direction + 3) % 6;
    tiles[currentId].riverEdges.push(next.direction);
    tiles[next.id].riverEdges.push(opposite);
    currentId = next.id;
  }
}

function terrainFor(resource: ResourceType | null, rng: Rng): TerrainType {
  if (resource === "wood" || resource === "olive") return rng() < 0.75 ? "forest" : "hills";
  if (resource === "ore" || resource === "stone" || resource === "marble") return rng() < 0.65 ? "hills" : "mountains";
  if (resource === "wine") return "hills";
  if (resource === "grain") return "plains";
  const roll = rng();
  return roll < 0.5 ? "plains" : roll < 0.72 ? "forest" : roll < 0.88 ? "hills" : roll < 0.95 ? "desert" : "coast";
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
      terrain: terrainFor(isWasteland ? null : shuffledResources[idx], rng),
      resource: isWasteland ? null : shuffledResources[idx],
      ownerId: null,
      units: emptyUnits(),
      population: emptyPopulation(),
      level: 0,
      hasFort: false,
      isCapital: false,
      riverEdges: [],
      cityId: null,
    };
  }

  // Two connected inland rivers. Their edge data is shared by both tiles so the
  // renderer can draw one continuous stream across the hex grid.
  const boundaryIds = ids.filter((id) => {
    const c = coordById.get(id)!;
    return hexDistance(c, { q: 0, r: 0 }) === BOARD_RADIUS;
  });
  const riverSources = shuffle(boundaryIds, rng).slice(0, 2);
  for (const source of riverSources) addRiverPath(tiles, coordById, source, rng);

  return { tiles, tileOrder: ids, continents };
}
