//Main game loop and rendering orchestrator
//Handles frame loop, wall/sprite rendering with z-buffer occlusion, HUD, and game state
import { canvas } from "./Dom.js";
import {
  FOG_START_FRAC,
  START_HEALTH,
  FAR_PLANE,
  FOG_COLOR,
} from "./Constants.js";
import { ctx, WIDTH, HEIGHT, cMini, offscreen, vctx } from "./Dom.js";
import { cameraBasis } from "./Camera.js";
import {
  castWalls,
  zBuffer,
  castFloor,
  castCieling,
  classicCastCieling,
  castHaze,
  SIMPLE_FLOOR_GRADIENT_CACHE,
  clearGradientCaches,
  castFloorFog,
  cacheZoneIdAtGrid,
  rebuildRowDistLUT,
  castCielingFog,
  ZONE_GRID_CACHE,
} from "./Render.js";
import { projectSprite } from "./Projection.js";
import { sprites, spriteEnum, loadAsyncSprites } from "./Sprites.js";
import { player } from "./Player.js";
import { drawMinimap } from "./Minimap.js";
import {
  wireInput,
  move,
  updateAI,
  autoPickup,
  checkExit,
  tickMsg,
  checkGameOver,
  tickGameOver,
  resetLevel,
  placeSprites,
  updateBars,
  buildEmptyTilesOnce,
} from "./Gameplay.js";
import { rollDice, chooseRandomElementFromArray } from "./UntrustedUtils.js";
import { gameStateObject, mapDefinitions, EXIT_POS, START_POS } from "./Map.js";
import { initAsyncTextures } from "./Textures.js";
import { updateVisualEffects, renderVisualEffects } from "./Effects.js";
let last = performance.now();

const coolDowns = new Map();
export function tryCooldown(key, intervalMS = 0) {
  if (intervalMS === 0) {
    if (last < coolDowns.get(key)) {
      return false;
    } else {
      return true;
    }
  }
  const now = last,
    next = coolDowns.get(key) ?? 0;
  if (now < next) {
    return false;
  }
  coolDowns.set(key, now + intervalMS);
  return true;
}

export function resetCooldown(key) {
  coolDowns.set(key, performance.now());
}

const HALF_HEIGHT = HEIGHT >> 1;

//Wire inputs
wireInput(canvas);

//FPS counter
let smoothFps = 0;
function drawFPS(fps) {
  const text = `FPS: ${Math.round(fps)}`;
  ctx.save();
  ctx.font = "12px monospace";
  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  const x = WIDTH - 8;
  const y = 6;
  const w = ctx.measureText(text).width + 8;
  const h = 16;

  ctx.fillStyle = "rgba(10, 15, 25, 0.6)";
  ctx.fillRect(x - w, y - 2, w, h);
  ctx.strokeStyle = "rgba(60, 80, 130, 0.9)";
  ctx.strokeRect(x - w + 0.5, y - 2 + 0.5, w - 1, h - 1);

  ctx.fillStyle = "#dfe6ff";
  ctx.fillText(text, x, y);
  ctx.restore();
}

//Initializer function for game entry

export function ChangeMapLevel(specificLevel = -1) {
  let chosenMapDefinition;
  if (specificLevel !== -1) {
    const mapDef = mapDefinitions[specificLevel];
    if (mapDef) {
      chosenMapDefinition = mapDef.dontPersist
        ? JSON.parse(JSON.stringify(mapDef))
        : mapDef;
    }
  } else {
    const mapDef = chooseRandomElementFromArray(mapDefinitions);
    if (mapDef) {
      chosenMapDefinition = mapDef.dontPersist
        ? JSON.parse(JSON.stringify(mapDef))
        : mapDef;
    }
  }

  EXIT_POS.x = chosenMapDefinition.exitPos.x;
  EXIT_POS.y = chosenMapDefinition.exitPos.y;
  START_POS.x = chosenMapDefinition.startPos.x;
  START_POS.y = chosenMapDefinition.startPos.y;

  //Initialize game state with chosen map
  player.sightDist = chosenMapDefinition.sightDist || FAR_PLANE;
  gameStateObject.cielingColorFront =
    chosenMapDefinition.cielingColorFront || "#6495ED";
  gameStateObject.floorColorFront =
    chosenMapDefinition.floorColorFront || "#054213";
  gameStateObject.cielingColorBack =
    chosenMapDefinition.cielingColorBack || "#6495ED";
  gameStateObject.floorColorBack =
    chosenMapDefinition.floorColorBack || "#03210A";

  gameStateObject.MAP = chosenMapDefinition.mapLayout;
  gameStateObject.MAP_W = gameStateObject.MAP[0].length;
  gameStateObject.MAP_H = gameStateObject.MAP.length;
  gameStateObject.zones = chosenMapDefinition.zones;

  buildEmptyTilesOnce();
  clearGradientCaches();
  cacheZoneIdAtGrid();
  rebuildRowDistLUT();
  player.x = player.x = chosenMapDefinition.startPos.x;
  player.y = chosenMapDefinition.startPos.y;
}

async function init() {
  await loadAsyncSprites();
  await initAsyncTextures();
  ChangeMapLevel(0);
  //assets pack
  resetLevel();
  //D&D Style starting health
  player.maxHealth = START_HEALTH + rollDice(6);
  player.health = player.maxHealth;
  player.ammo = 5 + rollDice(5);

  //Update bars
  updateBars();
  requestAnimationFrame(loop);
}

//Main 3D scene rendering with z-buffer occlusion
function castAndDraw(nowSec) {
  const cameraBasisVectors = cameraBasis();

  if (gameStateObject.zones.length <= 2) {
    classicCastCieling(ctx);
  } else {
    //TODO: Replace with single draw call + gradient fill for performance (Eventually. Not a priority)
    for (let x = 0; x < WIDTH; x++) {
      castCieling(nowSec, cameraBasisVectors, x, 0);
    }
    castCielingFog(ctx);
  }

  //2 means fog zone + basic floor cover and since we don't use the fog zone
  //for anything other then correcting the horizon we can just use the one simple performant gradient
  //for those levels
  if (gameStateObject.zones.length <= 2) {
    const px = player.x | 0;
    const py = player.y | 0;
    const zIndex = ZONE_GRID_CACHE[py * gameStateObject.MAP_W + px];
    let floor = SIMPLE_FLOOR_GRADIENT_CACHE[zIndex];
    if (!floor) {
      //Create and cache the gradient
      const fogColorZone = gameStateObject.zones[zIndex].fogColor;
      floor = ctx.createLinearGradient(0, HEIGHT, 0, HALF_HEIGHT);
      floor.addColorStop(0.0, gameStateObject.floorColorFront || "#054213");
      floor.addColorStop(0.85, gameStateObject.floorColorBack || "#03210A");
      floor.addColorStop(0.95, fogColorZone || FOG_COLOR);
      SIMPLE_FLOOR_GRADIENT_CACHE[zIndex] = floor;
    }
    ctx.fillStyle = floor;
    ctx.fillRect(0, HALF_HEIGHT, WIDTH, HALF_HEIGHT);
  } else {
    //TODO: Replace with single draw call + gradient fill for performance (Eventually. Not a priority)
    for (let x = 0; x < WIDTH; x++) {
      castFloor(nowSec, cameraBasisVectors, x, 0);
    }
    castFloorFog(ctx);
  }

  castHaze(ctx);

  castWalls(
    nowSec,
    cameraBasisVectors,
    gameStateObject.MAP,
    gameStateObject.MAP_W,
    gameStateObject.MAP_H
  );
  //Sort sprites back-to-front by distance from player for proper alpha blending
  calculateSpriteDistances();
  sprites.sort((spriteA, spriteB) => spriteB.dist - spriteA.dist);

  //Render all visible sprites with depth testing and batched shading
  renderVisibleSprites(cameraBasisVectors);

  //Draw weapon HUD in bottom-right corner
  drawWeaponHUD(nowSec);

  //Render visual effects (explosion radius feedback)
  renderVisualEffects(ctx, cameraBasisVectors, WIDTH, HEIGHT, player);
}

//Calculate squared distance from player to each sprite for depth sorting
function calculateSpriteDistances() {
  for (const sprite of sprites) {
    const deltaX = sprite.x - player.x;
    const deltaY = sprite.y - player.y;
    sprite.dist = deltaX * deltaX + deltaY * deltaY;
  }
}

//Render all sprites that are visible and in front of walls
function renderVisibleSprites(cameraTransform) {
  ctx.save();
  for (const sprite of sprites) {
    if (!sprite.alive) {
      continue;
    }

    //Skip sprites out of fog bounds
    const roughDistance = Math.hypot(sprite.x - player.x, sprite.y - player.y);
    if (roughDistance > player.sightDist) {
      continue;
    }

    const projection = projectSprite(sprite, cameraTransform);
    if (!projection) {
      continue; //sprite is behind camera
    }

    //Skip sprites beyond far plane
    if (player.sightDist > 0 && projection.depth > player.sightDist) {
      continue;
    }

    const sampleCount = 3;
    let visibleSamples = 0;
    for (let i = 0; i < sampleCount; i++) {
      const x =
        projection.drawStartX +
        (i * (projection.drawEndX - projection.drawStartX)) / (sampleCount - 1);
      if (projection.depth <= zBuffer[Math.floor(x)]) {
        visibleSamples++;
      }
    }
    //Skip only if no samples are visible
    if (visibleSamples === 0) {
      continue;
    }

    //Calculate distance-based shading with fog effects
    const shadingInfo = calculateSpriteShading(projection);

    //Render sprite with optimized column batching
    renderSpriteWithBatching(sprite, projection, shadingInfo);
    ctx.filter = "none"; //reset filter for next sprite
  }
  ctx.restore();
}

//Calculate sprite brightness based on distance and fog
function calculateSpriteShading(projection) {
  //Base distance-based brightness falloff
  let spriteShade = 1 / (1 + projection.depth * 0.3);

  //Apply fog dimming for sprites near far plane
  if (
    player.sightDist > 0 &&
    projection.depth > player.sightDist * FOG_START_FRAC
  ) {
    const fogStartDistance = player.sightDist * FOG_START_FRAC;
    const fogLerpFactor = Math.min(
      1,
      Math.max(
        0,
        (projection.depth - fogStartDistance) /
          Math.max(1e-6, player.sightDist - fogStartDistance)
      )
    );
    spriteShade *= 1 - fogLerpFactor * 0.6; //reduce brightness by up to 60% in fog
  }

  //Quantize brightness to predefined levels to reduce GPU state changes
  const brightnessLevels = [1.0, 0.85, 0.7, 0.55, 0.4];
  const quantizedShade = brightnessLevels.reduce(
    (bestMatch, candidateValue) =>
      Math.abs(candidateValue - spriteShade) < Math.abs(bestMatch - spriteShade)
        ? candidateValue
        : bestMatch,
    brightnessLevels[0]
  );

  return { quantizedShade };
}

function calculateFogIntensity(depth) {
  if (player.sightDist <= 0) {
    return 0;
  }

  const fogStart = player.sightDist * FOG_START_FRAC; //Same as walls
  const fogEnd = player.sightDist;

  if (depth <= fogStart) {
    return 0;
  }
  if (depth >= fogEnd) {
    return 1;
  }

  return (depth - fogStart) / (fogEnd - fogStart);
}

function buildFogFilter(projection, shadingInfo) {
  const filterParts = [];
  if (shadingInfo.quantizedShade < 0.999) {
    filterParts.push(`brightness(${shadingInfo.quantizedShade})`);
  }
  const fogIntensity = calculateFogIntensity(projection.depth);
  //const px = player.x | 0;
  //const py = player.y | 0;
  //const zIndex = ZONE_GRID_CACHE[py * gameStateObject.MAP_W + px] | 0;
  //const fogColor = gameStateObject.zones[zIndex]?.fogColor || FOG_COLOR;
  //const fogHSL = hexToHue(fogColor);
  //const hueShift = (fogHSL - 360) * fogIntensity; // Shift towards fog hue
  filterParts.push(`opacity(${1 - fogIntensity})`);
  return filterParts.length > 0 ? filterParts.join(" ") : null;
}

/**
 * Renders sprite using optimized column batching for performance.
 * Uses z-buffer depth testing to only render sprite columns that are in front
 * of walls, and batches contiguous visible columns into single draw calls to
 * minimize GPU state changes and improve rendering performance.
 *
 * **Used by:**
 * - **Internally**: Called in renderVisibleSprites() for each visible sprite
 *   to perform the actual rendering with depth testing and optimization
 *
 * @param {Object} sprite - Sprite entity to render
 * @param {Object} projection - Screen space projection data for the sprite
 * @param {Object} shadingInfo - Brightness and shading information
 */
function renderSpriteWithBatching(sprite, projection, shadingInfo) {
  //Apply brightness filter once per sprite
  const fogFilter = buildFogFilter(projection, shadingInfo);
  if (fogFilter) {
    ctx.filter = fogFilter;
  }

  //Calculate texture mapping parameters
  const totalSpriteWidth = Math.max(
    1,
    (projection.width ?? projection.drawEndX - projection.drawStartX) | 0
  );
  const spriteTopY = projection.drawStartY;
  const spriteHeight = projection.drawEndY - projection.drawStartY;

  const occludedBottom = projection.occludedBottom | 0;
  if (occludedBottom >= spriteHeight) {
    ctx.filter = "none";
    return; // fully hidden
  }
  const destVisibleHeight = spriteHeight - occludedBottom;
  // Keep scale: crop proportional source height from top
  const img = spriteEnum[sprite.img];
  if (!img) {
    ctx.filter = "none";
    return;
  }
  const occludedFrac = occludedBottom / spriteHeight;
  const sourceOccludedPixels = Math.round(img.height * occludedFrac);
  const sourceVisibleHeight = img.height - sourceOccludedPixels;

  //Function to map screen column to texture X coordinate
  const mapScreenColumnToTextureX = (screenColumn) =>
    (((screenColumn - projection.drawStartX) * spriteEnum[sprite.img].width) /
      totalSpriteWidth) |
    0;

  //Batch contiguous visible columns to minimize draw calls
  let currentRunStart = -1;
  let currentRunTextureStart = 0;

  for (
    let screenColumn = projection.drawStartX;
    screenColumn <= projection.drawEndX;
    screenColumn++
  ) {
    const columnOnScreen = screenColumn >= 0 && screenColumn < WIDTH;
    const columnVisible =
      columnOnScreen &&
      screenColumn < projection.drawEndX &&
      projection.depth <= zBuffer[screenColumn];

    if (columnVisible && currentRunStart === -1) {
      //Begin new contiguous run of visible columns
      currentRunStart = screenColumn;
      currentRunTextureStart = mapScreenColumnToTextureX(screenColumn);
    }

    if (
      (!columnVisible || screenColumn === projection.drawEndX) &&
      currentRunStart !== -1
    ) {
      //End current run and draw the batch
      const runEndColumn = screenColumn; //exclusive
      const destinationWidth = runEndColumn - currentRunStart;
      let textureEndX = mapScreenColumnToTextureX(runEndColumn);

      //Ensure we have at least 1 pixel width to sample
      if (textureEndX <= currentRunTextureStart) {
        textureEndX = currentRunTextureStart + 1;
      }

      const sourceWidth = Math.min(
        spriteEnum[sprite.img].width - currentRunTextureStart,
        textureEndX - currentRunTextureStart
      );

      if (destinationWidth > 0 && sourceWidth > 0 && spriteHeight > 0) {
        ctx.drawImage(
          spriteEnum[sprite.img],
          currentRunTextureStart,
          0,
          sourceWidth,
          sourceVisibleHeight,
          currentRunStart,
          spriteTopY,
          destinationWidth,
          destVisibleHeight
        );
      }
      currentRunStart = -1;
    }
  }
}

//Draw the bow weapon in the HUD
function drawWeaponHUD(nowSec) {
  if (!spriteEnum.pitchfork) {
    return;
  }
  const weaponDisplayWidth = Math.round(WIDTH * 0.42);
  const weaponDisplayHeight = Math.round(
    weaponDisplayWidth *
      (spriteEnum.pitchfork.height / spriteEnum.pitchfork.width)
  );
  const offsetX =
    player.isMoving && player.weaponAnim < 0.0 ? 10 * Math.sin(nowSec * 5) : 0;
  const hudMargin = Math.max(8, (WIDTH * 0.02) | 0);
  const weaponPositionX =
    WIDTH * 0.5 - weaponDisplayWidth / 2.0 - hudMargin / 2.0 + offsetX;

  //hacky animation nonsense. TODO replace this gargabe
  const weaponAnimFactor = (player.weaponAnim + 1.0) ** 10.0;
  const animation = weaponAnimFactor > 7.0 ? 7.0 : weaponAnimFactor;
  const attackY = player.weaponAnim >= 0.0 ? 100 - animation * 20 : 0;
  const offsetY =
    player.isMoving && player.weaponAnim < 0.0 ? 10 * Math.sin(nowSec * 10) : 0;
  const weaponPositionY =
    HEIGHT - weaponDisplayHeight - hudMargin + 70 + offsetY + attackY;

  ctx.drawImage(
    spriteEnum.pitchfork,
    weaponPositionX,
    weaponPositionY,
    weaponDisplayWidth,
    weaponDisplayHeight
  );
}

//Sample minimum wall distances in left, center, and right screen regions
function sampleWallDistancesInRegions() {
  const sideBandWidthFraction = 0.28; //each side takes ~28% of screen width
  const sideBandPixelWidth = Math.max(6, (WIDTH * sideBandWidthFraction) | 0);

  //Define screen regions
  const centerRegionWidth = Math.max(8, (WIDTH * 0.3) | 0);
  const centerStart = ((WIDTH - centerRegionWidth) >> 1) | 0;
  const centerEnd = centerStart + centerRegionWidth;

  const leftRegionStart = 0;
  const leftRegionEnd = Math.min(WIDTH, sideBandPixelWidth);

  const rightRegionStart = Math.max(0, WIDTH - sideBandPixelWidth);
  const rightRegionEnd = WIDTH;

  //Find minimum distance in each region
  const findMinDistance = (startX, endX) => {
    let minDistance = Number.POSITIVE_INFINITY;
    for (let pixelX = startX; pixelX < endX; pixelX++) {
      const wallDistance = zBuffer[pixelX];
      if (wallDistance < minDistance) {
        minDistance = wallDistance;
      }
    }
    return minDistance;
  };

  return {
    center: findMinDistance(centerStart, centerEnd),
    left: findMinDistance(leftRegionStart, leftRegionEnd),
    right: findMinDistance(rightRegionStart, rightRegionEnd),
  };
}

function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  //Update FPS EMA
  const inst = dt > 0 ? 1 / dt : 0;
  smoothFps = smoothFps ? smoothFps * 0.9 + inst * 0.1 : inst;
  //Update player state and world interactions (pure game logic)
  move(dt);
  updateAI(dt);
  updateVisualEffects(dt);
  autoPickup();
  //Render the 3D scene
  castAndDraw(now / 1000);
  if (cMini.classList.contains("visible")) {
    drawMinimap(sprites);
  }
  checkExit();
  tickMsg(dt);
  tickGameOver(dt);
  //Overlay FPS last so it sits on top
  drawFPS(smoothFps);
  vctx.drawImage(offscreen, 0, 0);
  requestAnimationFrame(loop);
}

await init().catch(console.error);
