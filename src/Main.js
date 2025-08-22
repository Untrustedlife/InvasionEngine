//Main game loop and rendering orchestrator
//Handles frame loop, wall/sprite rendering with z-buffer occlusion, HUD, and game state
import { canvas } from "./Dom.js";
import {
  FAR_PLANE,
  FOG_START_FRAC,
  VIGNETTE_NEAR_START,
  VIGNETTE_NEAR_END,
} from "./Constants.js";
import { ctx, WIDTH, HEIGHT, cMini } from "./Dom.js";
import { cameraBasis } from "./Camera.js";
import { castWalls, zBuffer } from "./Render.js";
import { projectSprite } from "./Projection.js";
import {
  sprites,
  wolfIdle,
  barrel,
  enchantedKey,
  food,
  arrowQuiver,
  bow,
} from "./Sprites.js";
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
import { rollDice, getRandomElementFromArray } from "./UntrustedUtils.js";
import { gameStateObject, mapDefinitions, EXIT_POS, START_POS } from "./Map.js";

//Wire inputs
wireInput(canvas);

//Vignette overlay system - side darkening based on wall proximity
let vignetteLeftImg = null;
let vignetteRightImg = null;
let vignetteLeftAlphaSmoothed = 0;
let vignetteRightAlphaSmoothed = 0;

function buildVignette() {
  const w = WIDTH | 0;
  const h = HEIGHT | 0;
  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  const g = off.getContext("2d");
  g.imageSmoothingEnabled = false;

  const cx = w * 0.5;
  const cy = h * 0.5;
  const rInner = Math.min(cx, cy) * 0;
  const rOuter = Math.hypot(cx, cy);
  const grad = g.createRadialGradient(cx, cy, rInner, cx, cy, rOuter);
  grad.addColorStop(0.0, "rgba(0,0,0,0)");
  grad.addColorStop(0.5, "rgba(0,0,0,1)");
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);

  //Build side vignette overlays
  const left = document.createElement("canvas");
  left.width = w;
  left.height = h;
  const gl = left.getContext("2d");
  gl.imageSmoothingEnabled = false;
  const gradL = gl.createLinearGradient(0, 0, w * 0.5, 0);
  gradL.addColorStop(0.35, "rgba(0,0,0,1)");
  gradL.addColorStop(1.0, "rgba(0,0,0,0)");
  gl.fillStyle = gradL;
  gl.fillRect(0, 0, w * 0.5, h);
  vignetteLeftImg = left;

  const right = document.createElement("canvas");
  right.width = w;
  right.height = h;
  const gr = right.getContext("2d");
  gr.imageSmoothingEnabled = false;
  const gradR = gr.createLinearGradient(w, 0, w * 0.5, 0);
  gradR.addColorStop(0.35, "rgba(0,0,0,1)");
  gradR.addColorStop(1.0, "rgba(0,0,0,0)");
  gr.fillStyle = gradR;
  gr.fillRect(w * 0.5, 0, w * 0.5, h);
  vignetteRightImg = right;
}
buildVignette();

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
      chosenMapDefinition = mapDef;
    }
  } else {
    chosenMapDefinition = getRandomElementFromArray(mapDefinitions);
  }

  EXIT_POS.x = chosenMapDefinition.exitPos.x;
  EXIT_POS.y = chosenMapDefinition.exitPos.y;
  START_POS.x = chosenMapDefinition.startPos.x;
  START_POS.y = chosenMapDefinition.startPos.y;

  //Initialize game state with chosen map
  player.health = player.maxHealth;
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
  player.x = player.x = chosenMapDefinition.startPos.x;
  player.y = chosenMapDefinition.startPos.y;
}

function init() {
  ChangeMapLevel(0);
  //assets pack
  resetLevel();
  //D&D Style starting health
  player.maxHealth = rollDice(6) + rollDice(6);
  player.health = player.maxHealth;
  player.ammo = rollDice(3);

  //Update bars
  updateBars();
  requestAnimationFrame(loop);
}

//Main 3D scene rendering with z-buffer occlusion
function castAndDraw(nowSec) {
  const cameraBasisVectors = cameraBasis();
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

  //Ensure crisp pixel-perfect scaling for the entire frame
  ctx.imageSmoothingEnabled = false;

  //Render all visible sprites with depth testing and batched shading
  renderVisibleSprites(cameraBasisVectors);

  //Draw weapon HUD in bottom-right corner
  drawWeaponHUD();

  //Apply dynamic vignette effects based on wall proximity
  applyProximityVignette();
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
  }
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
  ctx.save();

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
    Math.floor(
      ((screenColumn - projection.drawStartX) * sprite.img.width) /
        totalSpriteWidth
    );

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

  ctx.restore();
}

//Draw the bow weapon in the HUD
function drawWeaponHUD() {
  const bowDisplayWidth = Math.round(WIDTH * 0.42);
  const bowDisplayHeight = Math.round(
    bowDisplayWidth * (bow.height / bow.width)
  );
  const hudMargin = Math.max(8, (WIDTH * 0.02) | 0);
  const bowPositionX = WIDTH * 0.75 - bowDisplayWidth - hudMargin;
  const bowPositionY = HEIGHT - bowDisplayHeight - hudMargin - 30;

  ctx.drawImage(
    bow,
    bowPositionX,
    bowPositionY,
    bowDisplayWidth,
    bowDisplayHeight
  );
}

//Apply vignette effects based on proximity to walls
function applyProximityVignette() {
  if (!vignetteLeftImg || !vignetteRightImg) {
    return;
  }

  //Sample wall distances in different screen regions
  const wallDistances = sampleWallDistancesInRegions();

  //Convert distances to closeness factors
  const closenessFactors = {
    center: calculateCloseness(wallDistances.center),
    left: calculateCloseness(wallDistances.left),
    right: calculateCloseness(wallDistances.right),
  };

  //Determine vignette alpha values based on wall proximity
  const vignetteAlphas = calculateVignetteAlphas(closenessFactors);

  //Smooth the alpha transitions
  vignetteLeftAlphaSmoothed =
    vignetteLeftAlphaSmoothed * 0.85 + vignetteAlphas.left * 0.15;
  vignetteRightAlphaSmoothed =
    vignetteRightAlphaSmoothed * 0.85 + vignetteAlphas.right * 0.15;

  //Render vignette overlays
  drawVignetteOverlay(vignetteLeftImg, vignetteLeftAlphaSmoothed);
  drawVignetteOverlay(vignetteRightImg, vignetteRightAlphaSmoothed);
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

//Convert wall distance to closeness factor (0 = far, 1 = very close)
function calculateCloseness(wallDistance) {
  const nearDistanceThreshold = Math.max(VIGNETTE_NEAR_END, 1e-6);
  const farDistanceThreshold = Math.max(
    nearDistanceThreshold + 1e-6,
    VIGNETTE_NEAR_START
  );

  if (!isFinite(wallDistance)) {
    return 0;
  }

  const lerpFactor =
    (wallDistance - nearDistanceThreshold) /
    (farDistanceThreshold - nearDistanceThreshold);
  return Math.max(0, Math.min(1, 1 - lerpFactor));
}

//Determine vignette alpha values based on wall closeness patterns
function calculateVignetteAlphas(closenessFactors) {
  const {
    center: centerCloseness,
    left: leftCloseness,
    right: rightCloseness,
  } = closenessFactors;

  let leftAlpha = 0;
  let rightAlpha = 0;

  const bothSidesCloseness = Math.min(leftCloseness, rightCloseness);
  const maxSideCloseness = Math.max(leftCloseness, rightCloseness);
  const closenessDifferenceThreshold = 0.05;

  if (bothSidesCloseness > 0.5) {
    //Player is in a corridor - darken both sides
    leftAlpha = bothSidesCloseness;
    rightAlpha = bothSidesCloseness;
  } else if (leftCloseness > rightCloseness + closenessDifferenceThreshold) {
    //Wall primarily on left side
    leftAlpha = maxSideCloseness;
    rightAlpha = 0;
  } else if (rightCloseness > leftCloseness + closenessDifferenceThreshold) {
    //Wall primarily on right side
    rightAlpha = maxSideCloseness;
    leftAlpha = 0;
  } else {
    //Ambiguous or slightly close on both sides
    leftAlpha = maxSideCloseness;
    rightAlpha = maxSideCloseness;
  }

  return { left: leftAlpha, right: rightAlpha };
}

//Draw a vignette overlay with the specified alpha
function drawVignetteOverlay(vignetteImage, alpha) {
  if (vignetteImage && alpha > 0.001) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.drawImage(vignetteImage, 0, 0);
    ctx.restore();
  }
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  //Update FPS EMA
  const inst = dt > 0 ? 1 / dt : 0;
  smoothFps = smoothFps ? smoothFps * 0.9 + inst * 0.1 : inst;
  //Update player state and world interactions (pure game logic)
  move(dt);
  updateAI(dt);
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
  requestAnimationFrame(loop);
}

init();

//TOFIX: This breaks rendering right now lol, not sure why. Probably something to do with the canvas context.
window.addEventListener("keydown", (e) => {
  if (e.code !== "KeyQ") {
    return;
  }
  //Toggle between native and 0.75x internal resolution
  const nativeW = 960;
  const nativeH = 540;
  const downscale = canvas.width === nativeW ? 0.75 : 1.0;
  //Resize buffer; CSS stays the same since attributes define layout size
  canvas.width = Math.round(nativeW * downscale);
  canvas.height = Math.round(nativeH * downscale);
  ctx.imageSmoothingEnabled = false;
  //Rebuild vignette for new buffer size
  buildVignette();
  //Reset vignette smoothing so it doesn't interpolate across resolutions
  vignetteLeftAlphaSmoothed = 0;
  vignetteRightAlphaSmoothed = 0;
  //Note: WIDTH/HEIGHT exports are captured at import time. For full dynamic
  //toggling you’d plumb WIDTH/HEIGHT reads directly from canvas; here we keep
  //the quick toggle primarily to reduce work while testing on the fly.
});
