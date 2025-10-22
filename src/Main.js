/**
 * @fileoverview Main game loop and rendering orchestrator for RealmChild Invasion.
 * Handles the primary frame loop, orchestrates wall/sprite rendering with z-buffer occlusion,
 * manages HUD display, game state transitions, and visual effects. This is the central
 * coordination point that brings together all rendering, input, and gameplay systems.
 */
import { supportsImageBitmap } from "./Dom.js";
import { canvas } from "./Dom.js";
import {
  FOG_START_FRAC,
  VIGNETTE_NEAR_START,
  VIGNETTE_NEAR_END,
  FOG_COLOR,
  FAR_PLANE,
} from "./Constants.js";
import { ctx, WIDTH, HEIGHT, cMini, offscreen, vctx } from "./Dom.js";
import { cameraBasis } from "./Camera.js";
import {
  castWalls,
  castFloor,
  castFloorFog,
  HALF_HEIGHT,
  castCieling,
  castCielingCLassic,
  castHaze,
  SIMPLE_FLOOR_GRADIENT_CACHE,
  clearGradientCaches,
  cacheZoneIdAtGrid,
  rebuildRowDistLUT,
  ZONE_GRID_CACHE,
  castCielingFog,
  getPixelDepth,
  pixelHeightBuffer,
} from "./Render.js";
import { projectSprite } from "./Projection.js";
import { sprites, loadAsyncSprites, spriteEnum } from "./Sprites.js";
import { player } from "./Player.js";
import { drawMinimap } from "./Minimap.js";
import {
  wireInput,
  move,
  updateAI,
  processTouchEvents,
  checkExit,
  tickMsg,
  tickGameOver,
  resetLevel,
  updateBars,
  buildEmptyTilesOnce,
} from "./Gameplay.js";
import { updateVisualEffects, renderVisualEffects } from "./Effects.js";
import {
  rollDice,
  getRandomElementFromArray,
  hexToHue,
  fastClamp,
} from "./UntrustedUtils.js";
import { gameStateObject, mapDefinitions, EXIT_POS, START_POS } from "./Map.js";
import { initAsyncTextures } from "./Textures.js";
//Wire inputs
wireInput(canvas);

//Vignette overlay system - side darkening based on wall proximity
let vignetteLeftImg = null;
let vignetteRightImg = null;
let vignetteLeftAlphaSmoothed = 0;
let vignetteRightAlphaSmoothed = 0;
let last = performance.now();
const coolDowns = new Map();

/**
 * Checks if sufficient time has passed since the last cooldown trigger for a given key.
 * Manages timing delays for various game actions like weapon animations, message displays,
 * and entity interactions. Supports both interval-based and simple time-check modes.
 *
 * **Used by:**
 * - `Mobs.js`: Controls message frequency for entity interactions (drone touch messages)
 * - `Items.js`: Manages pickup timing and prevents spam when collecting items
 * - `Gameplay.js`: Controls weapon firing rate and animation timing
 * - **Internally**: Used for weapon HUD animation states
 *
 * @param {string} key - Unique identifier for the cooldown timer
 * @param {number} intervalMS - Cooldown interval in milliseconds (0 = simple time check)
 * @returns {boolean} True if cooldown has expired and action can proceed
 * @export
 */
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

/**
 * Resets a cooldown timer to the current time, effectively blocking the associated
 * action until the cooldown period expires. Used to trigger cooldown states when
 * actions occur.
 *
 * **Used by:**
 * - `Mobs.js`: Triggered when entities are killed to reset weapon animation states
 * - `Items.js`: Triggered when items are collected to reset weapon animation states
 *   and prevent immediate re-triggering of pickup effects
 *
 * @param {string} key - Unique identifier for the cooldown timer to reset
 * @export
 */
export function resetCooldown(key) {
  coolDowns.set(key, performance.now());
}

/**
 * Builds pre-generated vignette overlay images for dynamic wall proximity effects.
 * Creates left and right vignette gradients as ImageBitmaps for optimal GPU performance.
 * Uses createImageBitmap when available for better rendering performance, with canvas fallback.
 *
 * **Used by:**
 * - **Self-invoked**: Called automatically during module initialization to set up
 *   vignette images for later use in proximity-based visual effects
 */
async function buildVignette() {
  const w = WIDTH | 0;
  const h = HEIGHT | 0;

  //Helper function to convert canvas to ImageBitmap or return canvas
  const optimizeVignette = async (canvas) => {
    if (!supportsImageBitmap) {
      return canvas;
    }
    try {
      if (canvas.transferToImageBitmap) {
        return canvas.transferToImageBitmap();
      }
      return await createImageBitmap(canvas);
    } catch (error) {
      console.warn("Vignette ImageBitmap conversion failed:", error);
      return canvas;
    }
  };

  //Build side vignette overlays using OffscreenCanvas for better performance
  const leftCanvas = new OffscreenCanvas(w, h);
  const gl = leftCanvas.getContext("2d");
  gl.imageSmoothingEnabled = false;
  const gradL = gl.createLinearGradient(0, 0, w * 0.5, 0);
  gradL.addColorStop(0.35, "rgba(0,0,0,1)");
  gradL.addColorStop(1.0, "rgba(0,0,0,0)");
  gl.fillStyle = gradL;
  gl.fillRect(0, 0, w * 0.5, h);

  const rightCanvas = new OffscreenCanvas(w, h);
  const gr = rightCanvas.getContext("2d");
  gr.imageSmoothingEnabled = false;
  const gradR = gr.createLinearGradient(w, 0, w * 0.5, 0);
  gradR.addColorStop(0.35, "rgba(0,0,0,1)");
  gradR.addColorStop(1.0, "rgba(0,0,0,0)");
  gr.fillStyle = gradR;
  gr.fillRect(w * 0.5, 0, w * 0.5, h);

  //Convert to ImageBitmaps for optimal performance
  vignetteLeftImg = await optimizeVignette(leftCanvas);
  vignetteRightImg = await optimizeVignette(rightCanvas);
}
buildVignette();

//FPS counter
let smoothFps = 0;
/**
 * Draws FPS counter in top-right corner with background and border styling.
 * Displays current frame rate with a semi-transparent background and border
 * for readability over the game scene. Uses exponential moving average for
 * smooth FPS display without jittery numbers.
 *
 * **Used by:**
 * - **Internally**: Called in the main game loop to overlay FPS information
 *   on top of all other rendered content
 *
 * @param {number} fps - Current frames per second value to display
 */
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

/**
 * Changes the current map level to either a specific level or a random one.
 * Handles complete map transition including loading map layout, configuring zones,
 * setting player position, updating visual settings, and reinitializing rendering
 * systems. Supports both sequential level progression and random level selection.
 *
 * **Used by:**
 * - `Gameplay.js`: Called for map progression when player reaches exit, level transitions
 *   during gameplay, and when resetting the game to starting level
 * - **Internally**: Called during game initialization to load the first level
 *
 * @param {number} specificLevel - Level index to load (-1 for random selection)
 * @export
 */
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
  player.sightDist = chosenMapDefinition.FAR_PLANE || FAR_PLANE;
  gameStateObject.cielingColorFront =
    chosenMapDefinition.cielingColorFront || "#6495ED";
  gameStateObject.floorColorFront =
    chosenMapDefinition.floorColorFront || "#054213";
  gameStateObject.cielingColorBack =
    chosenMapDefinition.cielingColorBack || "#6495ED";
  gameStateObject.floorColorBack =
    chosenMapDefinition.floorColorBack || "#03210A";
  gameStateObject.dontSpawnKey = chosenMapDefinition.dontSpawnKey || false;
  gameStateObject.dontPersist = chosenMapDefinition.dontPersist || false;
  //Clear all gradient caches when switching maps/levels

  gameStateObject.MAP = chosenMapDefinition.mapLayout;
  gameStateObject.MAP_W = gameStateObject.MAP[0].length;
  gameStateObject.MAP_H = gameStateObject.MAP.length;
  gameStateObject.zones = chosenMapDefinition.zones;
  gameStateObject.name = chosenMapDefinition.name;
  buildEmptyTilesOnce();
  clearGradientCaches();
  cacheZoneIdAtGrid();
  player.x = player.x = chosenMapDefinition.startPos.x;
  player.y = chosenMapDefinition.startPos.y;
  rebuildRowDistLUT();
}

/**
 * Asynchronous game initialization function. Loads all required assets,
 * initializes the game state, sets up player stats using D&D-style dice rolls,
 * and starts the main game loop. This is the entry point that prepares
 * everything needed for the game to run.
 *
 * **Used by:**
 * - **Self-invoked**: Called automatically at module load to start the game
 *
 * @async
 */
async function init() {
  await loadAsyncSprites();
  await initAsyncTextures();
  ChangeMapLevel(0);
  resetLevel();
  //D&D Style starting health
  player.maxHealth = rollDice(5) + rollDice(5);
  player.health = player.maxHealth;
  player.ammo = 0;

  //Update bars
  updateBars();
  requestAnimationFrame(loop);
}

/**
 * Main 3D scene rendering function with z-buffer occlusion and layered rendering.
 * Orchestrates the complete rendering pipeline: ceiling/floor rendering (with zone-based
 * optimization), wall raycasting, sprite sorting and rendering with depth testing,
 * HUD elements, vignette effects, and visual effects. Chooses rendering approach
 * based on zone complexity for performance optimization.
 *
 * **Used by:**
 * - **Internally**: Called by the main game loop for each frame to render the complete scene
 *
 * @param {number} nowSec - Current time in seconds for animation effects
 */
function castAndDraw(nowSec) {
  const cameraBasisVectors = cameraBasis();

  if (gameStateObject.zones.length <= 2) {
    castCielingCLassic(ctx);
  } else {
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

    //Check cache first - O(1) access
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

  //Apply dynamic vignette effects based on wall proximity
  applyProximityVignette();

  //Render visual effects (explosion radius feedback)
  renderVisualEffects(ctx, cameraBasisVectors, WIDTH, HEIGHT, player);
}

/**
 * Calculates squared distance from player to each sprite for depth sorting.
 * Computes euclidean distance squared (avoiding expensive sqrt) between player
 * position and each sprite to enable proper back-to-front sprite rendering
 * for correct alpha blending and depth perception.
 *
 * **Used by:**
 * - **Internally**: Called in castAndDraw() before sprite sorting to prepare
 *   distance values for the sorting algorithm
 */
function calculateSpriteDistances() {
  for (const sprite of sprites) {
    const deltaX = sprite.x - player.x;
    const deltaY = sprite.y - player.y;
    sprite.dist = deltaX * deltaX + deltaY * deltaY;
  }
}

/**
 * Renders all sprites that are visible and in front of walls using z-buffer depth testing.
 * Iterates through all sprites, projects them to screen space, performs visibility and
 * depth culling, calculates distance-based shading, and renders using optimized batching.
 * Ensures sprites appear correctly behind walls and with proper fog/distance effects.
 *
 * **Used by:**
 * - **Internally**: Called in castAndDraw() after wall rendering to draw all sprites
 *   with proper depth sorting and occlusion
 *
 * @param {Object} cameraTransform - Camera basis vectors for sprite projection
 */

function renderVisibleSprites(cameraTransform) {
  ctx.save();
  for (const sprite of sprites) {
    if (!sprite.alive) {
      continue;
    }

    const roughDistance = Math.hypot(sprite.x - player.x, sprite.y - player.y);
    if (roughDistance > player.sightDist) {
      continue;
    }

    const projection = projectSprite(sprite, cameraTransform);
    if (!projection) {
      continue;
    }

    if (player.sightDist > 0 && projection.depth > player.sightDist) {
      continue;
    }

    if (projection.drawEndX < 0 || projection.drawStartX >= WIDTH) {
      continue;
    }

    //Sample to check if visible
    const columnSamples = [
      projection.drawStartX,
      (projection.drawStartX + projection.drawEndX) >> 1,
      projection.drawEndX - 1,
    ];
    const rowSamples = [
      projection.drawStartY,
      (projection.drawStartY + projection.drawEndY) >> 1,
      projection.drawEndY - 1,
    ];

    let isVisible = false;
    for (const x of columnSamples) {
      for (const y of rowSamples) {
        if (projection.depth < getPixelDepth(x | 0, y | 0)) {
          isVisible = true;
          break;
        }
      }
      if (isVisible) {
        break;
      }
    }

    if (!isVisible) {
      continue;
    }

    const shadingInfo = calculateSpriteShading(projection);

    //Render sprite with optimized column batching
    renderSpriteWithBatching(sprite, projection, shadingInfo);
    ctx.filter = "none"; //reset filter for next sprite
  }
  ctx.restore();
}
const EPS = 1e-4;
// Reusable scratch to avoid per-frame allocations
let _spriteColTop = null;
let _spriteColBot = null;
let _spriteScratchWidth = 0;

function ensureSpriteScratch(width) {
  if (_spriteScratchWidth !== width || !_spriteColTop || !_spriteColBot) {
    _spriteColTop = new Int16Array(width);
    _spriteColBot = new Int16Array(width);
    _spriteScratchWidth = width;
  }
  _spriteColTop.fill(-1);
  _spriteColBot.fill(-1);
}

function renderSpriteWithBatching(sprite, projection, shadingInfo) {
  const fogFilter = buildFogFilter(projection, shadingInfo);
  if (fogFilter) {
    ctx.filter = fogFilter;
  }

  const img = spriteEnum[sprite.img];
  const spriteTopY = projection.drawStartY | 0;
  const spriteBottomY = projection.drawEndY | 0;
  const spriteHeight = spriteBottomY - spriteTopY;

  if (!img || spriteHeight <= 0) {
    ctx.filter = "none";
    return;
  }

  const totalSpriteWidth =
    projection.width ?? projection.drawEndX - projection.drawStartX;

  // Top/bottom trims (pixels in screen space)
  const occludedTopPx = projection.occludedTop ?? 0;
  const occludedBottomPx = projection.occludedBottom ?? 0;

  const adjustedTopY = (spriteTopY + occludedTopPx) | 0;
  const adjustedBottomY = (spriteBottomY - occludedBottomPx) | 0;

  const visTop = adjustedTopY > 0 ? adjustedTopY : 0;
  const visBottomExcl = HEIGHT < adjustedBottomY ? HEIGHT : adjustedBottomY;
  if (visBottomExcl - visTop <= 0) {
    ctx.filter = "none";
    return;
  }

  // Horizontal clip
  const startCol = projection.drawStartX > 0 ? projection.drawStartX | 0 : 0;
  const endColExclusive =
    projection.drawEndX < WIDTH ? projection.drawEndX | 0 : WIDTH;

  if (startCol >= endColExclusive) {
    ctx.filter = "none";
    return;
  }

  ensureSpriteScratch(WIDTH);

  const mapScreenColumnToTextureX = (screenColumn) =>
    (((screenColumn - (projection.drawStartX | 0)) * img.width) /
      totalSpriteWidth) |
    0;

  // Per-column visibility via depth test
  const verticalSpan = (visBottomExcl - visTop) | 0; // exclusive bottom
  const samples = Math.min(10, verticalSpan);

  let firstVisibleCol = -1;
  let lastVisibleCol = -1;

  for (
    let screenColumn = startCol;
    screenColumn < endColExclusive;
    screenColumn++
  ) {
    let columnVisible = false;

    // Initialize inverted bounds inside the clipped window
    let colTopY = (visBottomExcl - 1) | 0;
    let colBottomY = visTop | 0;

    // Sample a few Y points within [visTop, visBottomExcl)
    for (let i = 0; i < samples; i++) {
      const t = samples === 1 ? 0.5 : i / (samples - 1);
      const sampleY = (visTop + t * (verticalSpan - 1)) | 0; // stays in [visTop..visBottomExcl-1]
      const depthAtPixel = getPixelDepth(screenColumn, sampleY);
      if (projection.depth + EPS < depthAtPixel) {
        columnVisible = true;
        if (sampleY < colTopY) {
          colTopY = sampleY;
        }
        if (sampleY > colBottomY) {
          colBottomY = sampleY;
        }
      }
    }

    if (columnVisible) {
      // Expand upward within screen clip
      for (let y = colTopY - 1; y >= visTop; y--) {
        const depth = getPixelDepth(screenColumn, y);
        if (projection.depth + EPS < depth) {
          colTopY = y;
        } else {
          break;
        }
      }
      // Expand downward within screen clip (exclusive bottom)
      for (let y = colBottomY + 1; y < visBottomExcl; y++) {
        const depth = getPixelDepth(screenColumn, y);
        if (projection.depth + EPS < depth) {
          colBottomY = y;
        } else {
          break;
        }
      }

      _spriteColTop[screenColumn] = colTopY;
      _spriteColBot[screenColumn] = colBottomY;

      if (firstVisibleCol === -1) {
        firstVisibleCol = screenColumn;
      }
      lastVisibleCol = screenColumn;
    }
  }

  if (firstVisibleCol === -1) {
    ctx.filter = "none";
    return;
  }

  // Build horizontal runs
  const runs = [];
  let x = firstVisibleCol;
  while (x <= lastVisibleCol) {
    while (x <= lastVisibleCol && _spriteColTop[x] < 0) {
      x++;
    }
    if (x > lastVisibleCol) {
      break;
    }

    const start = x;
    let runMinTop = _spriteColTop[x];
    let runMaxBot = _spriteColBot[x];
    while (x <= lastVisibleCol && _spriteColTop[x] >= 0) {
      if (_spriteColTop[x] < runMinTop) {
        runMinTop = _spriteColTop[x];
      }
      if (_spriteColBot[x] > runMaxBot) {
        runMaxBot = _spriteColBot[x];
      }
      x++;
    }
    const end = x - 1;
    runs.push({ start, end, minTop: runMinTop, maxBot: runMaxBot });
  }

  const fullScreenSpan = Math.max(1, spriteBottomY - spriteTopY);

  for (let i = 0; i < runs.length; i++) {
    const { start, end, minTop, maxBot } = runs[i];

    const texStartX = fastClamp(mapScreenColumnToTextureX(start), 0, img.width);
    const texEndX = fastClamp(mapScreenColumnToTextureX(end + 1), 0, img.width);
    const srcW = Math.max(0, texEndX - texStartX);
    const destW = end - start + 1;

    if (srcW <= 0 || destW <= 0) {
      continue;
    }

    const srcTopY = Math.round(
      img.height * ((minTop - spriteTopY) / fullScreenSpan)
    );
    const srcBotY = Math.round(
      img.height * ((maxBot - spriteTopY + 1) / fullScreenSpan)
    );
    const srcH = Math.max(1, srcBotY - srcTopY);
    const destH = maxBot - minTop + 1;

    ctx.save();
    ctx.beginPath();
    // top edge
    ctx.moveTo(start, _spriteColTop[start]);
    for (let cx = start + 1; cx <= end; cx++) {
      ctx.lineTo(cx, _spriteColTop[cx]);
    }
    // bottom edge (reverse)
    ctx.lineTo(end, _spriteColBot[end] + 1);
    for (let cx = end - 1; cx >= start; cx--) {
      ctx.lineTo(cx, _spriteColBot[cx] + 1);
    }
    ctx.closePath();
    ctx.clip();

    ctx.drawImage(
      img,
      texStartX,
      srcTopY,
      srcW,
      srcH,
      start,
      minTop,
      destW,
      destH
    );

    ctx.restore();
  }

  ctx.filter = "none";
}
/**
 * Calculates sprite brightness based on distance and fog effects.
 * Applies distance-based brightness falloff and fog dimming for sprites near
 * the far plane. Quantizes brightness to predefined levels to reduce GPU
 * state changes and improve rendering performance.
 *
 * **Used by:**
 * - **Internally**: Called in renderVisibleSprites() for each sprite to determine
 *   appropriate brightness/shading for distance and atmospheric effects
 *
 * @param {Object} projection - Sprite projection data including depth information
 * @returns {Object} Shading information with quantized brightness values
 */
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

  //1. Existing brightness dimming
  if (shadingInfo.quantizedShade < 0.999) {
    filterParts.push(`brightness(${shadingInfo.quantizedShade})`);
  }

  //2. Calculate fog intensity based on distance
  const fogIntensity = calculateFogIntensity(projection.depth);
  //Only apply fog effects if significant
  //3. Get current zone's fog color
  //const px = player.x | 0;
  //const py = player.y | 0;
  //const zIndex = ZONE_GRID_CACHE[py * gameStateObject.MAP_W + px] | 0;
  //const fogColor = gameStateObject.zones[zIndex]?.fogColor || FOG_COLOR;
  //4. Convert fog color to HSL for hue calculation
  //const fogHSL = hexToHue(fogColor);
  //5. Apply fog effects with intensity-based scaling
  //const hueShift = (fogHSL - 360) * fogIntensity; //Shift towards fog hue
  filterParts.push(`opacity(${1 - fogIntensity})`);
  return filterParts.length > 0 ? filterParts.join(" ") : null;
}

/**
 * Draws the bow weapon in the HUD with animated states and weapon bobbing.
 * Displays different weapon sprites based on cooldown state and ammo availability.
 * Includes weapon bobbing animation that responds to player movement and sprint state.
 * Positioned in the bottom-right corner with responsive sizing.
 *
 * **Used by:**
 * - **Internally**: Called in castAndDraw() to render the weapon HUD overlay
 *   after 3D scene rendering but before vignette effects
 */
//Draw the weapon in the HUD
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

/**
 * Applies dynamic vignette effects based on proximity to walls in different screen regions.
 * Samples wall distances using the z-buffer, converts to closeness factors, determines
 * appropriate vignette alpha values, and applies smoothed transitions. Creates immersive
 * visual feedback that darkens screen edges when near walls, enhancing spatial awareness.
 *
 * **Used by:**
 * - **Internally**: Called in castAndDraw() after HUD rendering to apply atmospheric
 *   vignette effects based on the player's spatial environment
 */
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

/**
 * Samples minimum wall distances in left, center, and right screen regions.
 * Divides the screen into three regions and finds the closest wall distance
 * in each using the z-buffer data. This provides spatial awareness data for
 * vignette effects and environmental feedback systems.
 *
 * **Used by:**
 * - **Internally**: Called in applyProximityVignette() to gather wall distance
 *   data for determining vignette effect intensity and positioning
 *
 * @returns {Object} Wall distances for each screen region {center, left, right}
 */
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
      const wallDistance = getPixelDepth(pixelX, HALF_HEIGHT);
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

/**
 * Converts wall distance to closeness factor using configurable thresholds.
 * Maps distance values to a 0-1 range where 0 represents far walls and 1
 * represents very close walls. Uses vignette distance constants to determine
 * the mapping curve for consistent visual feedback.
 *
 * **Used by:**
 * - **Internally**: Called in applyProximityVignette() to convert raw distance
 *   measurements into normalized closeness values for vignette calculations
 *
 * @param {number} wallDistance - Raw wall distance from z-buffer sampling
 * @returns {number} Closeness factor from 0 (far) to 1 (very close)
 */
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

/**
 * Determines vignette alpha values based on wall closeness patterns.
 * Analyzes closeness factors from different screen regions to determine
 * appropriate left and right vignette intensities. Handles corridor detection,
 * single-sided walls, and ambiguous spatial configurations.
 *
 * **Used by:**
 * - **Internally**: Called in applyProximityVignette() to determine final
 *   vignette alpha values based on spatial analysis of wall proximity
 *
 * @param {Object} closenessFactors - Closeness values for each screen region
 * @returns {Object} Vignette alpha values {left, right}
 */
function calculateVignetteAlphas(closenessFactors) {
  const { left: leftCloseness, right: rightCloseness } = closenessFactors;

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

/**
 * Draws a vignette overlay with the specified alpha transparency.
 * Renders pre-generated vignette images with variable alpha for dynamic
 * intensity control. Includes alpha threshold optimization to skip
 * negligible vignette effects.
 *
 * **Used by:**
 * - **Internally**: Called in applyProximityVignette() to render individual
 *   vignette overlays (left and right) with calculated alpha values
 *
 * @param {HTMLCanvasElement} vignetteImage - Pre-generated vignette image
 * @param {number} alpha - Alpha transparency value (0-1)
 */
function drawVignetteOverlay(vignetteImage, alpha) {
  if (vignetteImage && alpha > 0.001) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.drawImage(vignetteImage, 0, 0);
    ctx.restore();
  }
}

/**
 * Main game loop function handling frame timing, game logic updates, and rendering.
 * Manages delta time calculation with frame rate limiting, updates all game systems
 * (player movement, AI, visual effects), orchestrates complete scene rendering,
 * handles conditional UI elements (minimap, FPS), and schedules the next frame.
 * This is the central loop that drives the entire game.
 *
 * **Used by:**
 * - **Self-scheduled**: Uses requestAnimationFrame to continuously call itself
 *   for smooth game loop execution at optimal frame rates
 *
 * @param {number} now - Current timestamp from requestAnimationFrame
 */
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  //Update FPS EMA
  const inst = dt > 0 ? 1 / dt : 0;
  smoothFps = smoothFps ? smoothFps * 0.9 + inst * 0.1 : inst;
  //Update player state and world interactions (pure game logic)
  if (player.health > 0) {
    move(dt);
  }

  updateAI(dt);
  updateVisualEffects(dt);
  processTouchEvents();
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
  if (supportsImageBitmap) {
    vctx.drawImage(offscreen.transferToImageBitmap(), 0, 0);
  } else {
    vctx.drawImage(offscreen, 0, 0);
  }

  requestAnimationFrame(loop);
}

init().catch(console.error);
