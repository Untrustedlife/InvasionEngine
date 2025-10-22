/**
 * @fileoverview Main raycasting renderer using DDA algorithm for RealmChild Invasion.
 * Renders textured walls with distance shading, fills z-buffer for sprite occlusion,
 * and handles floor/ceiling projection with zone-based coloring. This is the core
 * rendering engine that creates the pseudo-3D environment using raycasting techniques.
 */

import { ctx, WIDTH, HEIGHT } from "./Dom.js";
import { FOG_START_FRAC, FOG_COLOR } from "./Constants.js";
import {
  TEXCACHE,
  SHADE_LEVELS,
  SHADED_TEX,
  TEXTURE_HEIGHT,
} from "./Textures.js";
import { player } from "./Player.js";
import {
  gameStateObject,
  getZoneBaseRgb,
  zoneIdAt,
  getZoneCielingRgb,
} from "./Map.js";
import { WALL_MAP, DirectionEnum } from "./Textures.js";

import { nearestIndexInAscendingOrder } from "./UntrustedUtils.js";

/**
 * Per-pixel height buffer storing wall distances for portal and sprite depth testing.
 * 2D array indexed as [y][x] containing perpendicular distance to wall at each pixel.
 * Faster than Map for frequent reads/writes.
 *
 * @type {Float32Array[]} Array of HEIGHT Float32Arrays, each containing WIDTH values
 */
export const pixelHeightBuffer = new Float32Array(WIDTH * HEIGHT).fill(
  Number.POSITIVE_INFINITY
);
const wallSegmentBuffer = [];
/**
 * Get per-pixel wall distance for portal and sprite depth testing.
 *
 * @param {number} screenX - Screen X coordinate
 * @param {number} screenY - Screen Y coordinate
 * @returns {number} Perpendicular distance to wall, or Infinity if no wall
 * @export
 */
export function getPixelDepth(screenX, screenY) {
  if (screenX < 0 || screenX >= WIDTH || screenY < 0 || screenY >= HEIGHT) {
    return Number.POSITIVE_INFINITY;
  }
  return pixelHeightBuffer[screenY * WIDTH + screenX];
}

export function setPixelDepth(screenX, screenY, depth) {
  if (screenX < 0 || screenX >= WIDTH || screenY < 0 || screenY >= HEIGHT) {
    return;
  } else {
    pixelHeightBuffer[screenY * WIDTH + screenX] = depth;
  }
}

/**
 * Clear the per-pixel buffer at start of each frame.
 * @export
 */
export function clearPixelHeightBuffer() {
  pixelHeightBuffer.fill(Number.POSITIVE_INFINITY);
}
/**
 * Half screen height constant, computed using bitwise shift for performance.
 * Represents the horizon line and serves as the reference point for all
 * vertical rendering calculations including floor/ceiling projection.
 *
 * **Used by:**
 * - `Main.js`: Used as horizon reference for floor gradient calculations,
 *   screen space positioning, and as boundary for rendering operations
 * - **Internally**: Used throughout for wall positioning, gradient boundaries,
 *   fog calculations, and floor/ceiling projection mathematics
 *
 * @type {number} Half of screen height (horizon line)
 */
export const HALF_HEIGHT = HEIGHT >> 1; //Bitwise shift is faster than division by 2

/** @private Internal buffer storing bottom Y position of walls for each screen column */
const wallBottomY = new Int16Array(WIDTH).fill(HALF_HEIGHT);
/**
 * Array storing top Y position of walls for each screen column. Used by the
 * rendering system to track wall boundaries and determine rendering regions.
 *
 * **Used by:**
 * - `Main.js`: References wall top positions for rendering calculations and
 *   determining ceiling rendering boundaries
 *
 * @type {Int16Array} Array of wall top Y positions indexed by screen column
 */
export const wallTopY = new Int16Array(WIDTH).fill(HALF_HEIGHT);

//Distance from camera to each screen row (used for floor projection)
//This keeps floors and walls aligned at any playerHeight without hacks.
const ROW_DIST = new Float32Array(HEIGHT);
const CIELING_ROW_DIST = new Float32Array(HEIGHT);
//idd will be key for zone ID, value will be precomputed row distance array
const ROW_DIST_BY_ZONE = {};
const CILEING_DIST_BY_ZONE = {};

/**
 * Rebuilds distance lookup tables for floor and ceiling projection calculations.
 * Precomputes the distance from camera to each screen row, accounting for player height
 * and zone-specific floor depths and ceiling heights. This ensures proper perspective
 * projection and alignment between floors/ceilings and walls without runtime calculations.
 *
 * **Used by:**
 * - `Main.js`: Called during map loading/switching to initialize projection tables
 * - `Gameplay.js`: Called when player height changes (e.g., when taking damage and
 *   crouching) to maintain correct perspective projection
 *
 * @export
 */
export function rebuildRowDistLUT() {
  //Clear previous per-zone tables
  for (const key in CILEING_DIST_BY_ZONE) {
    delete CILEING_DIST_BY_ZONE[key];
  }
  for (const key in ROW_DIST_BY_ZONE) {
    delete ROW_DIST_BY_ZONE[key];
  }

  const horizon = HALF_HEIGHT; //same 'horizon' used for sprites
  const EYE = player.calculatePlayerHeight(); //same EYE as in sprite code

  const floorDepth = 0; //Ground level
  const floorAdjuster = 2 - floorDepth;
  const eyeScale = HEIGHT * (floorAdjuster - EYE) * 0.5; //matches sprite projection

  for (let y = 0; y < HEIGHT; y++) {
    const dy = y - horizon; //>0 below horizon
    ROW_DIST[y] = dy !== 0 ? eyeScale / dy : 1e-6; //avoid div-by-zero

    const cileingHeight = 2; //2 WUNITS
    const cileingAdjuster = cileingHeight - 2; //2 is a wall consiting of two WUNITS
    const ceilingScale = HEIGHT * (cileingAdjuster + EYE) * 0.5;
    CIELING_ROW_DIST[y] = dy !== 0 ? -ceilingScale / dy : -1e-6;
  }

  for (let i = 0; i < gameStateObject.zones.length; i++) {
    const zone = gameStateObject.zones[i];
    if (zone.ceilingHeight !== undefined) {
      CILEING_DIST_BY_ZONE[i] = new Float32Array(HEIGHT); //Allocate the array first
      for (let y = 0; y < HEIGHT; y++) {
        const dy = y - horizon; //>0 below horizon
        const cileingHeight = zone.ceilingHeight;
        const cileingAdjuster = cileingHeight - 2; //2 is a wall consiting of two WUNITS
        const ceilingScale = HEIGHT * (cileingAdjuster + EYE) * 0.5;
        CILEING_DIST_BY_ZONE[i][y] = dy !== 0 ? -ceilingScale / dy : -1e-6;
      }
    }

    if (zone.floorDepth !== undefined) {
      const newFloorDepth = zone.floorDepth; //Ground level
      const newFloorAdjuster = 2 - newFloorDepth;
      const newEyeScale = HEIGHT * (newFloorAdjuster - EYE) * 0.5; //matches sprite projection
      ROW_DIST_BY_ZONE[i] = new Float32Array(HEIGHT); //Allocate the array first
      for (let y = 0; y < HEIGHT; y++) {
        const dy = y - horizon; //>0 below horizon
        ROW_DIST_BY_ZONE[i][y] = dy !== 0 ? newEyeScale / dy : 1e-6; //avoid div-by-zero
      }
    }
  }
}

rebuildRowDistLUT();
/**
 * Draw a 1-pixel wide vertical wall slice from a (pre-shaded) texture.
 *
 * @param {CanvasRenderingContext2D} ctx              - Destination 2D context.
 * @param {number} screenColumnX                      - X position on the screen to draw to.
 * @param {number} destTopY                           - Top Y of the slice on screen.
 * @param {number} destBottomY                        - Bottom Y of the slice on screen.
 * @param {number} textureHeight - Source texture canvas/atlas height.
 * @param {number} textureColumnX                     - Source X (in px) of the 1px texture column.
 * @param {number} shadeAmount                        - Shade amount used to pick a pre-shaded variant.
 * @param {number} sourceStartY                       - Source Y start within the texture.
 * @param {number} sourceHeight                       - Source height within the texture.
 * @param {number|string} textureId                   - Key/index into SHADED_TEX.
 */
function drawWallColumnImg(
  ctx,
  screenColumnX,
  destTopY,
  destBottomY,
  textureHeight,
  textureColumnX,
  shadeAmount,
  sourceStartY,
  sourceHeight,
  textureId
) {
  const columnHeight = destBottomY - destTopY;
  if (columnHeight <= 0) {
    return;
  }
  if (!textureHeight) {
    return;
  }
  if (destTopY >= HEIGHT || destBottomY <= 0) {
    return;
  }
  const height = textureHeight;
  const rawSourceY = sourceStartY || 0;
  const clampedSourceY =
    rawSourceY < 0 ? 0 : rawSourceY > height ? height : rawSourceY;
  const rawSourceHeight = sourceHeight || height;
  const maxAllowedHeight = height - clampedSourceY;
  const clampedSourceHeight =
    rawSourceHeight < 0
      ? 0
      : rawSourceHeight > maxAllowedHeight
      ? maxAllowedHeight
      : rawSourceHeight;
  if (clampedSourceHeight <= 0) {
    return;
  }
  let clampedDestTopY = destTopY;
  let clampedDestBottomY = destBottomY;
  let sourceYOffset = 0;

  // Clamp top
  if (clampedDestTopY < 0) {
    const pixelsClipped = -clampedDestTopY;
    sourceYOffset += (pixelsClipped / columnHeight) * clampedSourceHeight;
    clampedDestTopY = 0;
  }

  // Clamp bottom
  if (clampedDestBottomY > HEIGHT) {
    clampedDestBottomY = HEIGHT;
  }

  const finalColumnHeight = clampedDestBottomY - clampedDestTopY;
  if (finalColumnHeight <= 0) {
    return;
  }

  const closestShade = nearestIndexInAscendingOrder(SHADE_LEVELS, shadeAmount);
  ctx.drawImage(
    SHADED_TEX[textureId][SHADE_LEVELS[closestShade]],
    textureColumnX,
    clampedSourceY + sourceYOffset,
    1,
    (finalColumnHeight / columnHeight) * clampedSourceHeight,
    screenColumnX,
    clampedDestTopY,
    1,
    finalColumnHeight
  );
}

//Gradient caches - arrays indexed by zone ID for O(1) access
export const CEILING_GRADIENT_CACHE = [];
export const FLOOR_FOG_GRADIENT_CACHE = [];
export const CIELING_FOG_GRADIENT_CACHE = [];
export const HAZE_GRADIENT_CACHE = [];
export const SIMPLE_FLOOR_GRADIENT_CACHE = [];
export const ZONE_GRID_CACHE = [];

/**
 * Clears all gradient caches and zone color caches. Critical for preventing
 * memory leaks and visual artifacts when switching between maps that have
 * different zone configurations, color schemes, or lighting setups.
 *
 * **Used by:**
 * - `Main.js`: Called during map loading/switching to ensure clean state
 *   and prevent stale cached gradients from previous maps
 *
 * @export
 */
export function clearGradientCaches() {
  CEILING_GRADIENT_CACHE.length = 0;
  FLOOR_FOG_GRADIENT_CACHE.length = 0;
  CIELING_FOG_GRADIENT_CACHE.length = 0;
  HAZE_GRADIENT_CACHE.length = 0;
  SIMPLE_FLOOR_GRADIENT_CACHE.length = 0;
  ZONE_CSS.clear();
  ZONE_CIELING_CSS.clear();
}

/**
 * Renders a simple gradient-based ceiling using zone-specific colors.
 * Creates a linear gradient from top to horizon with configurable front, back,
 * and fog colors. Uses caching for performance optimization. This is the "classic"
 * approach used for simpler maps that don't require complex ceiling projection.
 *
 * **Used by:**
 * - `Main.js`: Called as the primary ceiling renderer when zone count <= 2,
 *   providing a simpler alternative to per-pixel ceiling projection for
 *   less complex map configurations
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D rendering context
 * @export
 */
export function castCielingCLassic(ctx) {
  const px = player.x | 0;
  const py = player.y | 0;
  const zIndex = ZONE_GRID_CACHE[py * gameStateObject.MAP_W + px];

  //Check cache first - O(1) access
  let sky = CEILING_GRADIENT_CACHE[zIndex];
  if (!sky) {
    //Create and cache the gradient
    sky = ctx.createLinearGradient(0, 0, 0, HALF_HEIGHT);
    const cielingFrontColorZone =
      gameStateObject.zones[zIndex].cielingColorFront;
    const cielingBackColorZone = gameStateObject.zones[zIndex].cielingColorBack;
    const fogColorZone = gameStateObject.zones[zIndex].fogColor;

    sky.addColorStop(
      0,
      cielingFrontColorZone || gameStateObject.cielingColorFront || "#6495ED"
    );
    if (gameStateObject.cielingColorBack) {
      sky.addColorStop(
        0.5,
        cielingBackColorZone || gameStateObject.cielingColorBack || "#6495ED"
      );
    }
    sky.addColorStop(0.9, fogColorZone || FOG_COLOR);

    CEILING_GRADIENT_CACHE[zIndex] = sky;
  }

  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WIDTH, HALF_HEIGHT);
}

//Cache zone colors for performance
export const ZONE_CSS = new Map();
function zoneCss(zoneId) {
  let c = ZONE_CSS.get(zoneId);
  if (!c) {
    const [r, g, b] = getZoneBaseRgb(zoneId); //already zone-based shade
    c = `rgb(${r | 0},${g | 0},${b | 0})`;
    ZONE_CSS.set(zoneId, c);
  }
  return c;
}
export const ZONE_CIELING_CSS = new Map();
function zoneCielingCss(zoneId) {
  let c = ZONE_CIELING_CSS.get(zoneId);
  if (!c) {
    const [r, g, b] = getZoneCielingRgb(zoneId); //already zone-based shade
    c = `rgb(${r | 0},${g | 0},${b | 0})`;
    ZONE_CIELING_CSS.set(zoneId, c);
  }
  return c;
}

/**
 * Pre-computes and caches zone IDs for every grid position in the map.
 * Builds a flat array indexed by (y * MAP_W + x) containing zone IDs for
 * ultra-fast O(1) zone lookups during floor/ceiling rendering, eliminating
 * expensive zoneIdAt() calls during the tight render loop.
 *
 * **Used by:**
 * - `Main.js`: Called during map loading to populate the zone grid cache
 * - **Internally**: `castFloor()` and `castCieling()` use ZONE_GRID_CACHE for
 *   instant zone lookups when projecting floor/ceiling colors
 *
 * @export
 */
export function cacheZoneIdAtGrid() {
  ZONE_GRID_CACHE.length = 0;
  const zones = gameStateObject.zones;
  const MAP_W = gameStateObject.MAP_W;
  const MAP_H = gameStateObject.MAP_H;
  for (let iy = 0; iy < MAP_H; iy++) {
    for (let ix = 0; ix < MAP_W; ix++) {
      ZONE_GRID_CACHE[iy * MAP_W + ix] = zoneIdAt(ix, iy, zones);
    }
  }
}

//#region Floor
/**
 * Render the floor for a single screen column below the horizon.
 * Uses large row chunks with a small binary search to split only at zone
 * boundaries; draws a 1-px band when adjacent zones have different
 * floor depths.
 *
 * @param {number} nowSec
 *   Current time (reserved for animation; not used here).
 * @param {{dirX:number, dirY:number, planeX:number, planeY:number}} cameraBasisVectors
 *   Camera forward and plane vectors for this frame.
 * @param {number} screenColumnX
 *   Screen column index to draw.
 * @param {number} [fromY=0]
 *   Suggested start row; clamped to max(HALF_HEIGHT, wallBottomY[x]).
 * @returns {void}
 *
 * @summary
 * - Skips rows hidden by fog or z-buffer.
 * - Classifies zones with global row_dist and a tiny directional bias
 * - Fills one span per uniform zone run; 1-px band only when
 *   floorDepth differs across the boundary.
 * @uses WIDTH, HEIGHT, HALF_HEIGHT, player, row_dist, ZONE_GRID_CACHE,
 *       gameStateObject, zoneCss, wallBottomY, ctx
 */
export function castFloor(
  nowSec,
  cameraBasisVectors,
  screenColumnX,
  fromY = 0
) {
  const { dirX, dirY, planeX, planeY } = cameraBasisVectors;
  //start row
  fromY = HALF_HEIGHT;
  let y = fromY < HALF_HEIGHT ? HALF_HEIGHT : fromY;
  if (y >= HEIGHT) {
    return;
  }

  //column ray
  const camX = (2 * (screenColumnX + 0.5)) / WIDTH - 1;
  const rayX = dirX + planeX * camX;
  const rayY = dirY + planeY * camX;

  //early cull (fog OR behind nearer wall)
  if (player.sightDist > 0) {
    while (y < HEIGHT) {
      const d = ROW_DIST[y] ?? Infinity;
      if (d <= player.sightDist) {
        break;
      }
      y++;
    }
    if (y >= HEIGHT) {
      return;
    }
  }

  const DEPTH_STEP_COLOR = "#000000";
  const MAP_W = gameStateObject.MAP_W;
  const MAP_H = gameStateObject.MAP_H;
  //world pos from global distance
  const invDot = 1 / (dirX * rayX + dirY * rayY);
  const kx = rayX * invDot;
  const ky = rayY * invDot;
  //classify zone using row dist. (Tried to do something fancier, didn't work out)
  let lastZoneId = 0;
  function zoneAtRow(row, hintZone = 0) {
    const d = ROW_DIST[row] ?? ROW_DIST[ROW_DIST.length - 1] ?? Infinity;
    const wx = player.x + kx * d;
    const wy = player.y + ky * d;
    const ix = wx | 0;
    const iy = wy | 0;
    if (ix >= 0 && iy >= 0 && ix < MAP_W && iy < MAP_H) {
      return ZONE_GRID_CACHE[iy * MAP_W + ix];
    }
    return 0;
  }

  //adaptive stride for perf (big jumps far from horizon)
  const strideFor = (row) =>
    Math.max(8, Math.min(64, 8 + ((row - HALF_HEIGHT) >>> 3)));

  //painter state
  lastZoneId = zoneAtRow(y, lastZoneId);

  let runStartY = y;
  let lastStyle = null;
  let notDrawing = false;
  while (y < HEIGHT) {
    const pixelDepth = getPixelDepth(screenColumnX, y | 0);
    if (pixelDepth < Infinity) {
      //Wall at this row - skip it, don't render
      if (!notDrawing && y > runStartY) {
        const col = zoneCss(lastZoneId);
        if (col !== lastStyle) {
          ctx.fillStyle = col;
          lastStyle = col;
        }
        ctx.fillRect(screenColumnX, runStartY, 1, y - runStartY);
      }
      notDrawing = true;
      runStartY = y + 1; //Skip this row, start fresh next row
      y++;
      continue; //Keep going, don't return
    }
    notDrawing = false;
    //try a large jump
    const step = Math.min(strideFor(y), HEIGHT - 1 - y);
    if (step <= 0) {
      break;
    }
    const yProbe = y + step;
    const zProbe = zoneAtRow(yProbe, lastZoneId);
    if (zProbe === lastZoneId) {
      //quick midpoint check to avoid missing a thin boundary
      const mid = (y + yProbe) >> 1;
      if (zoneAtRow(mid, lastZoneId) === lastZoneId) {
        //whole block is one zone -> draw once
        const col = zoneCss(lastZoneId);
        if (col !== lastStyle) {
          ctx.fillStyle = col;
          lastStyle = col;
        }
        const h = yProbe + 1 - runStartY;
        if (h > 0) {
          ctx.fillRect(screenColumnX, runStartY, 1, h);
        }
        y = yProbe + 1;
        runStartY = y;
        continue;
      }
    }
    //boundary inside [y, yProbe] — find first row where zone changes
    let lo = y,
      hi = yProbe;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (zoneAtRow(mid, lastZoneId) === lastZoneId) {
        lo = mid;
      } else {
        hi = mid;
      }
    }

    //flush up to boundary
    const col = zoneCss(lastZoneId);
    if (col !== lastStyle) {
      ctx.fillStyle = col;
      lastStyle = col;
    }
    const h = hi - runStartY;
    if (h > 0) {
      ctx.fillRect(screenColumnX, runStartY, 1, h);
    }

    //optional 1px "step" band
    //find the next zone at the boundary row *before* switching
    const newZoneId = zoneAtRow(hi, lastZoneId);

    //draw a 1px band only if floor depths differ
    const oldDepth = gameStateObject.zones[lastZoneId]?.floorDepth ?? 0;
    const newDepth = gameStateObject.zones[newZoneId]?.floorDepth ?? 0;
    const oldZone = gameStateObject.zones[lastZoneId] || {};
    const newZone = gameStateObject.zones[newZoneId] || {};
    const oldIsLiquid = oldZone.isLiquid;
    const newIsLiquid = newZone.isLiquid;
    const wallEdgeY = wallBottomY[screenColumnX] ?? HALF_HEIGHT;
    const boundaryD =
      ROW_DIST_BY_ZONE?.[lastZoneId]?.[hi] ?? ROW_DIST[hi] ?? Infinity; //global, stable
    const wallD =
      getPixelDepth(screenColumnX, wallBottomY[screenColumnX]) ?? Infinity;

    //skip band when it's at/under the wall edge or not strictly in front
    const atWallEdge = hi === wallEdgeY; //touching wall bottom
    let occludedByWall = boundaryD >= wallD - 2; //wall is nearer/equal

    if ((oldIsLiquid || newIsLiquid) && oldDepth !== newDepth) {
      occludedByWall = false;
    }

    const isFirstFloorRow = runStartY === wallEdgeY; //first boundary after start

    const drawDepthBand =
      !!DEPTH_STEP_COLOR &&
      oldDepth !== newDepth &&
      !atWallEdge &&
      !occludedByWall &&
      !isFirstFloorRow;

    if (drawDepthBand) {
      const oldDepth = oldZone.floorDepth ?? 0; //negative or 0
      const newDepth = newZone.floorDepth ?? 0; //negative or 0

      let amount = 0;
      if (oldIsLiquid || newIsLiquid) {
        //liquid: keep legacy 7:2 thickness
        amount = oldDepth > newDepth ? 5 : 0;
      } else {
        //Replace with proper projection portals and walls that are lower height then floors that floors get drawn on top of then you can climb on them or whatever
        //non-liquid: scale thickness to actual floor depth delta, projected by distance
        const depthDeltaUnits = oldDepth - newDepth; //units (negative depths -> positive delta)
        //Prefer per-zone distance if available, else fall back to global boundary distance
        const dOld = ROW_DIST_BY_ZONE?.[lastZoneId]?.[hi];
        const dNew = ROW_DIST_BY_ZONE?.[newZoneId]?.[hi];
        let d = boundaryD;
        if (Number.isFinite(dOld) || Number.isFinite(dNew)) {
          d = Math.min(
            dOld ?? Infinity,
            dNew ?? Infinity,
            boundaryD ?? Infinity
          );
          if (!Number.isFinite(d)) {
            d = boundaryD;
          }
        }
        //Project vertical step to pixels. Derived from bottomY = horizon + eyeScale/d, where
        //deltaEyeScale = HEIGHT * (oldDepth - newDepth) * 0.5
        const thicknessPx = (HEIGHT * depthDeltaUnits * 0.5) / d;
        //Clamp to sane on-screen band
        amount = Math.max(1, thicknessPx | 0);
        //console.log(amount);
        amount = oldDepth > newDepth ? amount : 0;
      }

      const y0 = hi;
      const y1 = y0 + amount;
      if (zoneAtRow(hi, lastZoneId) !== zoneAtRow(y1 - 1, newZoneId)) {
        //This prevents drawing the band if the zone changes again within the band to avoid un-immersive artifacts
        lastStyle = null;
        lastZoneId = newZoneId;
      } else {
        if (y1 > y0) {
          if (ctx.fillStyle !== DEPTH_STEP_COLOR) {
            ctx.fillStyle = DEPTH_STEP_COLOR;
          }
          ctx.fillRect(screenColumnX, y0, 1, y1 - y0);
        }
        lastStyle = null; //force next span color set
        lastZoneId = newZoneId;
        y = y1;
        runStartY = y;
        continue;
      }
    }
    //#endregion

    //switch to new zone and continue below the band only if we drew it
    lastZoneId = newZoneId;
    y = hi;
    runStartY = y;
  }

  //tail
  if (runStartY < HEIGHT) {
    const col = zoneCss(lastZoneId);
    if (col !== lastStyle) {
      ctx.fillStyle = col;
    }
    ctx.fillRect(screenColumnX, runStartY, 1, HEIGHT - runStartY);
  }
}
//#region Ceiling
/**
 * Renders ceiling projection for a single screen column using ray casting.
 * Projects ceiling colors by casting a ray from camera through each screen row above
 * the horizon, computing world coordinates and sampling zone-based ceiling colors.
 * Uses zone-specific ceiling heights and precomputed distance tables for proper projection.
 *Culls based on zbuffer and fog distance.
 * **Used by:**
 * - `Main.js`: Called in the main render loop for each screen column to draw
 *   ceilings that appear above the horizon line and above rendered walls
 *   (when zone count > 2 for complex ceiling projection)
 *
 * @param {number} nowSec - Current time in seconds for potential animation effects
 * @param {Object} cameraBasisVectors - Camera direction and plane vectors {dirX, dirY, planeX, planeY}
 * @param {number} screenColumnX - Screen column X coordinate to render
 * @param {number} fromY - Starting Y position (defaults to wall top or horizon)
 * @export
 */
export function castCieling(
  nowSec,
  cameraBasisVectors,
  screenColumnX,
  fromY = 0
) {
  const { dirX, dirY, planeX, planeY } = cameraBasisVectors;
  //never draw above the horizon
  //This needs to also work in spaces wher there is  a short wall in front of  a tall wall
  const endY = HALF_HEIGHT;
  const startY = 0; //top of screen
  if (endY <= 0) {
    return;
  } //nothing to draw
  //Ray for this column (same as walls)
  const camX = (2 * (screenColumnX + 0.5)) / WIDTH - 1;
  const rayX = dirX + planeX * camX;
  const rayY = dirY + planeY * camX;
  //Initialize world positions using first row distance
  const invDot = 1 / (dirX * rayX + dirY * rayY);
  //Initialize world positions using first row *perp* distance, corrected
  let lastZone = 0;
  let dist =
    CILEING_DIST_BY_ZONE?.[lastZone]?.[startY] ?? CIELING_ROW_DIST[startY];

  let wx = player.x + rayX * dist * invDot;
  let wy = player.y + rayY * dist * invDot;
  let runStartY = startY;
  let lastStyle = null;
  let notDrawing = false;
  //Walk rows, build a vertical scan based on the floors we can see
  for (let y = startY; y < endY; y++) {
    if (player.sightDist > 0 && dist > player.sightDist) {
      //flush up to the fog line and stop
      const color = zoneCielingCss(lastZone);
      if (color !== lastStyle) {
        ctx.fillStyle = color;
      }
      ctx.fillRect(screenColumnX, runStartY, 1, y - runStartY);
      return; //<- important: no tail fill beyond fog
    }

    if (dist >= getPixelDepth(screenColumnX, y | 0)) {
      if (!notDrawing) {
        //Flush the visible run BEFORE the occluding wall
        const color = zoneCielingCss(lastZone);
        if (color !== lastStyle) {
          ctx.fillStyle = color;
          lastStyle = color;
        }
        ctx.fillRect(screenColumnX, runStartY, 1, y - runStartY);
      }
      //Now skip to next distance level
      const nextDist =
        CILEING_DIST_BY_ZONE?.[lastZone]?.[y + 1] ??
        CIELING_ROW_DIST[y + 1] ??
        dist;
      const delta = nextDist - dist;
      wx += rayX * delta * invDot;
      wy += rayY * delta * invDot;
      dist = nextDist;
      notDrawing = true;
      runStartY = y;
      continue;
    }
    notDrawing = false;
    const ix = wx | 0;
    const iy = wy | 0;
    const zoneId =
      ix >= 0 &&
      iy >= 0 &&
      ix < gameStateObject.MAP_W &&
      iy < gameStateObject.MAP_H
        ? ZONE_GRID_CACHE[iy * gameStateObject.MAP_W + ix]
        : lastZone;

    if (zoneId !== lastZone) {
      const color = zoneCielingCss(lastZone);
      if (color !== lastStyle) {
        ctx.fillStyle = color;
        lastStyle = color;
      }
      ctx.fillRect(screenColumnX, runStartY, 1, y - runStartY);
      lastZone = zoneId;
      runStartY = y;
    }

    //step world coords using successive row distances
    const nextDist =
      CILEING_DIST_BY_ZONE?.[lastZone]?.[y + 1] ??
      CIELING_ROW_DIST[y + 1] ??
      dist;
    const delta = nextDist - dist;
    wx += rayX * delta * invDot;
    wy += rayY * delta * invDot;
    dist = nextDist;
  }

  //Flush tail run
  const color = zoneCielingCss(lastZone);
  if (color !== lastStyle) {
    ctx.fillStyle = color;
  }
  ctx.fillRect(screenColumnX, runStartY, 1, endY - runStartY);
}
//#endregion
//#region Haze
/**
 * Renders atmospheric haze effect as a subtle gradient overlay across the entire screen.
 * Creates a dark blue tinted gradient that increases in intensity from top to bottom,
 * providing environmental depth and mood to the 3D scene. Uses caching for performance
 * since haze is static and not zone-dependent.
 *
 * **Used by:**
 * - `Main.js`: Called during the render loop to add atmospheric depth and ambiance
 *   to the scene before sprites are rendered
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D rendering context
 * @export
 */
export function castHaze(ctx) {
  //Check cache first - O(1) access (haze is static, not zone-dependent)
  let backgroundFogGradient = HAZE_GRADIENT_CACHE[0];
  if (!backgroundFogGradient) {
    //Create and cache the gradient
    backgroundFogGradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    backgroundFogGradient.addColorStop(0.0, "rgba(16,27,46,0.08)");
    backgroundFogGradient.addColorStop(0.5, "rgba(16,27,46,0.16)");
    backgroundFogGradient.addColorStop(1.0, "rgba(16,27,46,0.20)");

    HAZE_GRADIENT_CACHE[0] = backgroundFogGradient;
  }

  ctx.fillStyle = backgroundFogGradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}
//#endregion

//#region Floor Fog
/**
 * Renders floor fog effect using zone-specific fog and floor colors.
 * Creates a gradient that starts near the horizon with fog color, transitions
 * to floor back color, then fades to transparent at the bottom. Provides
 * atmospheric depth to floor areas with zone-specific customization.
 *
 * **Used by:**
 * - `Main.js`: Called during the render loop after floor rendering to add
 *   fog effects that enhance depth perception and atmosphere
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D rendering context
 * @export
 */
export function castFloorFog(ctx) {
  const y0 = HALF_HEIGHT - 1,
    h = HEIGHT - y0;
  const px = player.x | 0;
  const py = player.y | 0;

  const zIndex = ZONE_GRID_CACHE[py * gameStateObject.MAP_W + px];

  //Check cache first - O(1) access
  let g = FLOOR_FOG_GRADIENT_CACHE[zIndex];
  if (!g) {
    //Create and cache the gradient
    const floorBackColor = gameStateObject.zones[zIndex].floorColorBack;
    g = ctx.createLinearGradient(0, y0, 0, HEIGHT);
    g.addColorStop(0.05, gameStateObject.zones[zIndex].fogColor || FOG_COLOR);
    g.addColorStop(
      0.15,
      floorBackColor || gameStateObject.floorColorBack || "#03210A"
    );
    g.addColorStop(1, "rgba(0,0,0,0)"); //Clear

    FLOOR_FOG_GRADIENT_CACHE[zIndex] = g;
  }

  ctx.fillStyle = g;
  ctx.fillRect(0, y0, WIDTH, h);
}
//#endregion

//#region Ceiing Fog
/**
 * Renders ceiling fog effect using zone-specific colors and atmospheric blending.
 * Creates a gradient from transparent at the top to fog color near the horizon,
 * providing atmospheric depth to ceiling areas. The effect is strongest near
 * the horizon line where ceiling meets distant areas.
 *
 * **Used by:**
 * - `Main.js`: Called during the render loop after ceiling rendering to add
 *   fog effects that create atmospheric depth in ceiling areas
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D rendering context
 * @export
 */
export function castCielingFog(ctx) {
  const y0 = 0,
    h = HALF_HEIGHT + 1;
  const px = player.x | 0;
  const py = player.y | 0;
  const zIndex = ZONE_GRID_CACHE[py * gameStateObject.MAP_W + px];

  //Check cache first - O(1) access
  let g = CIELING_FOG_GRADIENT_CACHE[zIndex];
  if (!g) {
    //Create and cache the gradient
    const fogColor = gameStateObject.zones[zIndex].fogColor || FOG_COLOR;
    const skyBack =
      gameStateObject.zones[zIndex].cielingColorBack ||
      gameStateObject.cielingColorBack ||
      "#6495ED";
    g = ctx.createLinearGradient(0, y0, 0, y0 + h);
    g.addColorStop(0.0, "rgba(0,0,0,0)"); //fully clear at top
    g.addColorStop(0.85, skyBack); //tint near horizon
    g.addColorStop(0.95, fogColor); //strongest at horizon

    CIELING_FOG_GRADIENT_CACHE[zIndex] = g;
  }

  ctx.fillStyle = g;
  ctx.fillRect(0, y0, WIDTH, h);
}
//#endregion

//region Wall Casting

function drawFogBand(screenX, y0f, y1f, dist) {
  if (player.sightDist <= 0) {
    return;
  }
  const start = player.sightDist * FOG_START_FRAC;
  const end = player.sightDist;
  if (dist <= start) {
    return;
  }

  let y0 = y0f | 0;
  let y1 = y1f | 0;
  if (y0 < 0) {
    y0 = 0;
  }
  if (y1 > HEIGHT) {
    y1 = HEIGHT;
  }
  if (y1 <= y0) {
    return;
  }

  const t = Math.min(
    1,
    Math.max(0, (dist - start) / Math.max(1e-6, end - start))
  );
  const px = player.x | 0;
  const py = player.y | 0;
  const zIndex =
    ZONE_GRID_CACHE.length > 0
      ? ZONE_GRID_CACHE[py * gameStateObject.MAP_W + px] | 0
      : 0;

  ctx.save();
  ctx.globalAlpha = t * 0.85;
  ctx.fillStyle = gameStateObject.zones[zIndex].fogColor || FOG_COLOR;
  ctx.fillRect(screenX, y0, 1, y1 - y0);
  ctx.restore();
}

/**
 * Core wall raycasting renderer (DDA).
 *
 * For each screen column, casts a ray through the grid until it hits a wall,
 * then draws a textured slice with distance-based shading/fog and correct UVs.
 * Populates the z-buffer for sprite depth sorting and supports variable wall
 * heights, far-over-near wall stacking, and ceiling clipping.
 *
 * TODO:
 * - Implement floor clipping.
 * - Add a separate ceiling z-buffer so short near walls don’t occlude higher far ceilings in the same zone.
 * - Add a separate floor z-buffer for counters/low geometry for the same reason.
 *   (With these in place, we can support counters and other Arena-style features.)
 * **Used by:**
 * - `Main.js`: Called as the primary wall renderer in the main render loop,
 *   executed after scene clearing but before floor/ceiling and sprite rendering
 *
 * @param {number} nowSec - Current time in seconds for texture animation effects (e.g., flesh texture)
 * @param {Object} cameraBasisVectors - Camera direction and plane vectors {dirX, dirY, planeX, planeY}
 * @param {Array<Array<number>>} MAP - 2D map array where non-zero values represent wall texture IDs
 * @param {number} MAP_W - Map width in grid cells
 * @param {number} MAP_H - Map height in grid cells
 * @export
 */
export function castWalls(nowSec, cameraBasisVectors) {
  clearPixelHeightBuffer();
  const { dirX, dirY, planeX, planeY } = cameraBasisVectors; //Camera forward and plane vectors.
  //Pre-compute culling flags outside the inner loop for performance
  const hasFarPlaneCulling = player.sightDist > 0;
  const EYE = player.calculatePlayerHeight(); //same as sprites
  let eyeScale = HEIGHT * (2 - 0 - EYE) * 0.5;

  //Cast one ray per screen column
  for (let screenColumnX = 0; screenColumnX < WIDTH; screenColumnX++) {
    wallSegmentBuffer.length = 0;
    //Map screen X to camera plane [-1, +1], offset by 0.5 to center pixel
    const cameraPlaneX = (2 * (screenColumnX + 0.5)) / WIDTH - 1;
    const rayDirectionX = dirX + planeX * cameraPlaneX;
    const rayDirectionY = dirY + planeY * cameraPlaneX;

    //Early exit: skip rays with near-zero direction (would cause numerical instability)
    if (
      rayDirectionX < 1e-8 &&
      rayDirectionX > -1e-8 &&
      rayDirectionY < 1e-8 &&
      rayDirectionY > -1e-8
    ) {
      wallBottomY[screenColumnX] = HALF_HEIGHT;
      wallTopY[screenColumnX] = HALF_HEIGHT;
      continue;
    }

    const rayDirXRecip = 1 / (rayDirectionX || 1e-9);
    const rayDirYRecip = 1 / (rayDirectionY || 1e-9);
    //DDA setup - current map position
    let currentMapX = player.x | 0;
    let currentMapY = player.y | 0;

    //Distance to cross one grid cell
    const deltaDistanceX = rayDirXRecip < 0 ? -rayDirXRecip : rayDirXRecip;
    const deltaDistanceY = rayDirYRecip < 0 ? -rayDirYRecip : rayDirYRecip;

    //Step direction and distance to next grid line
    let stepDirectionX, stepDirectionY, sideDistanceX, sideDistanceY;
    if (rayDirectionX < 0) {
      stepDirectionX = -1;
      sideDistanceX = (player.x - currentMapX) * deltaDistanceX;
    } else {
      stepDirectionX = 1;
      sideDistanceX = (currentMapX + 1.0 - player.x) * deltaDistanceX;
    }
    if (rayDirectionY < 0) {
      stepDirectionY = -1;
      sideDistanceY = (player.y - currentMapY) * deltaDistanceY;
    } else {
      stepDirectionY = 1;
      sideDistanceY = (currentMapY + 1.0 - player.y) * deltaDistanceY;
    }

    //DDA variables: wallSide 0=vertical wall, 1=horizontal wall
    let wallSide = 0;
    let hitTextureId = 1;
    let wallHit = false;
    //(hitPositionX/hitPositionY computed later for UVs)
    let iterationGuard = 0;

    //DDA stepping - advance to next grid boundary until wall hit

    while (iterationGuard < player.sightDist * 1.5) {
      wallHit = false;
      while (!wallHit && iterationGuard++ < player.sightDist * 1.5) {
        if (sideDistanceX < sideDistanceY) {
          sideDistanceX += deltaDistanceX;
          currentMapX += stepDirectionX;
          wallSide = 0;
        } else {
          sideDistanceY += deltaDistanceY;
          currentMapY += stepDirectionY;
          wallSide = 1;
        }

        //Far plane culling - use pre-computed flag to avoid repeated condition check
        if (hasFarPlaneCulling) {
          const approximateDistance = Math.min(sideDistanceX, sideDistanceY);
          if (approximateDistance > player.sightDist) {
            wallHit = false;
            hitTextureId = 0;
            break;
          }
        }

        //Map bounds check
        //Also places bricks on outside edge of map. (Could make customizable based on map)
        if (
          currentMapX < 0 ||
          currentMapY < 0 ||
          currentMapX >= gameStateObject.MAP_W ||
          currentMapY >= gameStateObject.MAP_H
        ) {
          wallHit = true;
          hitTextureId = 1;
          break;
        }

        //Wall hit check
        const mapCell = gameStateObject.MAP[currentMapY][currentMapX];
        if (mapCell > 0) {
          wallHit = true;
          hitTextureId = mapCell;
          break;
        }
      }
      const originalHitTextureId = hitTextureId;

      //Skip if no wall hit within range
      if (originalHitTextureId === 0) {
        wallBottomY[screenColumnX] = HALF_HEIGHT;
        wallTopY[screenColumnX] = HALF_HEIGHT;
        //this means you never hit a wall
        continue;
      }

      //Perpendicular distance and true hit point
      let perpendicularDistance;
      if (wallSide === 0) {
        perpendicularDistance = sideDistanceX - deltaDistanceX;
      } else {
        perpendicularDistance = sideDistanceY - deltaDistanceY;
      }

      //True hit point from perpendicularDistance (front may clamp; sides use perpendicular distance)
      const hitPositionX = player.x + perpendicularDistance * rayDirectionX;
      const hitPositionY = player.y + perpendicularDistance * rayDirectionY;

      perpendicularDistance = Math.max(0.01, perpendicularDistance); //avoid div0
      //Needs to be | 0 because otherwise we get a float and wallLineHeight ends up slightly off

      const zid =
        ZONE_GRID_CACHE[currentMapY * gameStateObject.MAP_W + currentMapX] | 0;
      const floorDepth = gameStateObject.zones[zid]?.floorDepth ?? 0;

      if (!gameStateObject.zones[zid].isLiquid) {
        //The wall bottom should account for both the wall's floor depth AND the relative height of the player vs the wall
        eyeScale = HEIGHT * (2 - floorDepth - EYE) * 0.5;
      }

      //Clip walls to ceilings
      const faceX = currentMapX - (wallSide === 0 ? stepDirectionX : 0);
      const faceY = currentMapY - (wallSide === 1 ? stepDirectionY : 0);
      let faceZoneId = 0;
      if (
        faceX >= 0 &&
        faceY >= 0 &&
        faceX < gameStateObject.MAP_W &&
        faceY < gameStateObject.MAP_H
      ) {
        faceZoneId = ZONE_GRID_CACHE[faceY * gameStateObject.MAP_W + faceX] | 0;
      }
      const zoneId = faceZoneId >= 0 ? faceZoneId : zid | 0;

      //Derive horizontal texture coordinate from fractional part of true hit for proper mirroring
      let wallSideDirection;
      let textureCoordinateU;
      if (wallSide === 0) {
        //x-side (vertical wall): use fractional part of Y
        textureCoordinateU = hitPositionY - (hitPositionY | 0);

        if (stepDirectionX < 0) {
          wallSideDirection = DirectionEnum.EAST;
          textureCoordinateU = 1 - textureCoordinateU;
        } else {
          wallSideDirection = DirectionEnum.WEST;
        }
      } else {
        //y-side (horizontal wall): use fractional part of X
        textureCoordinateU = hitPositionX - (hitPositionX | 0);

        if (stepDirectionY > 0) {
          wallSideDirection = DirectionEnum.NORTH;
          textureCoordinateU = 1 - textureCoordinateU;
        } else {
          wallSideDirection = DirectionEnum.SOUTH;
        }
      }
      //Convert to texel column
      const textureColumnX = (textureCoordinateU * TEXTURE_HEIGHT) | 0;

      collectWalls(
        screenColumnX,
        zoneId,
        eyeScale,
        perpendicularDistance,
        wallSide,
        nowSec,
        wallSideDirection,
        textureColumnX,
        stepDirectionX,
        stepDirectionY,
        originalHitTextureId
      );
      //skip to next wall segment
      //iterationGuard += 1;
    }

    drawWalls();
    //#endregion
    //#region Far Wall Rendering
    //#endregion

    //Store distance for sprite depth testing
  }
}

function collectWalls(
  screenColumnX,
  zoneId,
  eyeScale,
  perpendicularDistance,
  wallSide,
  nowSec,
  wallSideDirection,
  textureColumnX,
  stepDirectionX,
  stepDirectionY,
  originalHitTextureId
) {
  const playerZoneId =
    ZONE_GRID_CACHE[player.y * gameStateObject.MAP_W + player.x] | 0;
  const playerZone = gameStateObject.zones[playerZoneId];
  const zone = gameStateObject.zones[zoneId];
  perpendicularDistance = Math.max(0.01, perpendicularDistance);
  const wallLineHeight = (HEIGHT / perpendicularDistance) | 0;
  const bottomY = (HALF_HEIGHT + eyeScale / perpendicularDistance) | 0; //floor-aligned
  const ceilingHeight = zone.ceilingHeight || 2;
  //Distance shading with Y-side darkening
  let shadeAmount =
    (1 / (1 + perpendicularDistance * 0.25)) * (wallSide ? 0.5 : 1);
  //Animated effect for flesh texture
  if (WALL_MAP[originalHitTextureId].animated) {
    shadeAmount *= 0.8 + 0.2 * Math.sin(nowSec * 6 + screenColumnX * 0.05);
  }
  const texPerPix = TEXTURE_HEIGHT / wallLineHeight;

  let tall = WALL_MAP[originalHitTextureId].height || 1;
  tall =
    ceilingHeight / 2 < tall && !playerZone.outside ? ceilingHeight / 2 : tall;
  let remaining = tall;

  let seg = 0;
  //Defined before loop
  let sliceBottom = bottomY;
  //#region Near Wall Rendering
  const segArray = [];
  while (remaining > 0) {
    //this segment’s height in "units" (1.0 for full slice, <1.0 for partial)
    const u = remaining >= 1 ? 1 : remaining;
    const partH = wallLineHeight * u;
    const sliceTop = sliceBottom - partH;

    //unitTopUnc is the top of the full unit this slice belongs to
    const unitTopUnc = sliceBottom - wallLineHeight;

    //start inside that unit (0..texH for full; (1-u)*texH for bottom partial; 0.. for top partial)
    let srcY = (sliceTop - unitTopUnc) * texPerPix;
    if (srcY < 0 || srcY > TEXTURE_HEIGHT) {
      srcY = ((srcY % TEXTURE_HEIGHT) + TEXTURE_HEIGHT) % TEXTURE_HEIGHT;
    }
    const srcH = (sliceBottom - sliceTop) * texPerPix;
    //pick texture id: base (seg 0) uses the hit; higher segments use your per-level list
    if (WALL_MAP[originalHitTextureId]?.textures?.ALL) {
      wallSideDirection = DirectionEnum.ALL;
    }

    const segTexId =
      WALL_MAP[originalHitTextureId]?.textures?.[wallSideDirection]?.[seg] ||
      "brick";
    //Select texture based on material ID
    const textureData = TEXCACHE[segTexId];
    const segment = {
      screenColumnX,
      sliceTop,
      sliceBottom,
      colLength: textureData.cols.length,
      textureColumnX,
      shadeAmount,
      srcY,
      srcH,
      segTexId,
      bottomY,
      wallLineHeight,
      perpendicularDistance,
      tall,
    };
    segArray.push(segment);
    //I now know the wall top for this column/row (segment)
    sliceBottom = sliceTop;
    remaining -= u;
    seg++;
  }
  wallSegmentBuffer.push(segArray);
}

/**
 * Preprocesses all segments to determine which are occluded by previously drawn walls.
 * Removes occluded segments from the array entirely for cleaner drawing logic.
 *
 * @param {number} minTopDrawn - The minimum Y coordinate already drawn
 * @returns {number} Updated minTopDrawn value after processing all segments
 */
function preprocessOcclusion(minTopDrawn) {
  for (let i = 0; i < wallSegmentBuffer.length; i++) {
    const segArray = wallSegmentBuffer[i];

    // Skip entire column if it's already occluded
    if (
      minTopDrawn !== undefined &&
      minTopDrawn <= segArray[segArray.length - 1].sliceTop
    ) {
      segArray.length = 0; // Clear the array
      continue;
    }

    // Filter out occluded segments from this column
    let writeIdx = 0;
    for (let j = 0; j < segArray.length; j++) {
      const segment = segArray[j];

      // Keep segment if NOT occluded
      if (minTopDrawn === undefined || minTopDrawn >= segment.sliceTop) {
        segArray[writeIdx++] = segment;
      }
    }
    segArray.length = writeIdx; // Trim array to only non-occluded segments

    // Update minTopDrawn based on remaining segments
    if (segArray.length > 0) {
      const nearTopFull =
        segArray[0].bottomY -
        segArray[0].wallLineHeight *
          (segArray[0].tall > 0 ? segArray[0].tall : 1);
      const lastSliceTop = segArray[segArray.length - 1].sliceTop;

      minTopDrawn =
        minTopDrawn === undefined
          ? Math.min(nearTopFull, lastSliceTop)
          : Math.min(minTopDrawn, nearTopFull, lastSliceTop);
    }
  }
  return minTopDrawn;
}

function drawWalls() {
  let minTopDrawn = undefined;
  minTopDrawn = preprocessOcclusion(minTopDrawn);
  for (let i = wallSegmentBuffer.length - 1; i >= 0; i--) {
    const segArray = wallSegmentBuffer[i];
    if (segArray.length === 0) {
      continue;
    } // Skip empty arrays
    for (let j = 0; j < segArray.length; j++) {
      const {
        screenColumnX,
        sliceTop,
        sliceBottom,
        colLength,
        textureColumnX,
        shadeAmount,
        srcY,
        srcH,
        segTexId,
        perpendicularDistance,
      } = segArray[j];

      drawWallColumnImg(
        ctx,
        screenColumnX,
        sliceTop,
        sliceBottom,
        colLength,
        textureColumnX,
        shadeAmount,
        srcY,
        srcH,
        segTexId
      );
      //Store perpendicular distance in sparse buffer for each Y from sliceTop to sliceBottom
      const wallScreenTop = sliceTop | 0;
      const wallScreenBottom = sliceBottom | 0;
      for (let py = wallScreenTop; py <= wallScreenBottom; py++) {
        if (py < 0 || py >= HEIGHT) {
          continue;
        }
        setPixelDepth(screenColumnX, py, perpendicularDistance);
      }
    }

    const nearTopFull =
      segArray[0].bottomY -
      segArray[0].wallLineHeight *
        (segArray[0].tall > 0 ? segArray[0].tall : 1);

    const fogY0 = nearTopFull;
    const fogY1 = segArray[0].bottomY;
    wallBottomY[segArray[0].screenColumnX] = fogY1;
    wallTopY[segArray[0].screenColumnX] = fogY0;
    drawFogBand(
      segArray[0].screenColumnX,
      fogY0,
      fogY1,
      segArray[0].perpendicularDistance
    );
  }
}

//#endregion
