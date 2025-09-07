//Main game loop and rendering orchestrator
//Handles frame loop, wall/sprite rendering with z-buffer occlusion, HUD, and game state
import { canvas } from "./Dom.js";
import { FAR_PLANE, FOG_START_FRAC, START_HEALTH } from "./Constants.js";
import { ctx, WIDTH, HEIGHT, cMini, offscreen, vctx } from "./Dom.js";
import { cameraBasis } from "./Camera.js";
import {
  castWalls,
  zBuffer,
  castFloors,
  castCieling,
  castHaze,
  SIMPLE_FLOOR_GRADIENT_CACHE,
  clearGradientCaches,
} from "./Render.js";
import { projectSprite } from "./Projection.js";
import { sprites, bow, pitchfork, loadAsyncSprites } from "./Sprites.js";
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
} from "./Gameplay.js";
import { rollDice, chooseRandomElementFromArray } from "./UntrustedUtils.js";
import { gameStateObject, mapDefinitions, EXIT_POS, START_POS } from "./Map.js";
import { initAsyncTextures } from "./Textures.js";
import { updateVisualEffects, renderVisualEffects } from "./Effects.js";
let last = performance.now();

const coolDowns = new Map();
export function tryCooldown(key, intervalMS) {
  const now = last,
    next = coolDowns.get(key) ?? 0;
  if (now < next) {
    return false;
  }
  coolDowns.set(key, now + intervalMS);
  return true;
}

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
    const mapDef = getRandomElementFromArray(mapDefinitions);
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
  gameStateObject.cielingColorFront =
    chosenMapDefinition.cielingColorFront || "#6495ED";
  gameStateObject.floorColorFront =
    chosenMapDefinition.floorColorFront || "#054213";
  gameStateObject.cielingColorBack =
    chosenMapDefinition.cielingColorBack || "#6495ED";
  gameStateObject.floorColorBack =
    chosenMapDefinition.floorColorBack || "#03210A";
  //Clear zone and gradient caches when switching maps/levels
  clearGradientCaches();

  gameStateObject.MAP = chosenMapDefinition.mapLayout;
  gameStateObject.MAP_W = gameStateObject.MAP[0].length;
  gameStateObject.MAP_H = gameStateObject.MAP.length;
  gameStateObject.zones = chosenMapDefinition.zones;
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

  castCieling(ctx);

  //2 means fog zone + basic floor cover and since we don't use the fog zone
  //for anything other then correcting the horizon we can just use the one simple performant gradient
  //for those levels
  if (gameStateObject.zones.length <= 2) {
    const px = player.x | 0;
    const py = player.y | 0;
    const zIndex = zoneIdAt(px, py, gameStateObject.zones);
    let floor = SIMPLE_FLOOR_GRADIENT_CACHE[zIndex];
    if (!floor) {
      // Create and cache the gradient
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

    const projection = projectSprite(sprite, cameraTransform);
    if (!projection) {
      continue; //sprite is behind camera
    }

    //Skip sprites beyond far plane
    if (FAR_PLANE > 0 && projection.depth > FAR_PLANE) {
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
  if (FAR_PLANE > 0 && projection.depth > FAR_PLANE * FOG_START_FRAC) {
    const fogStartDistance = FAR_PLANE * FOG_START_FRAC;
    const fogLerpFactor = Math.min(
      1,
      Math.max(
        0,
        (projection.depth - fogStartDistance) /
          Math.max(1e-6, FAR_PLANE - fogStartDistance)
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

//Render sprite using batched column drawing for performance
function renderSpriteWithBatching(sprite, projection, shadingInfo) {
  //Apply brightness filter once per sprite
  if (shadingInfo.quantizedShade < 0.999) {
    ctx.filter = `brightness(${shadingInfo.quantizedShade})`;
  }

  //Calculate texture mapping parameters
  const totalSpriteWidth = Math.max(
    1,
    (projection.width ?? projection.drawEndX - projection.drawStartX) | 0
  );
  const spriteTopY = projection.drawStartY;
  const spriteHeight = projection.drawEndY - projection.drawStartY;

  //Function to map screen column to texture X coordinate
  const mapScreenColumnToTextureX = (screenColumn) =>
    (((screenColumn - projection.drawStartX) * sprite.img.width) /
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
        sprite.img.width - currentRunTextureStart,
        textureEndX - currentRunTextureStart
      );

      if (destinationWidth > 0 && sourceWidth > 0 && spriteHeight > 0) {
        ctx.drawImage(
          sprite.img,
          currentRunTextureStart,
          0,
          sourceWidth,
          sprite.img.height,
          currentRunStart,
          spriteTopY,
          destinationWidth,
          spriteHeight
        );
      }
      currentRunStart = -1;
    }
  }
}

//Draw the bow weapon in the HUD
function drawWeaponHUD(nowSec) {
  const weaponDisplayWidth = Math.round(WIDTH * 0.42);
  const weaponDisplayHeight = Math.round(
    weaponDisplayWidth * (bow.height / bow.width)
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
    pitchfork,
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
