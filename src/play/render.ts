import { AXIAL_DIRECTIONS, axialFromId, axialToPixel, hexCorners, pixelToAxial, hexId, hexagonBoard } from "./hex";
import { BOARD_RADIUS } from "./mapgen";
import { POP_CLASSES, POP_COLOR, UNIT_TYPES, type City, type CityBuilding, type GameState, type ResourceType, type TerrainType, type Tile } from "./types";
import { roadKey } from "./engine";

function tileTotalUnits(tile: Tile): number {
  return UNIT_TYPES.reduce((sum, t) => sum + tile.units[t], 0);
}

function tileTotalPopulation(tile: Tile): number {
  return POP_CLASSES.reduce((sum, c) => sum + tile.population[c], 0);
}

export const HEX_SIZE = 44;
/**
 * Orthographic 3/4 camera.  Keeping this in the renderer (rather than using a
 * CSS perspective transform) preserves one reliable coordinate space for
 * drawing, panning and hex hit-testing.
 */
export const ISO_Y_SCALE = 0.68;
const HEX_PLATE_DEPTH = 18;

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
    height: (maxY - minY + HEX_PLATE_DEPTH) * ISO_Y_SCALE,
  };
}

export function tileCenter(tileId: string, layout: Layout): { x: number; y: number } {
  const [q, r] = tileId.split(",").map(Number);
  const p = axialToPixel({ q, r }, layout.size);
  return { x: p.x + layout.offsetX, y: p.y + layout.offsetY };
}

export function pixelToTileId(x: number, y: number, layout: Layout, state: GameState): string | null {
  const a = pixelToAxial(x - layout.offsetX, y / ISO_Y_SCALE - layout.offsetY, layout.size);
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
const TERRAIN_GROUND: Record<TerrainType, TerrainPalette> = {
  plains: { from: "#72934f", to: "#a8bd69", accent: "#526d3b" },
  forest: { from: "#315f48", to: "#5f9861", accent: "#244532" },
  hills: { from: "#8d865c", to: "#b4aa76", accent: "#675e3f" },
  mountains: { from: "#59656b", to: "#8a9797", accent: "#38434a" },
  desert: { from: "#b58b55", to: "#d4b276", accent: "#8a633d" },
  coast: { from: "#4b8492", to: "#78b7b2", accent: "#31616d" },
};

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

/** Draw the two front faces before the top hex, creating a thick diorama tile. */
function drawHexPlate(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, palette: TerrainPalette) {
  const corners = hexCorners(cx, cy, size);
  const frontEdges: [number, number, string][] = [
    [1, 2, palette.accent],
    [2, 3, "rgba(0,0,0,0.26)"],
  ];
  for (const [start, end, color] of frontEdges) {
    const a = corners[start];
    const b = corners[end];
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.lineTo(b[0], b[1] + HEX_PLATE_DEPTH);
    ctx.lineTo(a[0], a[1] + HEX_PLATE_DEPTH);
    ctx.closePath();
    ctx.fill();
  }
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

  // Offset side face makes even the small settlement huts read as voxel blocks.
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  ctx.moveTo(cx + w / 2, baseY - h * 0.55);
  ctx.lineTo(cx + w / 2 + w * 0.12, baseY - h * 0.47);
  ctx.lineTo(cx + w / 2 + w * 0.12, baseY + w * 0.06);
  ctx.lineTo(cx + w / 2, baseY);
  ctx.closePath();
  ctx.fill();

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

/** Draw a small isometric block: a front face, a lit top and a dark side. */
function block3d(
  ctx: CanvasRenderingContext2D,
  cx: number,
  baseY: number,
  w: number,
  h: number,
  wall: string,
  roof: string,
  depth = 0.16
) {
  const left = cx - w / 2;
  const right = cx + w / 2;
  const top = baseY - h;
  const d = w * depth;
  ctx.fillStyle = wall;
  ctx.beginPath();
  ctx.moveTo(left, top + d);
  ctx.lineTo(right, top);
  ctx.lineTo(right, baseY);
  ctx.lineTo(left, baseY);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  ctx.moveTo(right, top);
  ctx.lineTo(right + d, top + d * 0.55);
  ctx.lineTo(right + d, baseY + d * 0.55);
  ctx.lineTo(right, baseY);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = roof;
  ctx.beginPath();
  ctx.moveTo(left, top + d);
  ctx.lineTo(right, top);
  ctx.lineTo(right + d, top + d * 0.55);
  ctx.lineTo(cx + d * 0.1, top + d * 1.55);
  ctx.closePath();
  ctx.fill();
  haloStroke(ctx, Math.max(1, w * 0.045));
}

/** A walled capital with a government core, a wonder and four player-built plots. */
function drawCapital(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, ownerColor: string, city?: City) {
  const baseY = cy + size * 0.36;
  const stone = "#d7c7a6";
  const marble = "#f0e7cf";
  const terracotta = "#a9563d";

  ctx.save();
  ctx.fillStyle = "rgba(30,18,12,0.28)";
  ctx.beginPath();
  ctx.ellipse(cx, baseY + size * 0.1, size * 0.7, size * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();

  // Raised forum platform gives the whole capital a grounded, miniature-diorama feel.
  ctx.fillStyle = "#8e8068";
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.67, baseY - size * 0.02);
  ctx.lineTo(cx + size * 0.55, baseY - size * 0.18);
  ctx.lineTo(cx + size * 0.67, baseY + size * 0.02);
  ctx.lineTo(cx - size * 0.55, baseY + size * 0.18);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(255,245,215,0.65)";
  ctx.lineWidth = Math.max(1, size * 0.035);
  ctx.stroke();

  const built = city?.buildings.filter((building) => building !== "government" && building !== "wonder") ?? [];
  const plotPositions: [number, number][] = [[-0.42, -0.03], [0.28, -0.08], [-0.34, 0.17], [0.35, 0.15]];
  const material: Record<CityBuilding, [string, string]> = {
    government: [stone, terracotta], housing: ["#ad7650", "#70422f"], production: ["#8f897c", "#59666c"],
    storage: ["#caa767", "#a96932"], military: ["#9fa8a8", "#69747a"], culture: [marble, "#9b6a56"], wonder: [marble, "#b58e43"],
  };
  for (const [index, [dx, dy]] of plotPositions.entries()) {
    const px = cx + size * dx;
    const py = baseY + size * dy;
    // Empty foundations make all four reserved plots visible before construction.
    ctx.fillStyle = "rgba(67, 55, 40, 0.48)";
    ctx.beginPath();
    ctx.moveTo(px - size * 0.17, py);
    ctx.lineTo(px, py - size * 0.07);
    ctx.lineTo(px + size * 0.17, py);
    ctx.lineTo(px, py + size * 0.07);
    ctx.closePath();
    ctx.fill();
    const building = built[index];
    if (building) {
      const [wall, roof] = material[building];
      block3d(ctx, px, py, size * 0.27, building === "military" ? size * 0.32 : size * 0.26, wall, roof);
    }
  }

  // Government and wonder are special, visibly separate from the four player-built plots.
  if (city?.buildings.includes("government")) {
    block3d(ctx, cx - size * 0.02, baseY + size * 0.08, size * 0.28, size * 0.32, stone, terracotta);
  }
  if (city?.buildings.includes("wonder")) {
    block3d(ctx, cx, baseY - size * 0.02, size * 0.32, size * 0.46, marble, "#b58e43");
    ctx.fillStyle = "#b58e43";
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.2, baseY - size * 0.52);
    ctx.lineTo(cx, baseY - size * 0.72);
    ctx.lineTo(cx + size * 0.2, baseY - size * 0.52);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#6f5128";
    ctx.lineWidth = Math.max(1, size * 0.025);
    ctx.stroke();
    ctx.fillStyle = "#ae9769";
    for (const dx of [-0.12, 0.02, 0.16]) {
      ctx.fillRect(cx + size * dx, baseY - size * 0.37, size * 0.035, size * 0.19);
    }
    ctx.fillStyle = terracotta;
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.12, baseY - size * 0.74);
    ctx.lineTo(cx, baseY - size * 0.86);
    ctx.lineTo(cx + size * 0.12, baseY - size * 0.74);
    ctx.closePath();
    ctx.fill();
  }

  // Four corner towers and connecting walls make the capital boundary explicit.
  ctx.fillStyle = "#756b5d";
  for (const [dx, dy] of [[-0.62, -0.02], [0.6, -0.18], [-0.55, 0.27], [0.67, 0.12]] as [number, number][]) {
    ctx.fillRect(cx + size * dx, baseY + size * dy - size * 0.2, size * 0.11, size * 0.25);
  }
  ctx.strokeStyle = "#a69a82";
  ctx.lineWidth = Math.max(2, size * 0.07);
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.57, baseY - size * 0.02);
  ctx.lineTo(cx + size * 0.54, baseY - size * 0.18);
  ctx.moveTo(cx - size * 0.52, baseY + size * 0.23);
  ctx.lineTo(cx + size * 0.61, baseY + size * 0.08);
  ctx.stroke();

  // One banner marks the capital without hiding the three-building silhouette.
  drawFlag(ctx, cx, baseY - size * 0.86, size * 0.46, ownerColor);
  ctx.restore();
}

function drawRivers(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, edges: number[]) {
  if (edges.length === 0) return;
  const corners = hexCorners(cx, cy, size);
  for (const edge of edges) {
    const a = corners[edge];
    const b = corners[(edge + 1) % 6];
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    ctx.strokeStyle = "rgba(25,47,67,0.7)";
    ctx.lineWidth = Math.max(5, size * 0.13);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(mx, my);
    ctx.stroke();
    ctx.strokeStyle = "#4ca7c6";
    ctx.lineWidth = Math.max(2.5, size * 0.07);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(mx, my);
    ctx.stroke();
    ctx.strokeStyle = "rgba(190,239,245,0.65)";
    ctx.lineWidth = Math.max(1, size * 0.018);
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.02, cy);
    ctx.lineTo(mx - size * 0.015, my);
    ctx.stroke();
  }
}

function drawRoadToEdge(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, edge: number, bridge: boolean) {
  const corners = hexCorners(cx, cy, size);
  const a = corners[edge];
  const b = corners[(edge + 1) % 6];
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  ctx.strokeStyle = "rgba(45,31,21,0.7)";
  ctx.lineWidth = Math.max(6, size * 0.12);
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(mx, my); ctx.stroke();
  ctx.strokeStyle = bridge ? "#c49351" : "#b88b57";
  ctx.lineWidth = Math.max(3, size * 0.065);
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(mx, my); ctx.stroke();
  if (bridge) {
    ctx.strokeStyle = "#e2bd78";
    ctx.lineWidth = Math.max(2, size * 0.035);
    ctx.beginPath(); ctx.moveTo(mx - size * 0.09, my - size * 0.03); ctx.lineTo(mx + size * 0.09, my + size * 0.03); ctx.stroke();
  }
}

function drawTileRoads(ctx: CanvasRenderingContext2D, state: GameState, tile: Tile, cx: number, cy: number, size: number) {
  const coord = axialFromId(tile.id);
  for (let direction = 0; direction < AXIAL_DIRECTIONS.length; direction++) {
    const d = AXIAL_DIRECTIONS[direction];
    const neighbour = hexId(coord.q + d.q, coord.r + d.r);
    const hasRoad = state.roadSegments.includes(roadKey(tile.id, neighbour));
    if (!hasRoad) continue;
    drawRoadToEdge(ctx, cx, cy, size, direction, tile.riverEdges.includes(direction));
  }
}

function drawRoadPlan(ctx: CanvasRenderingContext2D, state: GameState, layout: Layout) {
  if (!state.roadPlan) return;
  ctx.save();
  ctx.setLineDash([8, 6]);
  ctx.strokeStyle = "#f5e38a";
  ctx.lineWidth = 5;
  ctx.beginPath();
  state.roadPlan.path.forEach((id, index) => {
    const p = tileCenter(id, layout);
    if (index === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
  });
  ctx.stroke();
  ctx.restore();
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

// --- Army badge ------------------------------------------------------------

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
  const capitalOwner = owner ?? (tile.isCapital ? state.players.find((p) => p.capitalId === tile.id) : null);
  const palette = tile.terrain ? TERRAIN_GROUND[tile.terrain] : WASTELAND_PALETTE;

  drawHexPlate(ctx, cx, cy, size, palette);
  hexPath(ctx, cx, cy, size);
  ctx.save();
  ctx.clip();
  drawTerrainFill(ctx, cx, cy, size, palette);
  drawTerrainDetail(ctx, cx, cy, size, tile.resource);
  drawRivers(ctx, cx, cy, size, tile.riverEdges);
  drawTileRoads(ctx, state, tile, cx, cy, size);
  if (tile.isCapital && capitalOwner) {
    drawCapital(ctx, cx, cy, size, capitalOwner.color, tile.cityId ? state.cities[tile.cityId] : undefined);
  }
  if (owner && tile.cityId && !tile.isCapital) {
    drawSettlement(ctx, cx, cy, size, Math.max(1, state.cities[tile.cityId]?.level ?? tile.level), tile.resource ?? "wood", owner.color);
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
  ctx.save();
  ctx.scale(1, ISO_Y_SCALE);
  // Paint the rear terrain first so the front-facing plate edges naturally
  // overlap it, just like a small physical diorama.
  const ids = [...state.tileOrder].sort((a, b) => {
    const ay = state.tiles[a].r - state.tiles[b].r;
    return ay || state.tiles[a].q - state.tiles[b].q;
  });
  for (const id of ids) {
    drawTile(ctx, state, state.tiles[id], layout, opts);
  }
  drawRoadPlan(ctx, state, layout);
  ctx.restore();
}
