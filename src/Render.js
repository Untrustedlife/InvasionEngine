//Main raycasting renderer - casts one ray per screen column using DDA algorithm
//Draws textured walls with distance shading and fills z-buffer for sprite occlusion
//Could just add a sprite loader (all walls are 64x64)
import { ctx, WIDTH, HEIGHT } from "./Dom.js";
import { NEAR, PROJ_NEAR, FOG_START_FRAC, FOG_COLOR } from "./Constants.js";
import { TEXCACHE, TEX, SHADE_LEVELS, SHADED_TEX } from "./Textures.js";
import { player } from "./Player.js";
import { gameStateObject, getZoneBaseRgb, zoneIdAt } from "./Map.js";
import { nearestIndexInAscendingOrder } from "./UntrustedUtils.js";
import { WALL_HEIGHT_MAP } from "./SampleGame/Walltextures.js";
//Z-buffer stores wall distances for sprite depth testing
export const zBuffer = new Float32Array(WIDTH);
export const HALF_HEIGHT = HEIGHT >> 1; //Bitwise shift is faster than division by 2
const wallBottomY = new Int16Array(WIDTH).fill(HALF_HEIGHT);
//Distance from camera to each screen row (used for floor projection)
//This keeps floors and walls aligned at any playerHeight without hacks.
const ROW_DIST = new Float32Array(HEIGHT);
function rebuildRowDistLUT() {
  const posZ = HALF_HEIGHT; //horizon line
  for (let y = 0; y < HEIGHT; y++) {
    const p = y - HALF_HEIGHT;
    ROW_DIST[y] =
      p !== 0 ? (posZ / p) * (2 - player.calculatePlayerHeight()) : 1e-6; //avoid div-by-0 on the horizon
  }
}
rebuildRowDistLUT();

//Gradient caches - arrays indexed by zone ID for O(1) access
export const CEILING_GRADIENT_CACHE = [];
export const FLOOR_FOG_GRADIENT_CACHE = [];
export const HAZE_GRADIENT_CACHE = [];
export const SIMPLE_FLOOR_GRADIENT_CACHE = [];
export const ZONE_GRID_CACHE = [];

//Clear all gradient caches (called when switching maps)
export function clearGradientCaches() {
  CEILING_GRADIENT_CACHE.length = 0;
  FLOOR_FOG_GRADIENT_CACHE.length = 0;
  HAZE_GRADIENT_CACHE.length = 0;
  SIMPLE_FLOOR_GRADIENT_CACHE.length = 0;
  ZONE_CSS.clear();
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

export function castCieling(ctx) {
  const px = player.x | 0;
  const py = player.y | 0;
  const zIndex = zoneIdAt(px, py, gameStateObject.zones);

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

export function castFloor(
  nowSec,
  cameraBasisVectors,
  screenColumnX,
  fromY = 0
) {
  const { dirX, dirY, planeX, planeY } = cameraBasisVectors;
  fromY = wallBottomY[screenColumnX] ?? 0;
  //never draw above the horizon
  const startY = fromY < HALF_HEIGHT ? HALF_HEIGHT : fromY;
  if (startY >= HEIGHT) {
    return;
  }

  //Ray for this column (same as walls)
  const camX = (2 * (screenColumnX + 0.5)) / WIDTH - 1;
  const rayX = dirX + planeX * camX;
  const rayY = dirY + planeY * camX;

  //Initialize world positions using first row distance
  //1 / cos(theta) to remove tiny fisheye on floor
  const invDot = 1 / (dirX * rayX + dirY * rayY);

  //Initialize world positions using first row *perp* distance, corrected
  let dist = ROW_DIST[startY];
  let wx = player.x + rayX * dist * invDot;
  let wy = player.y + rayY * dist * invDot;

  let lastZone = 0;
  let runStartY = startY;
  let lastStyle = null;

  //Walk rows, build a vertical scan based on the floors we can see
  for (let y = startY; y < HEIGHT; y++) {
    const ix = wx | 0;
    const iy = wy | 0;

    let zoneId = 0;
    if (startY === HALF_HEIGHT && y === HALF_HEIGHT) {
      zoneId = 0; //Horizon pixel, don't draw
    } else {
      zoneId =
        ix >= 0 &&
        iy >= 0 &&
        ix < gameStateObject.MAP_W &&
        iy < gameStateObject.MAP_H
          ? ZONE_GRID_CACHE[iy * gameStateObject.MAP_W + ix]
          : 0;
    }

    if (zoneId !== lastZone) {
      const color = zoneCss(lastZone);
      if (color !== lastStyle) {
        ctx.fillStyle = color;
        lastStyle = color;
      }
      ctx.fillRect(screenColumnX, runStartY, 1, y - runStartY);
      lastZone = zoneId;
      runStartY = y;
    }

    //step world coords using successive row distances
    const nextDist = ROW_DIST[y + 1] ?? dist;
    const delta = nextDist - dist;
    wx += rayX * delta * invDot;
    wy += rayY * delta * invDot;
    dist = nextDist;
  }

  //Flush tail run
  const color = zoneCss(lastZone);
  if (color !== lastStyle) {
    ctx.fillStyle = color;
  }
  ctx.fillRect(screenColumnX, runStartY, 1, HEIGHT - runStartY);
}

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

export function castFloorFog(ctx) {
  const y0 = HALF_HEIGHT - 1,
    h = HEIGHT - y0;
  const px = player.x | 0;
  const py = player.y | 0;
  const zIndex = zoneIdAt(px, py, gameStateObject.zones);

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
      wallBottomY[screenColumnX] = 0;
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
      wallBottomY[screenColumnX] = 0;
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

    //Draw wall column using fast canvas method
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

    const tall = WALL_HEIGHT_MAP[hitTextureId] || 1;
    if (tall > 1) {
      const segH = wallLineHeight; // one unit wall height on screen
      const texH = (textureCanvas?.height || textureData.h || 64) | 0;
      const texPerPix = texH / Math.max(1, segH);

      // how many EXTRA full repeats above the base slice
      const fullRepeats = Math.floor(tall) - 1;

      // draw each full extra slice (each maps full 0..texH to segH pixels)
      for (let i = 0; i < fullRepeats; i++) {
        const topUnc = unclippedStartY - segH * (i + 1);
        const botUnc = unclippedEndY - segH * (i + 1);

        const y0 = Math.max(0, Math.ceil(topUnc));
        const y1 = Math.min(HEIGHT, Math.floor(botUnc));
        const visH = y1 - y0;
        if (visH <= 0) {
          continue;
        }

        const srcY = (y0 - topUnc) * texPerPix; // 0..texH (trimmed if clipped)
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

      // partial top slice for fractional heights (e.g. tall=2.4 → draws 0.4 of a unit)
      const remFrac = tall - (1 + fullRepeats);
      if (remFrac > 1e-6) {
        const partH = segH * remFrac;
        const topUnc = unclippedStartY - segH * (fullRepeats + 1);
        const botUnc = topUnc + partH;

        const y0 = Math.max(0, Math.ceil(topUnc));
        const y1 = Math.min(HEIGHT, Math.floor(botUnc));
        const visH = y1 - y0;
        if (visH > 0) {
          const srcY = (y0 - topUnc) * texPerPix; // maps 0..texH*remFrac over the partial
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
        const zIndex = zoneIdAt(px, py, gameStateObject.zones);
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
