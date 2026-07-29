import { axialToPixel, hexCorners, pixelToAxial, hexId, hexagonBoard } from "./hex";
import { BOARD_RADIUS } from "./mapgen";
import { POP_CLASSES, POP_COLOR, UNIT_TYPES, type GameState, type ResourceType, type Tile } from "./types";

function tileTotalUnits(tile: Tile): number {
  return UNIT_TYPES.reduce((sum, t) => sum + tile.units[t], 0);
}

function tileTotalPopulation(tile: Tile): number {
  return POP_CLASSES.reduce((sum, c) => sum + tile.population[c], 0);
}

export const HEX_SIZE = 44;

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

// --- Terrain palettes -----------------------------------------------------

interface TerrainPalette {
  from: string;
  to: string;
  accent: string;
}

const TERRAIN: Record<ResourceType, TerrainPalette> = {
  wood: { from: "#1f4d34", to: "#2f6b46", accent: "#193f2a" },
  stone: { from: "#6b6558", to: "#8a8375", accent: "#524d43" },
  marble: { from: "#d8d3c6", to: "#efeade", accent: "#b9b2a0" },
  grain: { from: "#b98e2f", to: "#dcae42", accent: "#8a6a22" },
  olive: { from: "#7c8a5a", to: "#95a170", accent: "#5f6f45" },
  wine: { from: "#5a2438", to: "#7a3350", accent: "#3a1b2c" },
  ore: { from: "#3c4652", to: "#5b6672", accent: "#262d35" },
};
const WASTELAND_PALETTE: TerrainPalette = { from: "#6e6255", to: "#8a7c68", accent: "#4a4038" };

/** Building wall/roof material per resource, used by the settlement icon. */
const BUILD_MATERIAL: Record<ResourceType, { wall: string; roof: string }> = {
  wood: { wall: "#6b4a2c", roof: "#8a5a34" },
  stone: { wall: "#8f897c", roof: "#6b6559" },
  marble: { wall: "#efeade", roof: "#c9c2b0" },
  grain: { wall: "#a97b3a", roof: "#c99a4a" },
  olive: { wall: "#a97b3a", roof: "#b5502f" },
  wine: { wall: "#a97b3a", roof: "#8a3a30" },
  ore: { wall: "#4a4038", roof: "#3a332c" },
};

function hexPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
  const corners = hexCorners(cx, cy, size);
  ctx.beginPath();
  corners.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
}

function drawTerrainFill(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, palette: TerrainPalette) {
  const grad = ctx.createLinearGradient(cx, cy - size, cx, cy + size);
  grad.addColorStop(0, palette.to);
  grad.addColorStop(1, palette.from);
  hexPath(ctx, cx, cy, size);
  ctx.fillStyle = grad;
  ctx.fill();
}

// --- Small decorative primitives ------------------------------------------

function tree(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, canopy: string, trunk: string) {
  ctx.fillStyle = trunk;
  ctx.fillRect(x - s * 0.06, y, s * 0.12, s * 0.35);
  ctx.beginPath();
  ctx.arc(x, y - s * 0.05, s * 0.32, 0, Math.PI * 2);
  ctx.fillStyle = canopy;
  ctx.fill();
}

function rockCluster(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string) {
  ctx.fillStyle = color;
  for (const [dx, dy, r] of [[-0.3, 0, 0.34], [0.15, 0.08, 0.28], [0.35, -0.1, 0.2]] as [number, number, number][]) {
    ctx.beginPath();
    ctx.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2);
    ctx.fill();
  }
}

function cropRows(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, s * 0.05);
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.55, cy + i * s * 0.16);
    ctx.lineTo(cx + s * 0.55, cy + i * s * 0.16 + s * 0.06);
    ctx.stroke();
  }
}

function vineRows(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, leaf: string, grape: string) {
  for (let row = -1; row <= 1; row++) {
    const y = cy + row * s * 0.32;
    ctx.strokeStyle = "#3a2a20";
    ctx.lineWidth = Math.max(1, s * 0.04);
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.5, y);
    ctx.lineTo(cx + s * 0.5, y);
    ctx.stroke();
    for (let i = -2; i <= 2; i++) {
      const x = cx + i * s * 0.2;
      ctx.fillStyle = leaf;
      ctx.beginPath();
      ctx.arc(x, y - s * 0.06, s * 0.09, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = grape;
      ctx.beginPath();
      ctx.arc(x, y + s * 0.07, s * 0.06, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
}

function marbleVeins(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, s * 0.04);
  for (const [ax, ay, bx, by] of [[-0.4, -0.3, 0.1, 0.2], [0.3, -0.4, -0.1, 0.35], [-0.2, 0.05, 0.4, -0.15]]) {
    ctx.beginPath();
    ctx.moveTo(cx + ax * s, cy + ay * s);
    ctx.lineTo(cx + bx * s, cy + by * s);
    ctx.stroke();
  }
}

function orePeaks(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, dark: string, glint: string) {
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.5, cy + s * 0.35);
  ctx.lineTo(cx - s * 0.1, cy - s * 0.35);
  ctx.lineTo(cx + s * 0.25, cy + s * 0.05);
  ctx.lineTo(cx + s * 0.55, cy - s * 0.2);
  ctx.lineTo(cx + s * 0.55, cy + s * 0.35);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = glint;
  ctx.beginPath();
  ctx.arc(cx + s * 0.3, cy, s * 0.05, 0, Math.PI * 2);
  ctx.fill();
}

function cracks(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, s * 0.035);
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.4, cy - s * 0.1);
  ctx.lineTo(cx - s * 0.1, cy + s * 0.15);
  ctx.lineTo(cx + s * 0.1, cy - s * 0.05);
  ctx.lineTo(cx + s * 0.4, cy + s * 0.3);
  ctx.stroke();
}

function drawTerrainDetail(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, resource: ResourceType | null) {
  if (resource === null) {
    cracks(ctx, cx, cy, size, WASTELAND_PALETTE.accent);
    return;
  }
  const p = TERRAIN[resource];
  switch (resource) {
    case "wood":
      tree(ctx, cx - size * 0.22, cy - size * 0.05, size, p.to, "#4a2f1c");
      tree(ctx, cx + size * 0.18, cy + size * 0.12, size * 0.8, p.accent, "#4a2f1c");
      break;
    case "stone":
      rockCluster(ctx, cx, cy, size, p.accent);
      break;
    case "marble":
      marbleVeins(ctx, cx, cy, size, p.accent);
      break;
    case "grain":
      cropRows(ctx, cx, cy, size, p.accent);
      break;
    case "olive":
      tree(ctx, cx - size * 0.2, cy - size * 0.02, size * 0.85, "#6f7a52", "#5a4028");
      tree(ctx, cx + size * 0.22, cy + size * 0.08, size * 0.7, "#7c8a5a", "#5a4028");
      break;
    case "wine":
      vineRows(ctx, cx, cy, size, "#5c8a4e", "#c23b6b");
      break;
    case "ore":
      orePeaks(ctx, cx, cy, size, p.accent, "#cfd8df");
      break;
  }
}

// --- Settlement (building) icon, shared across resources -----------------

function drawFlag(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, color: string) {
  ctx.strokeStyle = "#2a2a2a";
  ctx.lineWidth = Math.max(1, h * 0.08);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - h);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - h);
  ctx.lineTo(x + h * 0.7, y - h * 0.8);
  ctx.lineTo(x, y - h * 0.6);
  ctx.closePath();
  ctx.fill();
}

/** Light+dark double stroke so building silhouettes read against any terrain color. */
function haloStroke(ctx: CanvasRenderingContext2D, width: number) {
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = width * 2.2;
  ctx.stroke();
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.lineWidth = width;
  ctx.stroke();
}

function hut(ctx: CanvasRenderingContext2D, cx: number, baseY: number, w: number, h: number, wall: string, roof: string) {
  ctx.beginPath();
  ctx.rect(cx - w / 2, baseY - h * 0.55, w, h * 0.55);
  ctx.fillStyle = wall;
  ctx.fill();
  haloStroke(ctx, Math.max(1, w * 0.06));

  ctx.beginPath();
  ctx.moveTo(cx - w / 2 - w * 0.12, baseY - h * 0.55);
  ctx.lineTo(cx, baseY - h);
  ctx.lineTo(cx + w / 2 + w * 0.12, baseY - h * 0.55);
  ctx.closePath();
  ctx.fillStyle = roof;
  ctx.fill();
  haloStroke(ctx, Math.max(1, w * 0.06));
}

function drawSettlement(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  level: number,
  resource: ResourceType,
  ownerColor: string
) {
  const mat = BUILD_MATERIAL[resource];
  const baseY = cy + size * 0.3;

  if (level >= 3) {
    hut(ctx, cx - size * 0.32, baseY, size * 0.28, size * 0.42, mat.wall, mat.roof);
    hut(ctx, cx + size * 0.32, baseY, size * 0.28, size * 0.42, mat.wall, mat.roof);
    hut(ctx, cx, baseY + size * 0.02, size * 0.5, size * 0.7, mat.wall, mat.roof);
    drawResourceLandmark(ctx, cx, cy - size * 0.28, size, resource, mat);
  } else if (level === 2) {
    hut(ctx, cx - size * 0.2, baseY, size * 0.3, size * 0.45, mat.wall, mat.roof);
    hut(ctx, cx + size * 0.22, baseY - size * 0.03, size * 0.34, size * 0.55, mat.wall, mat.roof);
  } else {
    hut(ctx, cx, baseY, size * 0.4, size * 0.55, mat.wall, mat.roof);
  }

  drawFlag(ctx, cx, baseY - size * (level >= 3 ? 0.95 : level === 2 ? 0.65 : 0.55), size * 0.32, ownerColor);
}

/** A small extra silhouette on top of the level-3 building to signal its resource specialty. */
function drawResourceLandmark(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  resource: ResourceType,
  mat: { wall: string; roof: string }
) {
  ctx.fillStyle = mat.wall;
  switch (resource) {
    case "marble":
      for (let i = -1; i <= 1; i++) {
        ctx.fillRect(cx + i * size * 0.16 - size * 0.02, cy, size * 0.04, size * 0.22);
      }
      ctx.fillStyle = mat.roof;
      ctx.beginPath();
      ctx.moveTo(cx - size * 0.22, cy);
      ctx.lineTo(cx, cy - size * 0.16);
      ctx.lineTo(cx + size * 0.22, cy);
      ctx.closePath();
      ctx.fill();
      break;
    case "grain":
      ctx.beginPath();
      ctx.arc(cx, cy + size * 0.05, size * 0.13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = mat.roof;
      ctx.beginPath();
      ctx.arc(cx, cy - size * 0.06, size * 0.1, Math.PI, 0);
      ctx.fill();
      break;
    case "ore":
      ctx.fillRect(cx - size * 0.03, cy - size * 0.15, size * 0.06, size * 0.3);
      ctx.fillRect(cx - size * 0.16, cy - size * 0.15, size * 0.06, size * 0.3);
      ctx.fillRect(cx + size * 0.1, cy - size * 0.15, size * 0.06, size * 0.3);
      ctx.strokeStyle = mat.wall;
      ctx.lineWidth = size * 0.05;
      ctx.beginPath();
      ctx.moveTo(cx - size * 0.16, cy - size * 0.15);
      ctx.lineTo(cx + size * 0.16, cy - size * 0.15);
      ctx.stroke();
      break;
    case "wine":
    case "olive":
      ctx.strokeStyle = mat.wall;
      ctx.lineWidth = size * 0.04;
      ctx.beginPath();
      ctx.arc(cx, cy, size * 0.14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - size * 0.1, cy - size * 0.1);
      ctx.lineTo(cx + size * 0.1, cy + size * 0.1);
      ctx.moveTo(cx + size * 0.1, cy - size * 0.1);
      ctx.lineTo(cx - size * 0.1, cy + size * 0.1);
      ctx.stroke();
      break;
    case "wood":
      ctx.beginPath();
      ctx.arc(cx, cy, size * 0.13, 0, Math.PI * 2);
      ctx.fillStyle = mat.roof;
      ctx.fill();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * size * 0.2, cy + Math.sin(a) * size * 0.2);
        ctx.strokeStyle = mat.wall;
        ctx.lineWidth = size * 0.03;
        ctx.stroke();
      }
      break;
    case "stone":
      ctx.fillRect(cx - size * 0.18, cy - size * 0.1, size * 0.14, size * 0.14);
      ctx.fillRect(cx + size * 0.04, cy - size * 0.16, size * 0.14, size * 0.2);
      break;
  }
}

function drawFort(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, ownerColor: string) {
  const x = cx + size * 0.48;
  const y = cy - size * 0.5;
  const w = size * 0.36;
  const h = size * 0.34;
  ctx.beginPath();
  ctx.rect(x - w / 2, y, w, h);
  ctx.fillStyle = "#5b5b5b";
  ctx.fill();
  haloStroke(ctx, size * 0.025);
  ctx.fillStyle = "#4a4a4a";
  const crenels = 3;
  const cw = w / (crenels * 2);
  for (let i = 0; i < crenels; i++) {
    ctx.fillRect(x - w / 2 + i * cw * 2, y - cw, cw, cw);
  }
  drawFlag(ctx, x, y - cw, size * 0.22, ownerColor);
}

// --- Number token & army badge --------------------------------------------

function drawNumberToken(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, num: number) {
  const x = cx - size * 0.62;
  const y = cy - size * 0.62;
  const r = size * 0.24;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = num === 6 || num === 8 ? "#f2c94c" : "#f1ead9";
  ctx.fill();
  ctx.strokeStyle = "#00000033";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = "#241f14";
  ctx.font = `bold ${Math.round(size * 0.26)}px Georgia, serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(num), x, y + size * 0.01);
}

function drawArmyBadge(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, armies: number, color: string) {
  const x = cx;
  const y = cy + size * 0.68;
  const w = size * 0.4;
  const h = size * 0.36;
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y - h / 2);
  ctx.lineTo(x + w / 2, y - h / 2);
  ctx.lineTo(x + w / 2, y + h * 0.15);
  ctx.lineTo(x, y + h / 2);
  ctx.lineTo(x - w / 2, y + h * 0.15);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = "#00000066";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.font = `bold ${Math.round(size * 0.28)}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(armies), x, y + size * 0.01);
}

function drawPopulationBar(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, tile: Tile) {
  const total = tileTotalPopulation(tile);
  if (total === 0) return;
  const y = cy + size * 0.4;
  const w = size * 0.66;
  const h = Math.max(2, size * 0.08);
  let x = cx - w / 2;
  ctx.strokeStyle = "#00000055";
  ctx.lineWidth = 1;
  ctx.strokeRect(cx - w / 2 - 0.5, y - 0.5, w + 1, h + 1);
  for (const cls of POP_CLASSES) {
    const count = tile.population[cls];
    if (count === 0) continue;
    const segW = (count / total) * w;
    ctx.fillStyle = POP_COLOR[cls];
    ctx.fillRect(x, y, segW, h);
    x += segW;
  }
}

// --- Main draw --------------------------------------------------------

export interface DrawOptions {
  selectedTileId?: string | null;
  legalTargets?: Set<string>;
}

function drawTile(ctx: CanvasRenderingContext2D, state: GameState, tile: Tile, layout: Layout, opts: DrawOptions) {
  const { x: cx, y: cy } = tileCenter(tile.id, layout);
  const size = layout.size - 1.5;
  const continent = state.continents.find((c) => c.id === tile.continentId);
  const owner = tile.ownerId ? state.players.find((p) => p.id === tile.ownerId) : null;
  const palette = tile.resource ? TERRAIN[tile.resource] : WASTELAND_PALETTE;

  hexPath(ctx, cx, cy, size);
  ctx.save();
  ctx.clip();
  drawTerrainFill(ctx, cx, cy, size, palette);
  drawTerrainDetail(ctx, cx, cy, size, tile.resource);
  if (owner && tile.level > 0 && tile.resource) {
    drawSettlement(ctx, cx, cy, size, tile.level, tile.resource, owner.color);
  }
  if (tile.hasFort && owner) {
    drawFort(ctx, cx, cy, size, owner.color);
  }
  ctx.restore();

  // Continent border (subtle, under selection/owner rings).
  hexPath(ctx, cx, cy, size);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = (continent?.color ?? "#444") + "99";
  ctx.stroke();

  // Ownership ring.
  if (owner) {
    hexPath(ctx, cx, cy, size - 3);
    ctx.lineWidth = 3;
    ctx.strokeStyle = owner.color;
    ctx.stroke();
  }

  // Selection / legal-target highlight.
  if (opts.selectedTileId === tile.id) {
    hexPath(ctx, cx, cy, size);
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
  } else if (opts.legalTargets?.has(tile.id)) {
    hexPath(ctx, cx, cy, size);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#ffe066";
    ctx.stroke();
  }

  if (tile.number !== null) {
    drawNumberToken(ctx, cx, cy, size, tile.number);
  }
  if (owner) {
    drawPopulationBar(ctx, cx, cy, size, tile);
  }
  const units = tileTotalUnits(tile);
  if (units > 0) {
    drawArmyBadge(ctx, cx, cy, size, units, owner?.color ?? "#888");
  }
}

export function drawBoard(ctx: CanvasRenderingContext2D, state: GameState, layout: Layout, opts: DrawOptions = {}) {
  ctx.clearRect(0, 0, layout.width, layout.height);
  for (const id of state.tileOrder) {
    drawTile(ctx, state, state.tiles[id], layout, opts);
  }
}
