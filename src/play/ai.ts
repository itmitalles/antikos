import {
  attack,
  buildArmy,
  buildFort,
  canAttack,
  canBuildArmy,
  canBuildFort,
  canExpand,
  canUpgradeTile,
  currentPlayer,
  endTurn,
  expand,
  goToAttackPhase,
  neighborIds,
  ownedTileIds,
  placeBonusArmy,
  placementCurrentPlayerId,
  placeInitialArmy,
  rollDice,
  upgradeTile,
} from "./engine";
import type { Rng } from "./mapgen";
import type { GameState } from "./types";

function strongestEnemyNeighborArmies(state: GameState, tileId: string, playerId: string): number {
  let max = 0;
  for (const nId of neighborIds(state, tileId)) {
    const n = state.tiles[nId];
    if (n.ownerId && n.ownerId !== playerId) max = Math.max(max, n.armies);
  }
  return max;
}

function hasEnemyNeighbor(state: GameState, tileId: string, playerId: string): boolean {
  return neighborIds(state, tileId).some((nId) => {
    const n = state.tiles[nId];
    return n.ownerId && n.ownerId !== playerId;
  });
}

/** Runs one AI player's initial-placement pick. */
export function aiPlacementMove(state: GameState): boolean {
  const playerId = placementCurrentPlayerId(state);
  if (!playerId) return false;
  const owned = ownedTileIds(state, playerId);
  const free = state.tileOrder.filter((id) => state.tiles[id].ownerId === null);
  if (free.length === 0) return false;

  // Prefer a free tile adjacent to one we already own (consolidate a foothold);
  // otherwise pick a resource-rich tile at random.
  const adjacentToOwned = free.filter((id) => neighborIds(state, id).some((n) => owned.includes(n)));
  const pool = adjacentToOwned.length > 0 ? adjacentToOwned : free;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  return placeInitialArmy(state, pick);
}

function weakestBorderTile(state: GameState, playerId: string): string | null {
  const owned = ownedTileIds(state, playerId).filter((id) => hasEnemyNeighbor(state, id, playerId));
  if (owned.length === 0) return null;
  return owned.sort((a, b) => {
    const da = state.tiles[a].armies - strongestEnemyNeighborArmies(state, a, playerId);
    const db = state.tiles[b].armies - strongestEnemyNeighborArmies(state, b, playerId);
    return da - db;
  })[0];
}

function bestExpandMove(state: GameState, playerId: string): [string, string] | null {
  const owned = ownedTileIds(state, playerId);
  for (const from of owned) {
    for (const to of neighborIds(state, from)) {
      if (canExpand(state, from, to)) return [from, to];
    }
  }
  return null;
}

function bestUpgradeMove(state: GameState, playerId: string): string | null {
  const candidates = ownedTileIds(state, playerId)
    .filter((id) => canUpgradeTile(state, id))
    .sort((a, b) => state.tiles[a].level - state.tiles[b].level);
  return candidates[0] ?? null;
}

function bestFortMove(state: GameState, playerId: string): string | null {
  const candidates = ownedTileIds(state, playerId).filter(
    (id) => hasEnemyNeighbor(state, id, playerId) && canBuildFort(state, id)
  );
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => state.tiles[a].armies - state.tiles[b].armies)[0];
}

function bestAttackMove(state: GameState, playerId: string): [string, string] | null {
  const owned = ownedTileIds(state, playerId).filter((id) => state.tiles[id].armies >= 3);
  let best: [string, string] | null = null;
  let bestEdge = 0;
  for (const from of owned) {
    for (const to of neighborIds(state, from)) {
      if (!canAttack(state, from, to)) continue;
      const edge = state.tiles[from].armies - state.tiles[to].armies;
      if (edge > bestEdge) {
        bestEdge = edge;
        best = [from, to];
      }
    }
  }
  return best;
}

/** Runs a full AI turn (bonus placement through end-of-turn) synchronously. */
export function runAiTurn(state: GameState, rng: Rng = Math.random) {
  const player = currentPlayer(state);
  if (player.kind !== "ai") return;

  let guard = 0;
  while (state.phase === "bonus" && guard++ < 20) {
    const target = weakestBorderTile(state, player.id) ?? ownedTileIds(state, player.id)[0];
    if (!target) break;
    placeBonusArmy(state, target);
  }

  if (state.phase === "roll") {
    rollDice(state, rng);
  }

  guard = 0;
  while (state.phase === "build" && guard++ < 25) {
    const expandMove = bestExpandMove(state, player.id);
    if (expandMove) {
      expand(state, expandMove[0], expandMove[1]);
      continue;
    }
    const upgradeMove = bestUpgradeMove(state, player.id);
    if (upgradeMove) {
      upgradeTile(state, upgradeMove);
      continue;
    }
    const target = weakestBorderTile(state, player.id) ?? ownedTileIds(state, player.id)[0];
    if (target && canBuildArmy(state, target)) {
      buildArmy(state, target);
      continue;
    }
    const fortMove = bestFortMove(state, player.id);
    if (fortMove) {
      buildFort(state, fortMove);
      continue;
    }
    break;
  }
  if (state.phase === "build") goToAttackPhase(state);

  guard = 0;
  while (state.phase === "attack" && guard++ < 15) {
    const move = bestAttackMove(state, player.id);
    if (!move) break;
    attack(state, move[0], move[1], rng);
    if ((state.phase as string) === "gameover") break;
  }

  if (state.phase !== "gameover") endTurn(state);
}
