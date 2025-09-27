/**
 * @fileoverview Main raycasting renderer - casts one ray per screen column using DDA algorithm.
 * Draws textured walls with distance shading and fills z-buffer for sprite occlusion.
 * This is the core rendering engine that handles wall casting, floor/ceiling projection,
 * gradient caching, and fog effects.
 */

import { ctx, WIDTH, HEIGHT } from "./Dom.js";
import { NEAR, PROJ_NEAR, FOG_START_FRAC, FOG_COLOR } from "./Constants.js";
import { TEXCACHE, TEX, SHADE_LEVELS, SHADED_TEX } from "./Textures.js";
import { player } from "./Player.js";
import {
  gameStateObject,
  getZoneBaseRgb,
  getZoneCielingRgb,
  zoneIdAt,
} from "./Map.js";
import { nearestIndexInAscendingOrder } from "./UntrustedUtils.js";
import { WALL_HEIGHT_MAP } from "./SampleGame/Walltextures.js";

/**
 * Z-buffer stores wall distances for sprite depth testing. Each index corresponds
 * to a screen column and contains the perpendicular distance to the nearest wall.
 *
 * **Used by:**
 * - `Main.js`: Sprites check `zBuffer[screenColumn]` to determine if they should
 *   render in front of or behind walls for proper depth sorting
 * - `Gameplay.js`: Uses `zBuffer[center]` to get wall distance at screen center
 *   for interaction range calculations and entity targeting
 *
 * @type {Float32Array} Array of wall distances indexed by screen column
 */
export const zBuffer = new Float32Array(WIDTH);

/**
 * Half screen height, computed as HEIGHT >> 1 for performance (bitwise shift is faster than division).
 * This represents the horizon line and is used extensively throughout rendering calculations.
 *
 * **Used by:**
 * - `Main.js`: Used as horizon reference for floor gradient calculations and screen space positioning
 * - **Internally**: Used as default wall bottom/top positions, gradient boundaries, fog calculations,
 *   and as the reference point for floor/ceiling projection mathematics
 *
 * @type {number} Half of screen height (horizon line)
 */
export const HALF_HEIGHT = HEIGHT >> 1; //Bitwise shift is faster than division by 2

/** @private Internal buffer storing bottom Y position of walls for each screen column */
const wallBottomY = new Int16Array(WIDTH).fill(HALF_HEIGHT);

/** @private Internal buffer storing top Y position of walls for each screen column */
const wallTopY = new Int16Array(WIDTH).fill(HALF_HEIGHT);

//Distance from camera to each screen row (used for floor projection)
//This keeps floors and walls aligned at any playerHeight without hacks.
const ROW_DIST = new Float32Array(HEIGHT);
const CIELING_ROW_DIST = new Float32Array(HEIGHT);
//idd will be key for zone ID, value will be precomputed row distance array
const ROW_DIST_BY_ZONE = {};
const CILEING_DIST_BY_ZONE = {};

/**
 * Rebuilds row distance lookup tables for floor and ceiling projection.
 * Precomputes distance from camera to each screen row, accounting for player height
 * and zone-specific floor depths and ceiling heights. This ensures floors and walls
 * remain properly aligned regardless of player height without runtime hacks.
 *
 * **Used by:**
 * - `Main.js`: Called during map loading/switching and when player height changes
 *   to ensure projection mathematics remain accurate
 *
 * @export
 */
export function rebuildRowDistLUT() {
  // Clear previous per-zone tables
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
      CILEING_DIST_BY_ZONE[i] = new Float32Array(HEIGHT); // Allocate the array first
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
      ROW_DIST_BY_ZONE[i] = new Float32Array(HEIGHT); // Allocate the array first
      for (let y = 0; y < HEIGHT; y++) {
        const dy = y - horizon; //>0 below horizon
        ROW_DIST_BY_ZONE[i][y] = dy !== 0 ? newEyeScale / dy : 1e-6; //avoid div-by-zero
      }
    }
  }
}

rebuildRowDistLUT();

//Gradient caches - arrays indexed by zone ID for O(1) access
export const CEILING_GRADIENT_CACHE = [];
export const FLOOR_FOG_GRADIENT_CACHE = [];
export const HAZE_GRADIENT_CACHE = [];
export const SIMPLE_FLOOR_GRADIENT_CACHE = [];
export const ZONE_GRID_CACHE = [];

export const CIELING_FOG_GRADIENT_CACHE = [];

/**
 * Clears all gradient caches and zone color caches. Essential for preventing
 * memory leaks and visual artifacts when switching between maps with different
 * zone configurations, colors, or lighting schemes.
 *
 * **Used by:**
 * - `Main.js`: Called during map transitions to ensure clean state and prevent
 *   stale gradients from previous maps from being used inappropriately
 *
 * @export
 */
export function clearGradientCaches() {
  CEILING_GRADIENT_CACHE.length = 0;
  FLOOR_FOG_GRADIENT_CACHE.length = 0;
  HAZE_GRADIENT_CACHE.length = 0;
  SIMPLE_FLOOR_GRADIENT_CACHE.length = 0;
  CIELING_FOG_GRADIENT_CACHE.length = 0;
  ZONE_CSS.clear();
  ZONE_CIELING_CSS.clear();
}

//Wall slice draw: sample a 1px-wide column from the source texture
//and scale to the destination height using drawImage. Apply uniform shading
//via Canvas2D filter brightness for speed. This avoids per-pixel ImageData work.
//srcY/srcH select the portion of the source column to map to the visible segment
function drawWallColumnImg(
  g,
  x,
  y0,
  y1,
  texCanvas,
  texX,
  shade,
  srcY,
  srcH,
  texId
) {
  if (!texCanvas) {
    return;
  }
  const columnHeight = y1 - y0;

  if (columnHeight <= 0) {
    return;
  }

  //Draw the column slice
  const rawSourceY = srcY || 0;

  const clampedSourceY =
    rawSourceY < 0
      ? 0
      : rawSourceY > texCanvas.height
      ? texCanvas.height
      : rawSourceY;

  const rawSourceHeight = srcH || texCanvas.height;
  const maxAllowedHeight = texCanvas.height - clampedSourceY;

  const clampedSourceHeight =
    rawSourceHeight < 0
      ? 0
      : rawSourceHeight > maxAllowedHeight
      ? maxAllowedHeight
      : rawSourceHeight;

  //Use pre-shaded texture
  //This can make animated textures act a bit weird. In RC Invasion I skip it
  //for texture 7 (the animated one). Here it’s fine, I’m pushing a bit more perf.
  const closestShade = nearestIndexInAscendingOrder(SHADE_LEVELS, shade);
  g.drawImage(
    SHADED_TEX[texId][SHADE_LEVELS[closestShade]],
    texX,
    clampedSourceY,
    1,
    clampedSourceHeight,
    x,
    y0,
    1,
    columnHeight
  );
}

//Draw sprite column with alpha blending - preserves transparency
const SPRITE_Y_ORIGIN_BOTTOM = false;

/**
 * Renders a simple gradient-based ceiling using zone-specific colors.
 * Creates a linear gradient from top to horizon with configurable colors
 * for front, back, and fog zones. Uses caching for performance.
 *
 * **Used by:**
 * - `Main.js`: Called as alternative ceiling renderer when zone count <= 2
 *   for simpler maps that don't require complex per-pixel ceiling projection
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D rendering context
 * @export
 */
export function classicCastCieling(ctx) {
  const px = player.x | 0;
  const py = player.y | 0;
  const zIndex =
    ZONE_GRID_CACHE.length > 0
      ? ZONE_GRID_CACHE[py * gameStateObject.MAP_W + px]
      : 0;

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
 * Pre-computes and caches zone IDs for every map grid position.
 * Builds a flat array indexed by (y * MAP_W + x) containing zone IDs for
 * ultra-fast O(1) zone lookups during floor/ceiling rendering, avoiding
 * repeated expensive zoneIdAt() calculations during the render loop.
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

/**
 * Renders floor projection for a single screen column using ray casting.
 * Projects floor textures/colors by casting a ray from camera through each screen row,
 * computing world coordinates and sampling zone colors. Uses precomputed distance
 * tables for efficient perspective-correct projection with fog culling support.
 *
 * **Used by:**
 * - `Main.js`: Called in the main render loop for each screen column to draw
 *   floors that appear below the horizon line and below rendered walls
 *
 * @param {number} nowSec - Current time in seconds for potential animation effects
 * @param {Object} cameraBasisVectors - Camera direction and plane vectors {dirX, dirY, planeX, planeY}
 * @param {number} screenColumnX - Screen column X coordinate to render
 * @param {number} fromY - Starting Y position (defaults to wall bottom or horizon)
 * @export
 */
export function castFloor(
  nowSec,
  cameraBasisVectors,
  screenColumnX,
  fromY = 0
) {
  const { dirX, dirY, planeX, planeY } = cameraBasisVectors;

  fromY = wallBottomY[screenColumnX] ?? HALF_HEIGHT;
  const startY = fromY < HALF_HEIGHT ? HALF_HEIGHT : fromY;
  if (startY >= HEIGHT) {
    return;
  }
  const camX = (2 * (screenColumnX + 0.5)) / WIDTH - 1;
  const rayX = dirX + planeX * camX;
  const rayY = dirY + planeY * camX;
  const invDot = 1 / (dirX * rayX + dirY * rayY);

  // Skip fogged rows at the top of the floor span
  let y0 = startY;
  if (player.sightDist > 0) {
    while (y0 < HEIGHT && (ROW_DIST[y0] ?? Infinity) > player.sightDist) {
      y0++;
    }
  }
  if (y0 >= HEIGHT) {
    return;
  } // nothing visible in this column

  // Init from first visible row
  let dist = ROW_DIST[y0];
  let wx = player.x + rayX * dist * invDot;
  let wy = player.y + rayY * dist * invDot;

  let runStartY = y0;
  let lastStyle = null;
  let lastZoneId = 0;
  // Walk visible rows only
  for (let y = y0; y < HEIGHT; y++) {
    const ix = wx | 0;
    const iy = wy | 0;
    const zoneId =
      ix >= 0 &&
      iy >= 0 &&
      ix < gameStateObject.MAP_W &&
      iy < gameStateObject.MAP_H
        ? ZONE_GRID_CACHE[iy * gameStateObject.MAP_W + ix]
        : lastZoneId;

    if (zoneId !== lastZoneId) {
      const color = zoneCss(lastZoneId);
      if (color !== lastStyle) {
        ctx.fillStyle = color;
        lastStyle = color;
      }
      ctx.fillRect(screenColumnX, runStartY, 1, y - runStartY);
      lastZoneId = zoneId;
      runStartY = y;
    }

    const nextDist = ROW_DIST[y + 1] ?? dist;
    const delta = nextDist - dist; // (negative for floor)
    wx += rayX * delta * invDot;
    wy += rayY * delta * invDot;
    dist = nextDist;
  }

  // Flush tail
  const color = zoneCss(lastZoneId);
  if (color !== lastStyle) {
    ctx.fillStyle = color;
  }
  ctx.fillRect(screenColumnX, runStartY, 1, HEIGHT - runStartY);
}
/**
 * Renders ceiling projection for a single screen column using ray casting.
 * Projects ceiling colors by casting a ray from camera through each screen row above
 * the horizon, computing world coordinates and sampling zone ceiling colors. Uses
 * zone-specific ceiling heights and precomputed distance tables for proper projection.
 *
 * **Used by:**
 * - `Main.js`: Called in the main render loop for each screen column to draw
 *   ceilings that appear above the horizon line and above rendered walls
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
  const endY = wallTopY[screenColumnX] ?? HALF_HEIGHT;
  const startY = 0; // top of screen
  if (endY <= 0) {
    return;
  } // nothing to draw
  //Ray for this column (same as walls)
  const camX = (2 * (screenColumnX + 0.5)) / WIDTH - 1;
  const rayX = dirX + planeX * camX;
  const rayY = dirY + planeY * camX;
  //Initialize world positions using first row distance
  //1 / cos(theta) to remove tiny fisheye on floor
  const invDot = 1 / (dirX * rayX + dirY * rayY);
  //Initialize world positions using first row *perp* distance, corrected
  let lastZone = 0;
  let dist =
    CILEING_DIST_BY_ZONE?.[lastZone]?.[startY] ?? CIELING_ROW_DIST[startY];

  let wx = player.x + rayX * dist * invDot;
  let wy = player.y + rayY * dist * invDot;
  let runStartY = startY;
  let lastStyle = null;
  //Walk rows, build a vertical scan based on the floors we can see
  for (let y = startY; y < endY; y++) {
    if (player.sightDist > 0 && Math.abs(dist) > player.sightDist) {
      // flush up to the fog line and stop
      const color = zoneCielingCss(lastZone);
      if (color !== lastStyle) {
        ctx.fillStyle = color;
      }
      ctx.fillRect(screenColumnX, runStartY, 1, y - runStartY);
      return; // <- important: no tail fill beyond fog
    }
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

/**
 * Renders atmospheric haze effect as a subtle gradient overlay across the entire screen.
 * Creates a dark blue tinted gradient that's strongest at the bottom, providing depth
 * and atmosphere to the 3D environment. Uses caching for performance optimization.
 *
 * **Used by:**
 * - `Main.js`: Called during the render loop to add atmospheric depth and mood
 *   to the scene before sprites are rendered
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas 2D rendering context
 * @export
 */
export function castHaze(ctx) {
  //Check cache first
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

/**
 * Renders floor fog effect using zone-specific fog colors.
 * Creates a gradient that starts near the horizon and fades to transparent
 * at the bottom, providing atmospheric depth to floor areas. Uses per-zone
 * caching for performance and supports zone-specific fog colors.
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
  const zIndex =
    ZONE_GRID_CACHE.length > 0
      ? ZONE_GRID_CACHE[py * gameStateObject.MAP_W + px]
      : 0;

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

/**
 * Renders ceiling fog effect using zone-specific colors and atmospheric blending.
 * Creates a gradient from transparent at top to fog color near horizon, providing
 * atmospheric depth to ceiling areas. The effect is strongest near the horizon line
 * where ceiling meets the distance, enhancing the sense of depth and atmosphere.
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
  const zIndex =
    ZONE_GRID_CACHE.length > 0
      ? ZONE_GRID_CACHE[py * gameStateObject.MAP_W + px]
      : 0;

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
    g.addColorStop(0.0, "rgba(0,0,0,0)"); // fully clear at top
    g.addColorStop(0.85, skyBack); // tint near horizon
    g.addColorStop(0.95, fogColor); // strongest at horizon

    CIELING_FOG_GRADIENT_CACHE[zIndex] = g;
  }

  ctx.fillStyle = g;
  ctx.fillRect(0, y0, WIDTH, h);
}

/**
 * Renders wall geometry using DDA raycasting algorithm with textured columns.
 * Casts one ray per screen column, traces through the map grid until hitting walls,
 * then renders textured wall slices with distance shading, fog effects, and proper
 * UV mapping. Fills the z-buffer for sprite depth sorting and handles variable wall heights.
 * This is the core 3D wall rendering function that creates the pseudo-3D environment.
 *
 * **Used by:**
 * - `Main.js`: Called as the primary wall renderer in the main render loop,
 *   executed after clearing but before floor/ceiling and sprite rendering
 *
 * @param {number} nowSec - Current time in seconds for texture animation effects
 * @param {Object} cameraBasisVectors - Camera direction and plane vectors {dirX, dirY, planeX, planeY}
 * @param {Array<Array<number>>} MAP - 2D map array where non-zero values represent wall texture IDs
 * @param {number} MAP_W - Map width in grid cells
 * @param {number} MAP_H - Map height in grid cells
 * @export
 */
export function castWalls(nowSec, cameraBasisVectors, MAP, MAP_W, MAP_H) {
  const { dirX, dirY, planeX, planeY } = cameraBasisVectors; //Camera forward and plane vectors.

  //Cast one ray per screen column
  for (let screenColumnX = 0; screenColumnX < WIDTH; screenColumnX++) {
    //Map screen X to camera plane [-1, +1], offset by 0.5 to center pixel
    const cameraPlaneX = (2 * (screenColumnX + 0.5)) / WIDTH - 1;
    const rayDirectionX = dirX + planeX * cameraPlaneX;
    const rayDirectionY = dirY + planeY * cameraPlaneX;

    //Skip rays with near-zero direction immediately
    if (
      rayDirectionX < 1e-8 &&
      rayDirectionX > -1e-8 &&
      rayDirectionY < 1e-8 &&
      rayDirectionY > -1e-8
    ) {
      zBuffer[screenColumnX] = Number.POSITIVE_INFINITY;
      wallBottomY[screenColumnX] = HALF_HEIGHT;
      wallTopY[screenColumnX] = wallTopY[screenColumnX - 1];
      continue;
    }

    const rayDirXRecip = 1 / (rayDirectionX || 1e-9);
    const rayDirYRecip = 1 / (rayDirectionY || 1e-9);

    //DDA setup - current map position
    let currentMapX = player.x | 0;
    let currentMapY = player.y | 0;

    //Distance to cross one grid cell (inline abs() for performance (called 320+ times per frame))
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
    let culledApproximateDistance = 0;

    //DDA stepping - advance to next grid boundary until wall hit
    while (!wallHit && iterationGuard++ < 256) {
      if (sideDistanceX < sideDistanceY) {
        sideDistanceX += deltaDistanceX;
        currentMapX += stepDirectionX;
        wallSide = 0;
      } else {
        sideDistanceY += deltaDistanceY;
        currentMapY += stepDirectionY;
        wallSide = 1;
      }

      //Far plane culling
      if (player.sightDist > 0) {
        const approximateDistance = Math.min(sideDistanceX, sideDistanceY);
        if (approximateDistance > player.sightDist) {
          wallHit = false;
          hitTextureId = 0;
          culledApproximateDistance = approximateDistance;
          break;
        }
      }

      //Map bounds check
      //Also places bricks on outside edge of map. (Could make customizable based on map)
      if (
        currentMapX < 0 ||
        currentMapY < 0 ||
        currentMapX >= MAP_W ||
        currentMapY >= MAP_H
      ) {
        wallHit = true;
        hitTextureId = 1;
        break;
      }

      //Wall hit check
      const mapCell = MAP[currentMapY][currentMapX];
      if (mapCell > 0) {
        wallHit = true;
        hitTextureId = mapCell;
        break;
      }
    }

    //Skip if no wall hit within range
    if (hitTextureId === 0) {
      zBuffer[screenColumnX] = Number.POSITIVE_INFINITY;
      wallBottomY[screenColumnX] = HALF_HEIGHT;
      wallTopY[screenColumnX] = wallTopY[screenColumnX - 1];
      continue;
    }

    //Perpendicular distance (fisheye-corrected) and true hit point
    let perpendicularDistance;
    if (wallSide === 0) {
      perpendicularDistance = sideDistanceX - deltaDistanceX;
    } else {
      perpendicularDistance = sideDistanceY - deltaDistanceY;
    }
    perpendicularDistance =
      NEAR > perpendicularDistance ? NEAR : perpendicularDistance;

    //For UVs: keep front-wall stabilization only; no side pushing
    const UV_NEAR_DISTANCE = 0.0; //front-facing stabilization (center)
    const normalXForward = wallSide === 0 ? stepDirectionX : 0;
    const normalYForward = wallSide === 1 ? stepDirectionY : 0;
    const incidenceForward = Math.abs(
      normalXForward * dirX + normalYForward * dirY
    );
    const FRONT_INCIDENCE = 0.9;
    const CAMERA_CENTER = 0.9;
    const isFrontFacing =
      incidenceForward >= FRONT_INCIDENCE &&
      Math.abs(cameraPlaneX) <= CAMERA_CENTER;

    const distanceForUV =
      isFrontFacing && perpendicularDistance < UV_NEAR_DISTANCE
        ? UV_NEAR_DISTANCE
        : perpendicularDistance;

    //True hit point from distanceForUV (front may clamp; sides use perpendicular distance)
    const hitPositionX = player.x + distanceForUV * rayDirectionX;
    const hitPositionY = player.y + distanceForUV * rayDirectionY;

    //Derive horizontal texture coordinate from fractional part of true hit
    let textureCoordinateU;
    if (wallSide === 0) {
      //x-side (vertical wall): use fractional part of Y
      textureCoordinateU = hitPositionY - (hitPositionY | 0); //bitwise or (For positive)  is same as math.floor
    } else {
      //y-side (horizontal wall): use fractional part of X
      textureCoordinateU = hitPositionX - (hitPositionX | 0); //bitwise or (For positive)  is same as math.floor
    }
    //Fast clamp to [0, 0.999999] range
    textureCoordinateU =
      textureCoordinateU < 0
        ? 0
        : textureCoordinateU > 0.999999
        ? 0.999999
        : textureCoordinateU + 1e-6;

    //Select texture based on material ID
    const textureData = TEXCACHE[hitTextureId] || TEXCACHE[4];
    const textureCanvas = TEX[hitTextureId];
    const textureWidth = textureCanvas
      ? textureCanvas.width | 0
      : textureData.w | 0;

    //Convert to texel column and apply direction-based flip
    let textureColumnX = (textureCoordinateU * textureWidth) | 0; //bitwise or (For positive)  is same as math.floor
    //Flip only by step/side rule to keep u monotonic across a wall face
    if (
      (wallSide === 0 && stepDirectionX > 0) ||
      (wallSide === 1 && stepDirectionY < 0)
    ) {
      textureColumnX = textureWidth - textureColumnX - 1;
    }
    //Fast clamp to texture bounds
    textureColumnX =
      textureColumnX < 0
        ? 0
        : textureColumnX >= textureWidth
        ? textureWidth - 1
        : textureColumnX;

    //Project wall height to screen space
    const projectionDistance =
      perpendicularDistance < PROJ_NEAR ? PROJ_NEAR : perpendicularDistance; //Faster than Math.max
    let wallLineHeight = (HEIGHT / projectionDistance) | 0;

    //Compute unclipped vertical segment and derive texture source window for any clipping
    const unclippedStartY =
      ((HEIGHT - wallLineHeight * player.calculatePlayerHeight()) / 2) | 0;
    const unclippedEndY = unclippedStartY + wallLineHeight;
    let drawStartY = unclippedStartY;
    let drawEndY = unclippedEndY;
    if (drawStartY < 0) {
      drawStartY = 0;
    }
    if (drawEndY > HEIGHT) {
      drawEndY = HEIGHT;
    }
    const visibleHeight = drawEndY - drawStartY;
    wallBottomY[screenColumnX] = drawEndY;
    //Draw wall column using fast canvas method
    const tall = WALL_HEIGHT_MAP[hitTextureId] || 1;
    wallTopY[screenColumnX] = drawStartY * tall;
    if (visibleHeight <= 0) {
      zBuffer[screenColumnX] = perpendicularDistance;
      continue;
    }
    const textureHeight =
      (textureCanvas
        ? textureCanvas.height
        : textureData.h || TEX[hitTextureId]?.height || 64) | 0;
    const sourceY =
      (drawStartY - unclippedStartY) *
      (textureHeight / (wallLineHeight > 1 ? wallLineHeight : 1));
    const sourceHeight =
      visibleHeight * (textureHeight / Math.max(1, wallLineHeight));

    //Distance shading with Y-side darkening
    let shadeAmount =
      (1 / (1 + perpendicularDistance * 0.25)) * (wallSide ? 0.5 : 1);

    //Animated effect for flesh texture
    if (hitTextureId === 7) {
      shadeAmount *= 0.8 + 0.2 * Math.sin(nowSec * 6 + screenColumnX * 0.05);
    }

    if (tall == 1.0) {
      drawWallColumnImg(
        ctx,
        screenColumnX,
        drawStartY,
        drawEndY,
        textureCanvas,
        textureColumnX,
        shadeAmount,
        sourceY,
        sourceHeight,
        hitTextureId
      );
    } else if (tall > 1) {
      drawWallColumnImg(
        ctx,
        screenColumnX,
        drawStartY,
        drawEndY,
        textureCanvas,
        textureColumnX,
        shadeAmount,
        sourceY,
        sourceHeight,
        hitTextureId
      );

      const segH = wallLineHeight; //one unit wall height on screen
      const texH = (textureCanvas?.height || textureData.h || 64) | 0;
      const texPerPix = texH / Math.max(1, segH);

      //how many EXTRA full repeats above the base slice
      const fullRepeats = Math.floor(tall) - 1;

      //draw each full extra slice (each maps full 0..texH to segH pixels)
      for (let i = 0; i < fullRepeats; i++) {
        const topUnc = unclippedStartY - segH * (i + 1);
        const botUnc = unclippedEndY - segH * (i + 1);

        const y0 = Math.max(0, Math.ceil(topUnc));
        const y1 = Math.min(HEIGHT, Math.floor(botUnc));
        const visH = y1 - y0;
        if (visH <= 0) {
          continue;
        }

        const srcY = (y0 - topUnc) * texPerPix; //0..texH (trimmed if clipped)
        const srcH = visH * texPerPix;

        drawWallColumnImg(
          ctx,
          screenColumnX,
          y0,
          y1,
          textureCanvas,
          textureColumnX,
          shadeAmount,
          srcY,
          srcH,
          1
        );
      }

      //partial bottom slice for fractional heights
      const remFrac = tall - (1 + fullRepeats);
      if (remFrac > 1e-6) {
        const partH = segH * remFrac;
        //bottom of the partial slice = top of the last full slice
        const botUnc = unclippedStartY - segH * fullRepeats;
        const topUnc = botUnc - partH; //grow up from bottom
        //clip
        const y0 = Math.max(0, Math.ceil(topUnc));
        const y1 = Math.min(HEIGHT, Math.floor(botUnc));
        const visH = y1 - y0;
        if (visH > 0) {
          const unitTopUnc = botUnc - segH;
          let srcY = ((y0 - unitTopUnc) * texPerPix) % texH;
          if (srcY < 0) {
            srcY += texH;
          }
          const srcH = visH * texPerPix;

          drawWallColumnImg(
            ctx,
            screenColumnX,
            y0,
            y1,
            textureCanvas,
            textureColumnX,
            shadeAmount,
            srcY,
            srcH,
            1
          );
        }
      }
    } else if (tall < 1.0) {
      const segH = wallLineHeight; //one unit wall height on screen
      const texH = (textureCanvas?.height || textureData.h || 64) | 0;
      const texPerPix = texH / Math.max(1, segH);

      const remFrac = tall;
      if (remFrac > 1e-6) {
        const partH = segH * remFrac;
        //bottom of the partial slice = top of the last full slice
        const botUnc = unclippedEndY;
        const topUnc = botUnc - partH; //grow up from bottom
        //clip
        const y0 = Math.max(0, Math.ceil(topUnc));
        const y1 = Math.min(HEIGHT, Math.floor(botUnc));
        const visH = y1 - y0;
        if (visH > 0) {
          const unitTopUnc = botUnc - segH;
          let srcY = ((y0 - unitTopUnc) * texPerPix) % texH;
          if (srcY < 0) {
            srcY += texH;
          }
          const srcH = visH * texPerPix;

          drawWallColumnImg(
            ctx,
            screenColumnX,
            y0,
            y1,
            textureCanvas,
            textureColumnX,
            shadeAmount,
            srcY,
            srcH,
            hitTextureId
          );
        }
      }
    }
    //Apply distance fog
    if (
      player.sightDist > 0 &&
      perpendicularDistance > player.sightDist * FOG_START_FRAC
    ) {
      const fogStartDistance = player.sightDist * FOG_START_FRAC;
      const fogEndDistance = player.sightDist;
      const fogLerpFactor = Math.min(
        1,
        Math.max(
          0,
          (perpendicularDistance - fogStartDistance) /
            Math.max(1e-6, fogEndDistance - fogStartDistance)
        )
      );
      if (fogLerpFactor > 0) {
        const px = player.x | 0;
        const py = player.y | 0;
        const zIndex =
          ZONE_GRID_CACHE.length > 0
            ? ZONE_GRID_CACHE[py * gameStateObject.MAP_W + px]
            : 0;
        ctx.save();
        ctx.globalAlpha = fogLerpFactor * 0.85;
        ctx.fillStyle = gameStateObject.zones[zIndex].fogColor || FOG_COLOR;
        ctx.fillRect(screenColumnX, drawStartY, 1, drawEndY - drawStartY);
        ctx.restore();
      }
    }

    //Store distance for sprite depth testing
    zBuffer[screenColumnX] = perpendicularDistance;
  }
}
