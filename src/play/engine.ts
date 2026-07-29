import { axialFromId, hexId, neighbors } from "./hex";
import { generateMap, type Rng } from "./mapgen";
import type { GameState, Player, PlayerKind, PopClass, ResourceStock, ResourceType, Tile, UnitType, Units } from "./types";
import {
  EXPAND_COST,
  FORT_COST,
  MAX_TILE_LEVEL,
  POP_CAPACITY_BY_LEVEL,
  POP_CLASSES,
  POP_TARGET_RATIO,
  UNIT_COST,
  UNIT_LABEL,
  UNIT_SOURCE_CLASS,
  UNIT_TYPES,
  UNIT_POWER,
  emptyStock,
  upgradeCost,
} from "./types";

export const PLAYER_COLORS = ["#d81e3f", "#2f6fed", "#2fa84f", "#e8a72f"];
export const STARTING_STOCK: Partial<Record<ResourceType, number>> = {
  wood: 2,
  stone: 2,
  olive: 1,
  grain: 1,
  ore: 1,
};
const ARMIES_PER_PLAYER_PLACEMENT = 3;

export interface PlayerConfig {
  name: string;
  kind: PlayerKind;
}

export function createGame(playerConfigs: PlayerConfig[], rng: Rng = Math.random): GameState {
  const { tiles, tileOrder, continents } = generateMap(rng);

  const players: Player[] = playerConfigs.map((cfg, i) => {
    const resources: ResourceStock = emptyStock();
    for (const [res, amt] of Object.entries(STARTING_STOCK)) {
      resources[res as ResourceType] = amt ?? 0;
    }
    return {
      id: `p${i}`,
      name: cfg.name,
      color: PLAYER_COLORS[i % PLAYER_COLORS.length],
      kind: cfg.kind,
      resources,
      alive: true,
    };
  });

  const placementQueue: string[] = [];
  for (let round = 0; round < ARMIES_PER_PLAYER_PLACEMENT; round++) {
    const order = round % 2 === 0 ? players.map((p) => p.id) : players.map((p) => p.id).reverse();
    placementQueue.push(...order);
  }

  return {
    tiles,
    tileOrder,
    continents,
    players,
    currentPlayerIndex: 0,
    phase: "placement",
    lastRoll: null,
    log: ["Platzierungsphase: jeder Spieler setzt 3 Truppen."],
    bonusRemaining: 0,
    winnerId: null,
    placementQueue,
    placementIndex: 0,
    hasAttackedThisTurn: false,
  };
}

export function currentPlayer(state: GameState): Player {
  return state.players[state.currentPlayerIndex];
}

export function getPlayer(state: GameState, id: string): Player {
  const p = state.players.find((pl) => pl.id === id);
  if (!p) throw new Error(`Unknown player ${id}`);
  return p;
}

export function neighborIds(state: GameState, tileId: string): string[] {
  const coord = axialFromId(tileId);
  return neighbors(coord)
    .map((n) => hexId(n.q, n.r))
    .filter((id) => id in state.tiles);
}

export function ownedTileIds(state: GameState, playerId: string): string[] {
  return state.tileOrder.filter((id) => state.tiles[id].ownerId === playerId);
}

export function totalUnits(tile: Tile): number {
  return UNIT_TYPES.reduce((sum, t) => sum + tile.units[t], 0);
}

export function totalPopulation(tile: Tile): number {
  return POP_CLASSES.reduce((sum, c) => sum + tile.population[c], 0);
}

function log(state: GameState, msg: string) {
  state.log.push(msg);
  if (state.log.length > 200) state.log.shift();
}

function canAfford(player: Player, cost: Partial<Record<ResourceType, number>>): boolean {
  return Object.entries(cost).every(([res, amt]) => player.resources[res as ResourceType] >= (amt ?? 0));
}

function pay(player: Player, cost: Partial<Record<ResourceType, number>>) {
  for (const [res, amt] of Object.entries(cost)) {
    player.resources[res as ResourceType] -= amt ?? 0;
  }
}

// --- Placement phase ---

export function placementCurrentPlayerId(state: GameState): string | null {
  if (state.phase !== "placement") return null;
  return state.placementQueue[state.placementIndex] ?? null;
}

export function placeInitialArmy(state: GameState, tileId: string): boolean {
  if (state.phase !== "placement") return false;
  const playerId = placementCurrentPlayerId(state);
  if (!playerId) return false;
  const tile = state.tiles[tileId];
  if (!tile || tile.ownerId !== null) return false;

  tile.ownerId = playerId;
  tile.units.militia += 1;
  if (tile.resource) {
    tile.level = 1;
    tile.population.slaves = 1;
  }
  log(state, `${getPlayer(state, playerId).name} platziert eine Truppe auf ${tileId}.`);
  state.placementIndex += 1;

  if (state.placementIndex >= state.placementQueue.length) {
    state.currentPlayerIndex = 0;
    beginTurn(state);
  }
  return true;
}

// --- Turn bonus (continent control) ---

function beginTurn(state: GameState) {
  const player = currentPlayer(state);
  const bonus = state.continents
    .filter((c) => c.tileIds.length > 0 && c.tileIds.every((id) => state.tiles[id].ownerId === player.id))
    .reduce((sum, c) => sum + c.bonus, 0);
  state.hasAttackedThisTurn = false;
  if (bonus > 0) {
    state.bonusRemaining = bonus;
    state.phase = "bonus";
    log(state, `${player.name} erhält ${bonus} Bonustruppe(n) für kontrollierte Kontinente.`);
  } else {
    state.bonusRemaining = 0;
    state.phase = "roll";
  }
}

export function placeBonusArmy(state: GameState, tileId: string): boolean {
  if (state.phase !== "bonus") return false;
  const player = currentPlayer(state);
  const tile = state.tiles[tileId];
  if (!tile || tile.ownerId !== player.id) return false;

  tile.units.militia += 1;
  state.bonusRemaining -= 1;
  if (state.bonusRemaining <= 0) {
    state.bonusRemaining = 0;
    state.phase = "roll";
  }
  return true;
}

// --- Population growth ---

/** Grows whichever pop class is furthest below its target share, if there's room. */
function growPopulation(tile: Tile): boolean {
  const cap = POP_CAPACITY_BY_LEVEL[tile.level] ?? 0;
  if (totalPopulation(tile) >= cap) return false;

  let bestClass: PopClass = "slaves";
  let bestDeficit = -Infinity;
  for (const cls of POP_CLASSES) {
    const deficit = POP_TARGET_RATIO[cls] * cap - tile.population[cls];
    if (deficit > bestDeficit) {
      bestDeficit = deficit;
      bestClass = cls;
    }
  }
  tile.population[bestClass] += 1;
  return true;
}

// --- Roll & production ---

export function rollDice(state: GameState, rng: Rng = Math.random): [number, number] | null {
  if (state.phase !== "roll") return null;
  const d1 = 1 + Math.floor(rng() * 6);
  const d2 = 1 + Math.floor(rng() * 6);
  const sum = d1 + d2;
  state.lastRoll = [d1, d2];

  if (sum === 7) {
    log(state, `Würfel: ${d1} + ${d2} = 7 — keine Produktion.`);
  } else {
    const gains = new Map<string, Partial<Record<ResourceType, number>>>();
    const matchedTiles: string[] = [];
    for (const id of state.tileOrder) {
      const tile = state.tiles[id];
      if (tile.number === sum && tile.ownerId && tile.resource && tile.level > 0) {
        matchedTiles.push(id);
        const output = tile.level + Math.floor(tile.population.slaves / 2);
        const g = gains.get(tile.ownerId) ?? {};
        g[tile.resource] = (g[tile.resource] ?? 0) + output;
        gains.set(tile.ownerId, g);
      }
    }
    for (const [playerId, g] of gains) {
      const player = getPlayer(state, playerId);
      const parts: string[] = [];
      for (const [res, amt] of Object.entries(g)) {
        player.resources[res as ResourceType] += amt ?? 0;
        parts.push(`${amt} ${res}`);
      }
      log(state, `Würfel: ${d1} + ${d2} = ${sum} — ${player.name} erhält ${parts.join(", ")}.`);
    }
    if (gains.size === 0) {
      log(state, `Würfel: ${d1} + ${d2} = ${sum} — keine Produktion.`);
    }

    const grown = new Map<string, number>();
    for (const id of matchedTiles) {
      const tile = state.tiles[id];
      const owner = getPlayer(state, tile.ownerId!);
      if (owner.resources.grain < 1) continue;
      if (growPopulation(tile)) {
        grown.set(owner.id, (grown.get(owner.id) ?? 0) + 1);
      }
    }
    for (const [playerId, count] of grown) {
      log(state, `${getPlayer(state, playerId).name}: Bevölkerung wächst in ${count} Gebiet(en).`);
    }
  }

  state.phase = "build";
  return [d1, d2];
}

// --- Build phase ---

export function canExpand(state: GameState, fromTileId: string, toTileId: string): boolean {
  if (state.phase !== "build") return false;
  const player = currentPlayer(state);
  const from = state.tiles[fromTileId];
  const to = state.tiles[toTileId];
  if (!from || !to) return false;
  if (from.ownerId !== player.id || to.ownerId !== null) return false;
  if (!neighborIds(state, fromTileId).includes(toTileId)) return false;
  return canAfford(player, EXPAND_COST);
}

export function expand(state: GameState, fromTileId: string, toTileId: string): boolean {
  if (!canExpand(state, fromTileId, toTileId)) return false;
  const player = currentPlayer(state);
  pay(player, EXPAND_COST);
  const to = state.tiles[toTileId];
  to.ownerId = player.id;
  to.units.militia = 1;
  if (to.resource) {
    to.level = 1;
    to.population.slaves = 1;
  }
  log(state, `${player.name} erschließt ${toTileId}.`);
  return true;
}

export function canUpgradeTile(state: GameState, tileId: string): boolean {
  if (state.phase !== "build") return false;
  const player = currentPlayer(state);
  const tile = state.tiles[tileId];
  if (!tile || tile.ownerId !== player.id || !tile.resource) return false;
  if (tile.level < 1 || tile.level >= MAX_TILE_LEVEL) return false;
  return canAfford(player, upgradeCost(tile.resource, tile.level));
}

export function upgradeTile(state: GameState, tileId: string): boolean {
  if (!canUpgradeTile(state, tileId)) return false;
  const player = currentPlayer(state);
  const tile = state.tiles[tileId];
  pay(player, upgradeCost(tile.resource!, tile.level));
  tile.level += 1;
  log(state, `${player.name} baut ${tileId} aus (Stufe ${tile.level}).`);
  return true;
}

export function canBuildFort(state: GameState, tileId: string): boolean {
  if (state.phase !== "build") return false;
  const player = currentPlayer(state);
  const tile = state.tiles[tileId];
  if (!tile || tile.ownerId !== player.id || tile.hasFort) return false;
  return canAfford(player, FORT_COST);
}

export function buildFort(state: GameState, tileId: string): boolean {
  if (!canBuildFort(state, tileId)) return false;
  const player = currentPlayer(state);
  pay(player, FORT_COST);
  state.tiles[tileId].hasFort = true;
  log(state, `${player.name} errichtet eine Burg auf ${tileId}.`);
  return true;
}

export function canRecruit(state: GameState, tileId: string, unitType: UnitType): boolean {
  if (state.phase !== "build") return false;
  const player = currentPlayer(state);
  const tile = state.tiles[tileId];
  if (!tile || tile.ownerId !== player.id) return false;
  if (tile.population[UNIT_SOURCE_CLASS[unitType]] < 1) return false;
  return canAfford(player, UNIT_COST[unitType]);
}

export function recruit(state: GameState, tileId: string, unitType: UnitType): boolean {
  if (!canRecruit(state, tileId, unitType)) return false;
  const player = currentPlayer(state);
  const tile = state.tiles[tileId];
  pay(player, UNIT_COST[unitType]);
  tile.population[UNIT_SOURCE_CLASS[unitType]] -= 1;
  tile.units[unitType] += 1;
  log(state, `${player.name} hebt ${UNIT_LABEL[unitType]} auf ${tileId} aus.`);
  return true;
}

export function goToAttackPhase(state: GameState): boolean {
  if (state.phase !== "build") return false;
  state.phase = "attack";
  return true;
}

// --- Attack phase ---

export function canAttack(state: GameState, fromTileId: string, toTileId: string): boolean {
  if (state.phase !== "attack") return false;
  const player = currentPlayer(state);
  const from = state.tiles[fromTileId];
  const to = state.tiles[toTileId];
  if (!from || !to) return false;
  if (from.ownerId !== player.id || totalUnits(from) < 2) return false;
  if (!to.ownerId || to.ownerId === player.id) return false;
  return neighborIds(state, fromTileId).includes(toTileId);
}

interface FightingUnit {
  type: UnitType;
  power: number;
}

/** All individual units in `units`, strongest (highest combat power) first. */
function fightingPool(units: Units): FightingUnit[] {
  const pool: FightingUnit[] = [];
  for (const t of UNIT_TYPES) {
    for (let i = 0; i < units[t]; i++) pool.push({ type: t, power: UNIT_POWER[t] });
  }
  return pool.sort((a, b) => b.power - a.power);
}

interface RolledDie {
  type: UnitType;
  roll: number;
}

/** Commits the strongest available units (up to `count`) and rolls their dice, best roll first. */
function rollFightingDice(units: Units, count: number, rng: Rng): RolledDie[] {
  const committed = fightingPool(units).slice(0, count);
  return committed
    .map((u) => ({ type: u.type, roll: 1 + Math.floor(rng() * 6) + u.power }))
    .sort((a, b) => b.roll - a.roll);
}

/** Removes up to `count` units (strongest first) from `units` in place; returns what was taken. */
function takeUnits(units: Units, count: number): Units {
  const taken: Units = { militia: 0, legionary: 0, cavalry: 0 };
  const pool = fightingPool(units);
  for (let i = 0; i < count && i < pool.length; i++) {
    units[pool[i].type] -= 1;
    taken[pool[i].type] += 1;
  }
  return taken;
}

export interface AttackOutcome {
  attackerRolls: RolledDie[];
  defenderRolls: RolledDie[];
  attackerLosses: number;
  defenderLosses: number;
  captured: boolean;
}

export function attack(state: GameState, fromTileId: string, toTileId: string, rng: Rng = Math.random): AttackOutcome | null {
  if (!canAttack(state, fromTileId, toTileId)) return null;
  const attacker = currentPlayer(state);
  const from = state.tiles[fromTileId];
  const to = state.tiles[toTileId];
  const defender = getPlayer(state, to.ownerId!);

  const attackerDiceCount = Math.min(totalUnits(from) - 1, 3);
  const defenderDiceCount = Math.min(totalUnits(to), to.hasFort ? 3 : 2);
  const attackerRolls = rollFightingDice(from.units, attackerDiceCount, rng);
  const defenderRolls = rollFightingDice(to.units, defenderDiceCount, rng);

  let attackerLosses = 0;
  let defenderLosses = 0;
  const pairs = Math.min(attackerRolls.length, defenderRolls.length);
  for (let i = 0; i < pairs; i++) {
    if (attackerRolls[i].roll > defenderRolls[i].roll) {
      to.units[defenderRolls[i].type] -= 1;
      defenderLosses++;
    } else {
      from.units[attackerRolls[i].type] -= 1;
      attackerLosses++;
    }
  }

  let captured = false;
  log(
    state,
    `${attacker.name} greift ${defender.name} von ${fromTileId} auf ${toTileId} an: ` +
      `[${attackerRolls.map((r) => r.roll).join(",")}] vs [${defenderRolls.map((r) => r.roll).join(",")}] — ` +
      `Angreifer verliert ${attackerLosses}, Verteidiger verliert ${defenderLosses}.`
  );

  if (totalUnits(to) <= 0) {
    captured = true;
    const moved = takeUnits(from.units, Math.max(1, Math.min(attackerDiceCount, totalUnits(from) - 1)));
    to.ownerId = attacker.id;
    to.units = moved;
    log(state, `${attacker.name} erobert ${toTileId}!`);

    if (ownedTileIds(state, defender.id).length === 0) {
      defender.alive = false;
      log(state, `${defender.name} wurde eliminiert.`);
    }
  }

  state.hasAttackedThisTurn = true;
  checkWinner(state);
  return { attackerRolls, defenderRolls, attackerLosses, defenderLosses, captured };
}

export function checkWinner(state: GameState): boolean {
  const alive = state.players.filter((p) => p.alive && ownedTileIds(state, p.id).length > 0);
  if (alive.length <= 1 && state.phase !== "placement") {
    const winner = alive[0] ?? state.players.find((p) => p.alive);
    if (winner) {
      state.winnerId = winner.id;
      state.phase = "gameover";
      log(state, `${winner.name} hat gewonnen!`);
      return true;
    }
  }
  return false;
}

// --- End turn ---

export function endTurn(state: GameState): boolean {
  if (state.phase === "placement" || state.phase === "gameover") return false;
  const alivePlayers = state.players.filter((p) => p.alive);
  if (alivePlayers.length <= 1) {
    checkWinner(state);
    return false;
  }
  let next = state.currentPlayerIndex;
  do {
    next = (next + 1) % state.players.length;
  } while (!state.players[next].alive);
  state.currentPlayerIndex = next;
  beginTurn(state);
  return true;
}
