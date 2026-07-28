import { axialFromId, hexId, neighbors } from "./hex";
import { generateMap, type Rng } from "./mapgen";
import type { GameState, Player, PlayerKind, ResourceStock, ResourceType } from "./types";
import { ARMY_COST, EXPAND_COST, FORT_COST, MAX_TILE_LEVEL, emptyStock, upgradeCost } from "./types";

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
    log: ["Platzierungsphase: jeder Spieler setzt 3 Armeen."],
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
  tile.armies += 1;
  if (tile.resource) tile.level = 1;
  log(state, `${getPlayer(state, playerId).name} platziert eine Armee auf ${tileId}.`);
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
    log(state, `${player.name} erhält ${bonus} Bonusarmee(n) für kontrollierte Kontinente.`);
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

  tile.armies += 1;
  state.bonusRemaining -= 1;
  if (state.bonusRemaining <= 0) {
    state.bonusRemaining = 0;
    state.phase = "roll";
  }
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
    for (const id of state.tileOrder) {
      const tile = state.tiles[id];
      if (tile.number === sum && tile.ownerId && tile.resource && tile.level > 0) {
        const g = gains.get(tile.ownerId) ?? {};
        g[tile.resource] = (g[tile.resource] ?? 0) + tile.level;
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
  }

  state.phase = "build";
  return [d1, d2];
}

// --- Build phase ---

export function buildCost(kind: "army" | "expand"): Partial<Record<ResourceType, number>> {
  return kind === "army" ? ARMY_COST : EXPAND_COST;
}

export function canBuildArmy(state: GameState, tileId: string): boolean {
  if (state.phase !== "build") return false;
  const player = currentPlayer(state);
  const tile = state.tiles[tileId];
  return !!tile && tile.ownerId === player.id && canAfford(player, ARMY_COST);
}

export function buildArmy(state: GameState, tileId: string): boolean {
  if (!canBuildArmy(state, tileId)) return false;
  const player = currentPlayer(state);
  pay(player, ARMY_COST);
  state.tiles[tileId].armies += 1;
  log(state, `${player.name} baut eine Armee auf ${tileId}.`);
  return true;
}

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
  to.armies = 1;
  if (to.resource) to.level = 1;
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
  if (from.ownerId !== player.id || from.armies < 2) return false;
  if (!to.ownerId || to.ownerId === player.id) return false;
  return neighborIds(state, fromTileId).includes(toTileId);
}

function rollDiceDesc(count: number, rng: Rng): number[] {
  const rolls = Array.from({ length: count }, () => 1 + Math.floor(rng() * 6));
  return rolls.sort((a, b) => b - a);
}

export interface AttackOutcome {
  attackerDice: number[];
  defenderDice: number[];
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

  const attackerDiceCount = Math.min(from.armies - 1, 3);
  const defenderDiceCount = Math.min(to.armies, to.hasFort ? 3 : 2);
  const attackerDice = rollDiceDesc(attackerDiceCount, rng);
  const defenderDice = rollDiceDesc(defenderDiceCount, rng);

  let attackerLosses = 0;
  let defenderLosses = 0;
  const pairs = Math.min(attackerDice.length, defenderDice.length);
  for (let i = 0; i < pairs; i++) {
    if (attackerDice[i] > defenderDice[i]) defenderLosses++;
    else attackerLosses++;
  }

  from.armies -= attackerLosses;
  to.armies -= defenderLosses;

  let captured = false;
  log(
    state,
    `${attacker.name} greift ${defender.name} von ${fromTileId} auf ${toTileId} an: ` +
      `[${attackerDice.join(",")}] vs [${defenderDice.join(",")}] — ` +
      `Angreifer verliert ${attackerLosses}, Verteidiger verliert ${defenderLosses}.`
  );

  if (to.armies <= 0) {
    captured = true;
    const moved = Math.max(1, Math.min(attackerDiceCount, from.armies - 1));
    from.armies -= moved;
    to.ownerId = attacker.id;
    to.armies = moved;
    log(state, `${attacker.name} erobert ${toTileId}!`);

    if (ownedTileIds(state, defender.id).length === 0) {
      defender.alive = false;
      log(state, `${defender.name} wurde eliminiert.`);
    }
  }

  state.hasAttackedThisTurn = true;
  checkWinner(state);
  return { attackerDice, defenderDice, attackerLosses, defenderLosses, captured };
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
