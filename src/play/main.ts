import { aiPlacementMove, runAiTurn } from "./ai";
import {
  attack,
  buildFort,
  canAttack,
  canBuildFort,
  canExpand,
  canRecruit,
  canUpgradeTile,
  createGame,
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
  rollDice,
  totalPopulation,
  totalUnits,
  upgradeTile,
  type PlayerConfig,
} from "./engine";
import { computeLayout, drawBoard, pixelToTileId, type Layout } from "./render";
import { PLAYER_COLORS } from "./engine";
import {
  BUILDING_NAMES,
  FORT_COST,
  MAX_TILE_LEVEL,
  POP_CLASSES,
  POP_ICON,
  POP_LABEL,
  RESOURCE_ICON,
  RESOURCE_LABEL,
  RESOURCE_TYPES,
  UNIT_COST,
  UNIT_ICON,
  UNIT_LABEL,
  UNIT_SOURCE_CLASS,
  UNIT_TYPES,
  upgradeCost,
  type ResourceType,
  type UnitType,
} from "./types";
import type { GameState } from "./types";

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const setupScreen = $("setup-screen");
const gameScreen = $("game-screen");
const playerRows = $("player-rows");
const playerCountSelect = $<HTMLSelectElement>("player-count");
const startButton = $<HTMLButtonElement>("start-button");

const canvas = $<HTMLCanvasElement>("board-canvas");
const ctx = canvas.getContext("2d")!;
const turnInfo = $("turn-info");
const diceDisplay = $("dice-display");
const resourcePanel = $("resource-panel");
const playersPanel = $("players-panel");
const logPanel = $("log-panel");
const hint = $("action-hint");
const tileInfo = $("tile-info");

const rollBtn = $<HTMLButtonElement>("action-roll");
const recruitBtns: Record<UnitType, HTMLButtonElement> = {
  militia: $<HTMLButtonElement>("action-recruit-militia"),
  legionary: $<HTMLButtonElement>("action-recruit-legionary"),
  cavalry: $<HTMLButtonElement>("action-recruit-cavalry"),
};
const upgradeBtn = $<HTMLButtonElement>("action-upgrade");
const fortBtn = $<HTMLButtonElement>("action-fort");
const endBuildBtn = $<HTMLButtonElement>("action-end-build");
const endTurnBtn = $<HTMLButtonElement>("action-end-turn");

const gameoverBanner = $("gameover-banner");
const winnerName = $("winner-name");
const restartButton = $<HTMLButtonElement>("restart-button");

let state: GameState;
let layout: Layout;
let selectedTileId: string | null = null;

function renderPlayerRows() {
  const count = Number(playerCountSelect.value);
  playerRows.innerHTML = "";
  for (let i = 0; i < count; i++) {
    const row = document.createElement("div");
    row.className = "player-row";
    row.style.setProperty("--pcolor", PLAYER_COLORS[i % PLAYER_COLORS.length]);
    row.innerHTML = `
      <span class="swatch"></span>
      <input type="text" value="Spieler ${i + 1}" maxlength="16" data-role="name" />
      <select data-role="kind">
        <option value="human" ${i === 0 ? "selected" : ""}>Mensch</option>
        <option value="ai" ${i === 0 ? "" : "selected"}>KI</option>
      </select>
    `;
    playerRows.appendChild(row);
  }
}
playerCountSelect.addEventListener("change", renderPlayerRows);
renderPlayerRows();

startButton.addEventListener("click", () => {
  const configs: PlayerConfig[] = Array.from(playerRows.querySelectorAll(".player-row")).map((row) => ({
    name: (row.querySelector('[data-role="name"]') as HTMLInputElement).value.trim() || "Spieler",
    kind: (row.querySelector('[data-role="kind"]') as HTMLSelectElement).value as "human" | "ai",
  }));
  startGame(configs);
});

restartButton.addEventListener("click", () => {
  gameScreen.classList.add("hidden");
  gameoverBanner.classList.add("hidden");
  setupScreen.classList.remove("hidden");
});

function startGame(configs: PlayerConfig[]) {
  state = createGame(configs, Math.random);
  layout = computeLayout();
  canvas.width = layout.width;
  canvas.height = layout.height;
  selectedTileId = null;
  setupScreen.classList.add("hidden");
  gameoverBanner.classList.add("hidden");
  gameScreen.classList.remove("hidden");
  render();
  advanceIfAi();
}

function legalTargets(): Set<string> {
  if (!selectedTileId) return new Set();
  if (state.phase === "build") {
    return new Set(neighborIds(state, selectedTileId).filter((id) => state.tiles[id].ownerId === null));
  }
  if (state.phase === "attack") {
    const me = currentPlayer(state).id;
    return new Set(
      neighborIds(state, selectedTileId).filter((id) => {
        const t = state.tiles[id];
        return t.ownerId && t.ownerId !== me;
      })
    );
  }
  return new Set();
}

function costLabel(cost: Partial<Record<ResourceType, number>>): string {
  return Object.entries(cost)
    .map(([res, amt]) => `${amt}${RESOURCE_ICON[res as ResourceType]}`)
    .join(" ");
}

function renderTileInfo() {
  if (!selectedTileId) {
    tileInfo.innerHTML = "";
    return;
  }
  const tile = state.tiles[selectedTileId];
  const owner = tile.ownerId ? state.players.find((p) => p.id === tile.ownerId) : null;
  const parts: string[] = [`<strong>${selectedTileId}</strong>`];
  if (tile.resource) {
    const name = tile.level > 0 ? BUILDING_NAMES[tile.resource][tile.level - 1] : RESOURCE_LABEL[tile.resource];
    parts.push(`${name}${tile.level > 0 ? ` (Stufe ${tile.level}/${MAX_TILE_LEVEL})` : ""}`);
  } else {
    parts.push("Ödland");
  }
  if (owner) parts.push(`Besitzer: ${owner.name}`);
  if (tile.hasFort) parts.push("🏰 befestigt");

  const lines = [parts.join(" · ")];

  const pop = totalPopulation(tile);
  if (pop > 0) {
    const popParts = POP_CLASSES.filter((c) => tile.population[c] > 0).map(
      (c) => `${POP_ICON[c]} ${tile.population[c]} ${POP_LABEL[c]}`
    );
    lines.push(`Bevölkerung (${pop}): ${popParts.join(", ")}`);
  }

  const units = totalUnits(tile);
  if (units > 0) {
    const unitParts = UNIT_TYPES.filter((t) => tile.units[t] > 0).map(
      (t) => `${UNIT_ICON[t]} ${tile.units[t]} ${UNIT_LABEL[t]}`
    );
    lines.push(`Truppen (${units}): ${unitParts.join(", ")}`);
  }

  tileInfo.innerHTML = lines.map((l) => `<div>${l}</div>`).join("");
}

function render() {
  drawBoard(ctx, state, layout, { selectedTileId, legalTargets: legalTargets() });

  if (state.phase === "gameover") {
    const winner = state.players.find((p) => p.id === state.winnerId);
    winnerName.textContent = winner ? winner.name : "?";
    winnerName.style.color = winner?.color ?? "#fff";
    gameoverBanner.classList.remove("hidden");
  } else {
    gameoverBanner.classList.add("hidden");
  }

  const player = currentPlayer(state);
  turnInfo.innerHTML = `<span class="dot" style="background:${player.color}"></span> ${player.name} — ${phaseLabel(state.phase)}`;

  diceDisplay.textContent = state.lastRoll ? `🎲 ${state.lastRoll[0]} + ${state.lastRoll[1]} = ${state.lastRoll[0] + state.lastRoll[1]}` : "";

  resourcePanel.innerHTML = RESOURCE_TYPES.map(
    (r) => `<span class="res">${RESOURCE_ICON[r]} ${player.resources[r]}</span>`
  ).join("");

  playersPanel.innerHTML = state.players
    .map((p) => {
      const tiles = ownedTileIds(state, p.id);
      const armies = tiles.reduce((s, id) => s + totalUnits(state.tiles[id]), 0);
      const dead = !p.alive && state.phase !== "placement";
      return `<div class="player-chip ${dead ? "dead" : ""}" style="--pcolor:${p.color}">
        <span class="swatch"></span>${p.name} · ${tiles.length} Gebiete · ${armies} Truppen${dead ? " · ausgeschieden" : ""}
      </div>`;
    })
    .join("");

  logPanel.innerHTML = state.log
    .slice(-40)
    .map((l) => `<div>${l}</div>`)
    .join("");
  logPanel.scrollTop = logPanel.scrollHeight;

  updateButtons();
  updateHint();
  renderTileInfo();
}

function phaseLabel(phase: GameState["phase"]): string {
  switch (phase) {
    case "placement": return "Platzierung";
    case "bonus": return `Bonusarmeen platzieren (${state.bonusRemaining} übrig)`;
    case "roll": return "Würfeln";
    case "build": return "Bauen";
    case "attack": return "Angriff";
    case "gameover": return "Spiel beendet";
  }
}

function updateHint() {
  const player = currentPlayer(state);
  const isHuman = player.kind === "human";
  if (!isHuman) {
    hint.textContent = `${player.name} (KI) ist am Zug …`;
    return;
  }
  switch (state.phase) {
    case "placement":
      hint.textContent = "Klicke ein freies Feld, um eine Armee zu platzieren.";
      break;
    case "bonus":
      hint.textContent = "Klicke ein eigenes Feld, um die Bonusarmee zu platzieren.";
      break;
    case "roll":
      hint.textContent = "Würfle, um Rohstoffe zu produzieren.";
      break;
    case "build":
      hint.textContent = selectedTileId
        ? "Feld ausgewählt: Truppen ausheben/ausbauen/Burg bauen, oder gelb markiertes Nachbarfeld für Erschließung klicken."
        : "Wähle ein eigenes Feld, um zu bauen, auszubauen oder Truppen auszuheben.";
      break;
    case "attack":
      hint.textContent = selectedTileId
        ? "Klicke ein gelb markiertes Gegnerfeld zum Angreifen."
        : "Wähle ein eigenes Feld mit ≥2 Truppen, um anzugreifen.";
      break;
    case "gameover":
      hint.textContent = "";
      break;
  }
}

function updateButtons() {
  const player = currentPlayer(state);
  const isHuman = player.kind === "human";
  const inBuild = isHuman && state.phase === "build";

  rollBtn.classList.toggle("hidden", !(isHuman && state.phase === "roll"));

  for (const unitType of UNIT_TYPES) {
    const btn = recruitBtns[unitType];
    btn.classList.toggle("hidden", !inBuild);
    btn.textContent = `${UNIT_LABEL[unitType]} ausheben (${costLabel(UNIT_COST[unitType])}, 1${POP_ICON[UNIT_SOURCE_CLASS[unitType]]})`;
    btn.disabled = !(selectedTileId && canRecruit(state, selectedTileId, unitType));
  }

  upgradeBtn.classList.toggle("hidden", !inBuild);
  const tile = selectedTileId ? state.tiles[selectedTileId] : null;
  if (inBuild && tile?.resource && tile.level > 0 && tile.level < MAX_TILE_LEVEL) {
    upgradeBtn.textContent = `Ausbauen (${costLabel(upgradeCost(tile.resource, tile.level))})`;
    upgradeBtn.disabled = !canUpgradeTile(state, selectedTileId!);
  } else {
    upgradeBtn.textContent = "Ausbauen";
    upgradeBtn.disabled = true;
  }

  fortBtn.classList.toggle("hidden", !inBuild);
  fortBtn.textContent = `Burg bauen (${costLabel(FORT_COST)})`;
  fortBtn.disabled = !(selectedTileId && canBuildFort(state, selectedTileId));

  endBuildBtn.classList.toggle("hidden", !inBuild);
  endTurnBtn.classList.toggle("hidden", !(isHuman && state.phase === "attack"));
}

rollBtn.addEventListener("click", () => {
  rollDice(state, Math.random);
  render();
});

for (const unitType of UNIT_TYPES) {
  recruitBtns[unitType].addEventListener("click", () => {
    if (selectedTileId) {
      recruit(state, selectedTileId, unitType);
      render();
    }
  });
}

upgradeBtn.addEventListener("click", () => {
  if (selectedTileId) {
    upgradeTile(state, selectedTileId);
    render();
  }
});

fortBtn.addEventListener("click", () => {
  if (selectedTileId) {
    buildFort(state, selectedTileId);
    render();
  }
});

endBuildBtn.addEventListener("click", () => {
  goToAttackPhase(state);
  selectedTileId = null;
  render();
});

endTurnBtn.addEventListener("click", () => {
  selectedTileId = null;
  endTurn(state);
  render();
  advanceIfAi();
});

canvas.addEventListener("click", (ev) => {
  const player = currentPlayer(state);
  if (player.kind !== "human") return;
  const rect = canvas.getBoundingClientRect();
  const x = ((ev.clientX - rect.left) / rect.width) * canvas.width;
  const y = ((ev.clientY - rect.top) / rect.height) * canvas.height;
  const tileId = pixelToTileId(x, y, layout, state);
  if (!tileId) return;
  handleTileClick(tileId);
});

function handleTileClick(tileId: string) {
  const tile = state.tiles[tileId];
  const me = currentPlayer(state).id;

  if (state.phase === "placement") {
    if (placementCurrentPlayerId(state) === me) {
      if (placeInitialArmy(state, tileId)) {
        render();
        advanceIfAi();
      }
    }
    return;
  }

  if (state.phase === "bonus") {
    if (placeBonusArmy(state, tileId)) render();
    return;
  }

  if (state.phase === "build") {
    if (selectedTileId && canExpand(state, selectedTileId, tileId)) {
      expand(state, selectedTileId, tileId);
      selectedTileId = tileId;
      render();
      return;
    }
    if (tile.ownerId === me) {
      selectedTileId = tileId;
      render();
    }
    return;
  }

  if (state.phase === "attack") {
    if (selectedTileId && canAttack(state, selectedTileId, tileId)) {
      const from = state.tiles[selectedTileId];
      attack(state, selectedTileId, tileId, Math.random);
      if (totalUnits(from) < 2 || from.ownerId !== me) {
        selectedTileId = null;
      }
      render();
      return;
    }
    if (tile.ownerId === me && totalUnits(tile) >= 2) {
      selectedTileId = tileId;
      render();
    }
    return;
  }
}

function advanceIfAi() {
  if (state.phase === "gameover") {
    render();
    return;
  }
  if (state.phase === "placement") {
    const pid = placementCurrentPlayerId(state);
    const player = state.players.find((p) => p.id === pid);
    if (player && player.kind === "ai") {
      aiPlacementMove(state);
      render();
      setTimeout(advanceIfAi, 250);
    }
    return;
  }
  const player = currentPlayer(state);
  if (player.kind === "ai") {
    runAiTurn(state, Math.random);
    selectedTileId = null;
    render();
    setTimeout(advanceIfAi, 450);
  }
}
