export type ResourceType = "wood" | "brick" | "sheep" | "wheat" | "ore";

export const RESOURCE_TYPES: ResourceType[] = ["wood", "brick", "sheep", "wheat", "ore"];

export const RESOURCE_ICON: Record<ResourceType, string> = {
  wood: "🪵",
  brick: "🧱",
  sheep: "🐑",
  wheat: "🌾",
  ore: "⛏️",
};

export const RESOURCE_LABEL: Record<ResourceType, string> = {
  wood: "Holz",
  brick: "Lehm",
  sheep: "Wolle",
  wheat: "Getreide",
  ore: "Erz",
};

export const ARMY_COST: Partial<Record<ResourceType, number>> = { wheat: 1, ore: 1 };
export const EXPAND_COST: Partial<Record<ResourceType, number>> = { wood: 1, brick: 1 };

export interface Tile {
  id: string;
  q: number;
  r: number;
  continentId: number;
  resource: ResourceType | null;
  number: number | null;
  ownerId: string | null;
  armies: number;
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
  return { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
}
