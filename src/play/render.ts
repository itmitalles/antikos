import { axialToPixel, hexCorners, pixelToAxial, hexId, hexagonBoard } from "./hex";
import { BOARD_RADIUS } from "./mapgen";
import { RESOURCE_ICON } from "./types";
import type { GameState } from "./types";

export const HEX_SIZE = 38;

export interface Layout {
  size: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}

export function computeLayout(size: number = HEX_SIZE): Layout {
  const coords = hexagonBoard(BOARD_RADIUS);
  const pts = coords.map((c) => axialToPixel(c, size));
  const minX = Math.min(...pts.map((p) => p.x)) - size;
  const maxX = Math.max(...pts.map((p) => p.x)) + size;
  const minY = Math.min(...pts.map((p) => p.y)) - size;
  const maxY = Math.max(...pts.map((p) => p.y)) + size;
  return {
    size,
    offsetX: -minX,
    offsetY: -minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

export function tileCenter(tileId: string, layout: Layout): { x: number; y: number } {
  const [q, r] = tileId.split(",").map(Number);
  const p = axialToPixel({ q, r }, layout.size);
  return { x: p.x + layout.offsetX, y: p.y + layout.offsetY };
}

export function pixelToTileId(x: number, y: number, layout: Layout, state: GameState): string | null {
  const a = pixelToAxial(x - layout.offsetX, y - layout.offsetY, layout.size);
  const id = hexId(a.q, a.r);
  return id in state.tiles ? id : null;
}

export interface DrawOptions {
  selectedTileId?: string | null;
  legalTargets?: Set<string>;
}

export function drawBoard(ctx: CanvasRenderingContext2D, state: GameState, layout: Layout, opts: DrawOptions = {}) {
  const { width, height } = layout;
  ctx.clearRect(0, 0, width, height);

  const continentById = new Map(state.continents.map((c) => [c.id, c]));

  for (const id of state.tileOrder) {
    const tile = state.tiles[id];
    const { x: cx, y: cy } = tileCenter(id, layout);
    const corners = hexCorners(cx, cy, layout.size - 1.5);
    const continent = continentById.get(tile.continentId);
    const owner = tile.ownerId ? state.players.find((p) => p.id === tile.ownerId) : null;

    ctx.beginPath();
    corners.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.closePath();

    // Base fill: continent wash, or slate for wasteland.
    ctx.fillStyle = tile.resource === null ? "#3a3a3f" : (continent?.color ?? "#444") + "55";
    ctx.fill();

    // Owner overlay tint.
    if (owner) {
      ctx.fillStyle = owner.color + "77";
      ctx.fill();
    }

    // Selection / legal-target highlight.
    if (opts.selectedTileId === id) {
      ctx.lineWidth = 4;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();
    } else if (opts.legalTargets?.has(id)) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#ffe066";
      ctx.stroke();
    } else {
      ctx.lineWidth = 1;
      ctx.strokeStyle = "#00000055";
      ctx.stroke();
    }

    // Resource icon + number token.
    if (tile.resource) {
      ctx.font = `${Math.round(layout.size * 0.5)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#fff";
      ctx.fillText(RESOURCE_ICON[tile.resource], cx, cy - layout.size * 0.32);
    }
    if (tile.number !== null) {
      ctx.beginPath();
      ctx.arc(cx, cy - layout.size * 0.02, layout.size * 0.22, 0, Math.PI * 2);
      ctx.fillStyle = tile.number === 6 || tile.number === 8 ? "#ffe066" : "#f4f1ea";
      ctx.fill();
      ctx.fillStyle = "#1a1a1a";
      ctx.font = `bold ${Math.round(layout.size * 0.26)}px sans-serif`;
      ctx.fillText(String(tile.number), cx, cy - layout.size * 0.02);
    }

    // Army badge.
    if (tile.armies > 0) {
      ctx.beginPath();
      ctx.arc(cx, cy + layout.size * 0.42, layout.size * 0.26, 0, Math.PI * 2);
      ctx.fillStyle = owner ? owner.color : "#888";
      ctx.fill();
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.font = `bold ${Math.round(layout.size * 0.3)}px sans-serif`;
      ctx.fillText(String(tile.armies), cx, cy + layout.size * 0.42);
    }
  }
}
