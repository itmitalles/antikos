import { AXIAL_DIRECTIONS, hexId, hexagonBoard, hexDistance, neighbors } from "./hex";
import type { Continent, ResourceType, TerrainType, Tile } from "./types";
import { emptyPopulation, emptyUnits } from "./types";

export const BOARD_RADIUS = 6;
const CONTINENT_NAMES = ["Latium", "Achaia", "Numidia", "Ionia", "Hispania", "Illyrien"];
const CONTINENT_COLORS = ["#4a7c59", "#7c4a6b", "#4a5f7c", "#7c6b4a", "#6b4a7c", "#4a7c6b"];

export type Rng = () => number;

export interface ResourceRule {
  resource: ResourceType;
  /** Relative frequency; the generator only uses this data, not rendering constants. */
  weight: number;
  /** Terrain types on which this resource may be generated. */
  terrains: TerrainType[];
  /** Minimum axial distance to another occurrence of the same resource. */
  minDistance: number;
  /** Likelihood of extending an adjacent resource region when spacing permits it. */
  clusterChance: number;
}

export interface MapConfig {
  radius: number;
  continentCount: number;
  wastelandRatio: number;
  riverCount: number;
  resources: ResourceRule[];
}

/**
 * Default world data for the vertical slice. Callers can supply another
 * configuration or a deterministic RNG without changing game or render code.
 */
export const DEFAULT_MAP_CONFIG: MapConfig = {
  radius: BOARD_RADIUS,
  continentCount: 5,
  wastelandRatio: 0.1,
  riverCount: 2,
  resources: [
    { resource: "wood", weight: 1.3, terrains: ["forest", "hills"], minDistance: 1, clusterChance: 0.48 },
    { resource: "stone", weight: 0.9, terrains: ["hills", "mountains"], minDistance: 2, clusterChance: 0.2 },
    { resource: "marble", weight: 0.5, terrains: ["hills", "mountains"], minDistance: 3, clusterChance: 0.08 },
    { resource: "grain", weight: 1.25, terrains: ["plains"], minDistance: 1, clusterChance: 0.42 },
    { resource: "olive", weight: 1, terrains: ["forest", "hills", "plains"], minDistance: 1, clusterChance: 0.38 },
    { resource: "wine", weight: 0.75, terrains: ["hills", "plains"], minDistance: 2, clusterChance: 0.22 },
    { resource: "ore", weight: 0.8, terrains: ["hills", "mountains"], minDistance: 2, clusterChance: 0.18 },
  ],
};

/** Deterministic Mulberry32 RNG for reproducible map seeds. */
export function seededRng(seed: string | number): Rng {
  let value = typeof seed === "number" ? seed >>> 0 : 2166136261;
  if (typeof seed === "string") {
    for (let i = 0; i < seed.length; i++) {
      value ^= seed.charCodeAt(i);
      value = Math.imul(value, 16777619);
    }
  }
  return () => {
    value |= 0;
    value = (value + 0x6D2B79F5) | 0;
    let result = Math.imul(value ^ (value >>> 15), 1 | value);
    result = (result + Math.imul(result ^ (result >>> 7), 61 | result)) ^ result;
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

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
  radius: number,
  rng: Rng
) {
  let currentId = startId;
  const visited = new Set<string>();
  for (let step = 0; step < radius + 4; step++) {
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

function terrainFor(rule: ResourceRule | undefined, rng: Rng): TerrainType {
  if (rule) return rule.terrains[Math.floor(rng() * rule.terrains.length)];
  const roll = rng();
  return roll < 0.5 ? "plains" : roll < 0.72 ? "forest" : roll < 0.88 ? "hills" : roll < 0.95 ? "desert" : "coast";
}

function weightedRule(rules: ResourceRule[], rng: Rng): ResourceRule {
  const total = rules.reduce((sum, rule) => sum + rule.weight, 0);
  let roll = rng() * total;
  for (const rule of rules) {
    if (roll < rule.weight) return rule;
    roll -= rule.weight;
  }
  return rules[rules.length - 1];
}

function canPlaceResource(
  id: string,
  rule: ResourceRule,
  assignments: Map<string, ResourceType>,
  coords: Map<string, { q: number; r: number }>
): boolean {
  const coord = coords.get(id)!;
  for (const [otherId, otherResource] of assignments) {
    if (otherResource !== rule.resource) continue;
    if (hexDistance(coord, coords.get(otherId)!) < rule.minDistance) return false;
  }
  return true;
}

function resourceAssignments(
  ids: string[],
  coords: Map<string, { q: number; r: number }>,
  config: MapConfig,
  rng: Rng
): Map<string, ResourceRule> {
  const assignments = new Map<string, ResourceType>();
  const result = new Map<string, ResourceRule>();
  for (const id of shuffle(ids, rng)) {
    const coord = coords.get(id)!;
    const neighbouringRules = AXIAL_DIRECTIONS
      .map((direction) => result.get(hexId(coord.q + direction.q, coord.r + direction.r)))
      .filter((rule): rule is ResourceRule => Boolean(rule));
    const clustered = neighbouringRules.filter((rule) => rng() < rule.clusterChance && canPlaceResource(id, rule, assignments, coords));
    const eligible = config.resources.filter((rule) => canPlaceResource(id, rule, assignments, coords));
    const pool = clustered.length > 0 ? clustered : eligible.length > 0 ? eligible : config.resources;
    const rule = weightedRule(pool, rng);
    assignments.set(id, rule.resource);
    result.set(id, rule);
  }
  return result;
}

export function generateMap(
  rng: Rng = Math.random,
  config: MapConfig = DEFAULT_MAP_CONFIG
): { tiles: Record<string, Tile>; tileOrder: string[]; continents: Continent[] } {
  const coords = hexagonBoard(config.radius);
  const ids = coords.map((c) => hexId(c.q, c.r));
  const coordById = new Map(coords.map((c) => [hexId(c.q, c.r), c]));

  // --- Continent partition: multi-source BFS flood-fill from random seed hexes ---
  const seedCount = Math.min(CONTINENT_NAMES.length, config.continentCount);
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

  // --- Resource assignment ---
  const wastelandCount = Math.max(2, Math.round(ids.length * config.wastelandRatio));
  const shuffledIds = shuffle(ids, rng);
  const resourceIds = shuffledIds.slice(wastelandCount);
  const resourcesById = resourceAssignments(resourceIds, coordById, config, rng);
  const tiles: Record<string, Tile> = {};
  for (const id of ids) {
    const coord = coordById.get(id)!;
    const rule = resourcesById.get(id);
    tiles[id] = {
      id,
      q: coord.q,
      r: coord.r,
      continentId: continentOf.get(id)!,
      terrain: terrainFor(rule, rng),
      resource: rule?.resource ?? null,
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
    return hexDistance(c, { q: 0, r: 0 }) === config.radius;
  });
  const riverSources = shuffle(boundaryIds, rng).slice(0, config.riverCount);
  for (const source of riverSources) addRiverPath(tiles, coordById, source, config.radius, rng);

  return { tiles, tileOrder: ids, continents };
}
