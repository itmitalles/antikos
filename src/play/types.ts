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

export type TerrainType = "plains" | "forest" | "hills" | "mountains" | "desert" | "coast";
export const TERRAIN_LABEL: Record<TerrainType, string> = {
  plains: "Ebene", forest: "Wald", hills: "Hügelland", mountains: "Gebirge", desert: "Trockengebiet", coast: "Küste",
};

export type CityKind = "capital" | "settlement";
export type CityBuilding = "government" | "housing" | "production" | "storage" | "military" | "culture" | "wonder";
export const CITY_BUILDING_LABEL: Record<CityBuilding, string> = {
  government: "Regierungssitz", housing: "Wohnviertel", production: "Produktionshof", storage: "Lager / Markt",
  military: "Militärgebäude", culture: "Kultur- / Sakralbau", wonder: "Weltwunder",
};

export interface City {
  id: string;
  ownerId: string;
  kind: CityKind;
  level: number;
  buildings: CityBuilding[];
}

export interface RoadPlan {
  startId: string;
  endId: string;
  path: string[];
  segments: number;
  cost: Partial<Record<ResourceType, number>>;
  turns: number;
}

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

export const EXPAND_COST: Partial<Record<ResourceType, number>> = { wood: 1, stone: 1 };
export const FORT_COST: Partial<Record<ResourceType, number>> = { stone: 2, marble: 1 };

/** Cost to upgrade a tile from `currentLevel` to `currentLevel + 1`. */
export function upgradeCost(resource: ResourceType, currentLevel: number): Partial<Record<ResourceType, number>> {
  return { [resource]: currentLevel + 1 };
}

// --- Population (Imperator Rome-inspired, simplified) ---------------------

export type PopClass = "slaves" | "freemen" | "citizens" | "nobles";
export const POP_CLASSES: PopClass[] = ["slaves", "freemen", "citizens", "nobles"];
export type Population = Record<PopClass, number>;

export const POP_ICON: Record<PopClass, string> = {
  slaves: "⛓️",
  freemen: "🧑‍🌾",
  citizens: "🏺",
  nobles: "👑",
};
export const POP_LABEL: Record<PopClass, string> = {
  slaves: "Sklaven",
  freemen: "Freie",
  citizens: "Bürger",
  nobles: "Adel",
};
/** Bar color per class, used by the population bar on the tile. */
export const POP_COLOR: Record<PopClass, string> = {
  slaves: "#6b6b6b",
  freemen: "#8a9b6e",
  citizens: "#d8c98a",
  nobles: "#c9a53b",
};

/** Population capacity per tile development level (index = tile.level). */
export const POP_CAPACITY_BY_LEVEL = [0, 3, 5, 7];

/** Target share of total population each class trends toward as it grows. */
export const POP_TARGET_RATIO: Record<PopClass, number> = {
  slaves: 0.5,
  freemen: 0.3,
  citizens: 0.15,
  nobles: 0.05,
};

export function emptyPopulation(): Population {
  return { slaves: 0, freemen: 0, citizens: 0, nobles: 0 };
}

// --- Units ------------------------------------------------------------

export type UnitType = "militia" | "legionary" | "cavalry";
export const UNIT_TYPES: UnitType[] = ["militia", "legionary", "cavalry"];
export type Units = Record<UnitType, number>;

export const UNIT_ICON: Record<UnitType, string> = {
  militia: "🗡️",
  legionary: "🛡️",
  cavalry: "🐎",
};
export const UNIT_LABEL: Record<UnitType, string> = {
  militia: "Miliz",
  legionary: "Legionäre",
  cavalry: "Reiterei",
};
/** Combat die bonus (added to the 1-6 roll) — stronger troops fight better. */
export const UNIT_POWER: Record<UnitType, number> = { militia: 0, legionary: 1, cavalry: 2 };
/** Which pop class is consumed (1 per recruit) to raise this unit type. */
export const UNIT_SOURCE_CLASS: Record<UnitType, PopClass> = {
  militia: "freemen",
  legionary: "citizens",
  cavalry: "nobles",
};
export const UNIT_COST: Record<UnitType, Partial<Record<ResourceType, number>>> = {
  militia: { ore: 1 },
  legionary: { ore: 1, grain: 1 },
  cavalry: { ore: 2, grain: 1 },
};

export function emptyUnits(): Units {
  return { militia: 0, legionary: 0, cavalry: 0 };
}

export interface Tile {
  id: string;
  q: number;
  r: number;
  continentId: number;
  terrain: TerrainType;
  resource: ResourceType | null;
  ownerId: string | null;
  units: Units;
  population: Population;
  /** Development tier of the resource building on this tile: 0 = undeveloped, 1-3 = built up. */
  level: number;
  hasFort: boolean;
  /** The first territory placed by a player becomes their visible capital. */
  isCapital: boolean;
  /** River crossings on the six edges of this hex; neighbouring tiles share an edge. */
  riverEdges: number[];
  cityId: string | null;
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
  capitalId: string | null;
}

export type Phase =
  | "placement"
  | "bonus"
  | "build"
  | "attack"
  | "gameover";

export interface GameState {
  tiles: Record<string, Tile>;
  tileOrder: string[];
  continents: Continent[];
  players: Player[];
  currentPlayerIndex: number;
  phase: Phase;
  log: string[];
  bonusRemaining: number;
  winnerId: string | null;
  placementQueue: string[];
  placementIndex: number;
  hasAttackedThisTurn: boolean;
  cities: Record<string, City>;
  roadSegments: string[];
  roadPlan: RoadPlan | null;
}

export function emptyStock(): ResourceStock {
  return { wood: 0, stone: 0, marble: 0, grain: 0, olive: 0, wine: 0, ore: 0 };
}
