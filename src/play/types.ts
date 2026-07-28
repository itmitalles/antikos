export type ResourceType = "wood" | "stone" | "marble" | "grain" | "olive" | "wine" | "ore";

export const RESOURCE_TYPES: ResourceType[] = ["wood", "stone", "marble", "grain", "olive", "wine", "ore"];

export const RESOURCE_ICON: Record<ResourceType, string> = {
  wood: "🪵",
  stone: "🪨",
  marble: "🏛️",
  grain: "🌾",
  olive: "🫒",
  wine: "🍷",
  ore: "⛏️",
};

export const RESOURCE_LABEL: Record<ResourceType, string> = {
  wood: "Holz",
  stone: "Stein",
  marble: "Marmor",
  grain: "Getreide",
  olive: "Oliven",
  wine: "Wein",
  ore: "Erz",
};

/** Building name per tier (1-3) for each resource type's development. */
export const BUILDING_NAMES: Record<ResourceType, [string, string, string]> = {
  wood: ["Holzfällerlager", "Sägewerk", "Forstgut"],
  stone: ["Steinbruch", "Steinmetzhof", "Bruchgut"],
  marble: ["Marmorgrube", "Marmorbruch", "Marmorpalast"],
  grain: ["Acker", "Gehöft", "Kornkammer"],
  olive: ["Ölhain", "Olivenpresse", "Ölgut"],
  wine: ["Rebstock", "Weinberg", "Weingut"],
  ore: ["Schürfstelle", "Erzmine", "Bergwerk"],
};

export const MAX_TILE_LEVEL = 3;

export const ARMY_COST: Partial<Record<ResourceType, number>> = { ore: 1, grain: 1 };
export const EXPAND_COST: Partial<Record<ResourceType, number>> = { wood: 1, stone: 1 };
export const FORT_COST: Partial<Record<ResourceType, number>> = { stone: 2, marble: 1 };

/** Cost to upgrade a tile from `currentLevel` to `currentLevel + 1`. */
export function upgradeCost(resource: ResourceType, currentLevel: number): Partial<Record<ResourceType, number>> {
  return { [resource]: currentLevel + 1 };
}

export interface Tile {
  id: string;
  q: number;
  r: number;
  continentId: number;
  resource: ResourceType | null;
  number: number | null;
  ownerId: string | null;
  armies: number;
  /** Development tier of the resource building on this tile: 0 = undeveloped, 1-3 = built up. */
  level: number;
  hasFort: boolean;
}

export interface Continent {
  id: number;
  name: string;
  color: string;
  tileIds: string[];
  bonus: number;
}

export type PlayerKind = "human" | "ai";

export type ResourceStock = Record<ResourceType, number>;

export interface Player {
  id: string;
  name: string;
  color: string;
  kind: PlayerKind;
  resources: ResourceStock;
  alive: boolean;
}

export type Phase =
  | "placement"
  | "bonus"
  | "roll"
  | "build"
  | "attack"
  | "gameover";

export interface CombatResult {
  attackerTile: string;
  defenderTile: string;
  attackerDice: number[];
  defenderDice: number[];
  attackerLosses: number;
  defenderLosses: number;
  captured: boolean;
}

export interface GameState {
  tiles: Record<string, Tile>;
  tileOrder: string[];
  continents: Continent[];
  players: Player[];
  currentPlayerIndex: number;
  phase: Phase;
  lastRoll: [number, number] | null;
  log: string[];
  bonusRemaining: number;
  winnerId: string | null;
  placementQueue: string[];
  placementIndex: number;
  hasAttackedThisTurn: boolean;
}

export function emptyStock(): ResourceStock {
  return { wood: 0, stone: 0, marble: 0, grain: 0, olive: 0, wine: 0, ore: 0 };
}
