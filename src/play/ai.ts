import {
  attack,
  buildFort,
  canAttack,
  canBuildFort,
  canExpand,
  canRecruit,
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
  recruit,
  totalUnits,
  upgradeTile,
} from "./engine";
import type { Rng } from "./mapgen";
import { UNIT_TYPES, type GameState, type UnitType } from "./types";

function strongestEnemyNeighborArmies(state: GameState, tileId: string, playerId: string): number {
  let max = 0;
  for (const nId of neighborIds(state, tileId)) {
    const n = state.tiles[nId];
    if (n.ownerId && n.ownerId !== playerId) max = Math.max(max, totalUnits(n));
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
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (owned.length === 0 && player?.capitalId) return placeInitialArmy(state, player.capitalId);
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
    const da = totalUnits(state.tiles[a]) - strongestEnemyNeighborArmies(state, a, playerId);
    const db = totalUnits(state.tiles[b]) - strongestEnemyNeighborArmies(state, b, playerId);
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
  return candidates.sort((a, b) => totalUnits(state.tiles[a]) - totalUnits(state.tiles[b]))[0];
}

/** Recruits the strongest unit type the tile's population and the player's purse allow. */
function bestRecruitMove(state: GameState, tileId: string): UnitType | null {
  const preference = [...UNIT_TYPES].reverse(); // cavalry, legionary, militia — strongest first
  return preference.find((t) => canRecruit(state, tileId, t)) ?? null;
}

function bestAttackMove(state: GameState, playerId: string): [string, string] | null {
  const owned = ownedTileIds(state, playerId).filter((id) => totalUnits(state.tiles[id]) >= 3);
  let best: [string, string] | null = null;
  let bestEdge = 0;
  for (const from of owned) {
    for (const to of neighborIds(state, from)) {
      if (!canAttack(state, from, to)) continue;
      const edge = totalUnits(state.tiles[from]) - totalUnits(state.tiles[to]);
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
    const recruitType = target ? bestRecruitMove(state, target) : null;
    if (target && recruitType) {
      recruit(state, target, recruitType);
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
