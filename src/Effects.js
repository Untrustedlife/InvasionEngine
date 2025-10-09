import { lerp } from "./UntrustedUtils.js";

/**
 * (I think im going to add this to all modules i created from now on)
 * Effects Manager (By Untrustedlife 8/30/2025)
 * Tiny effects manager for short-lived visual flair (explosions, flashes, etc.).
 * Drop effects in, tick them each frame, draw, they clean themselves up.
 */

//effect types (so we don't sprinkle raw strings everywhere)
export const EFFECT_TYPES = {
  EXPLOSION: "explosion",
  SCREEN_FLASH: "screen_flash",
};

//default knobs per type — tweak to taste
const EFFECT_DEFAULTS = {
  [EFFECT_TYPES.EXPLOSION]: {
    lifetime: 0.5,
    startRadius: 0.1,
    endRadius: 1.0,
    expansionTime: 0.4,
    startOpacity: 1.0,
    endOpacity: 0.0,
    primaryColor: { h: 30, s: 90, l: 60 },
    secondaryColor: { h: 15, s: 85, l: 50 },
    glowColor: { h: 45, s: 100, l: 75 },
    fillColor: { h: 25, s: 80, l: 40 },
    ringLineWidth: 3,
    glowLineWidth: 2,
    innerLineWidth: 1,
    renderFunction: renderExplosionEffect,
    //world-space effect
    ignoreBounds: false,
  },
  [EFFECT_TYPES.SCREEN_FLASH]: {
    lifetime: 0.15, //quick pop
    startOpacity: 0.85,
    endOpacity: 0.0,
    color: "#ffffff",
    //screen-space render; world pos ignored
    renderFunction: randerFlashScreenEffect,
    ignoreBounds: true,
  },
};

//active effects live here
const visualEffects = [];

/**
 * Create an effect and add it to the pool.
 * @param {keyof EFFECT_TYPES|string} type
 * @param {number} worldX
 * @param {number} worldY
 * @param {number} radius
 * @param {Object} [options]
 * @returns {Object|null}
 */
export function createVisualEffect(type, worldX, worldY, radius, options = {}) {
  //get defaults for this type
  const defaults = EFFECT_DEFAULTS[type];
  if (!defaults) {
    console.warn(`Unknown effect type: ${type}`);
    return null;
  }
  //merge defaults with overrides
  const effect = {
    ignoreBounds: false,
    //basics
    type,
    x: worldX,
    y: worldY,
    radius,
    maxRadius: radius,
    //timing
    age: 0,
    lifetime: options.lifetime ?? defaults.lifetime,
    //visuals
    opacity: options.startOpacity ?? defaults.startOpacity,
    startOpacity: options.startOpacity ?? defaults.startOpacity,
    endOpacity: options.endOpacity ?? defaults.endOpacity,
    //type-specific bits
    ...defaults,
    ...options,
  };
  //stash it
  visualEffects.push(effect);
  return effect;
}

/** Create an explosion effect (barrels, etc.) */
export function createExplosionEffect(worldX, worldY, radius, options = {}) {
  return createVisualEffect(
    EFFECT_TYPES.EXPLOSION,
    worldX,
    worldY,
    radius,
    options
  );
}

/**
 * Flash the whole screen.
 * @param {{color?:string,duration?:number,alpha?:number}} [opts]
 * usage: renderFlashScreenEffect({ color: "#fff", duration: 0.12, alpha: 0.9 })
 */
export function createFlashScreenEffect({
  color = "#ffffff",
  duration = 0.15,
  alpha = 0.85,
} = {}) {
  //screen-space; world position is irrelevant here
  createVisualEffect(EFFECT_TYPES.SCREEN_FLASH, 0, 0, 1, {
    lifetime: duration,
    startOpacity: alpha,
    endOpacity: 0,
    color,
    ignoreBounds: true,
  });
}

/** Update all effects. Call once per frame. */
export function updateVisualEffects(deltaTime) {
  //loop backwards so we can splice
  for (let i = visualEffects.length - 1; i >= 0; i--) {
    const effect = visualEffects[i];
    effect.age += deltaTime;
    const progress = Math.min(effect.age / effect.lifetime, 1.0);
    updateEffectByType(effect, progress);
    //bye when done
    if (effect.age >= effect.lifetime) {
      visualEffects.splice(i, 1);
    }
  }
}

//per-type update
function updateEffectByType(effect, progress) {
  switch (effect.type) {
    case EFFECT_TYPES.EXPLOSION:
      updateExplosionEffect(effect, progress);
      break;
    case EFFECT_TYPES.SCREEN_FLASH:
      updateScreenFlashEffect(effect, progress);
      break;
  }
}

//explosion: expand ring/fade out
function updateExplosionEffect(effect, progress) {
  //fade over lifetime
  effect.opacity = lerp(effect.startOpacity, effect.endOpacity, progress);
  //quick expand then hold
  const expansionProgress = Math.min(progress / effect.expansionTime, 1.0);
  const radiusMultiplier = lerp(
    effect.startRadius,
    effect.endRadius,
    expansionProgress
  );
  effect.radius = effect.maxRadius * radiusMultiplier;
}

//screen flash/fade out
function updateScreenFlashEffect(effect, progress) {
  const easeOut = 1 - (1 - progress) * (1 - progress);
  effect.opacity = lerp(effect.startOpacity, effect.endOpacity, easeOut);
}

/** Get the active effects array (pretending its read-only). */
export function getVisualEffects() {
  return visualEffects;
}
/** Nuke all effects. */
export function clearVisualEffects() {
  visualEffects.length = 0;
}

/**
 * Draw effects (after sprites, before HUD).
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} cameraBasisVectors
 * @param {number} screenWidth
 * @param {number} screenHeight
 * @param {Object} player
 */
export function renderVisualEffects(
  ctx,
  cameraBasisVectors,
  screenWidth,
  screenHeight,
  player
) {
  const effects = getVisualEffects();
  if (effects.length === 0) {
    return; //nothing to draw
  }
  //keep canvas state clean
  ctx.save();
  //draw each effect
  for (const effect of effects) {
    renderSingleEffect(
      ctx,
      effect,
      cameraBasisVectors,
      screenWidth,
      screenHeight,
      player
    );
  }

  //restore canvas state
  ctx.restore();
}

//draw one effect
function renderSingleEffect(
  ctx,
  effect,
  cameraBasisVectors,
  screenWidth,
  screenHeight,
  player
) {
  //world -> screen
  const screenPos = worldToScreen(
    effect.x,
    effect.y,
    cameraBasisVectors,
    screenWidth,
    screenHeight,
    player,
    effect.ignoreBounds
  );
  //behind camera? skip unless screen-space
  if (!screenPos && !effect.ignoreBounds) {
    return;
  }
  //type-specific draw
  effect.renderFunction(ctx, effect, screenPos);
}

//basic 2D raycaster-style projection
function worldToScreen(
  worldX,
  worldY,
  cameraBasisVectors,
  screenWidth,
  screenHeight,
  player,
  ignoreBounds = false
) {
  //player-relative
  const worldDeltaX = worldX - player.x;
  const worldDeltaY = worldY - player.y;
  //camera-space transform
  const { dirY, dirX, planeY, planeX, invDet } = cameraBasisVectors;
  const transformedX = invDet * (dirY * worldDeltaX - dirX * worldDeltaY);
  const transformedY = invDet * (-planeY * worldDeltaX + planeX * worldDeltaY);
  //behind camera?
  if (transformedY <= 0.1 && !ignoreBounds) {
    return null;
  } else if (ignoreBounds) {
    return {
      x: screenWidth / 2,
      y: screenHeight / 2, //horizon-ish
      radius: screenHeight,
      depth: transformedY,
    };
  }
  //to screen coords
  return {
    x: (screenWidth / 2) * (1 + transformedX / transformedY),
    y: screenHeight / 2 + 64,
    radius: (screenHeight / transformedY) * 0.5, //scale with distance
    depth: transformedY,
  };
}

//explosion: layered circles with a bit of wobble
function renderExplosionEffect(ctx, effect, screenPos) {
  const scaledRadius = screenPos.radius * effect.radius;
  //little vibe so it feels alive
  const time = performance.now() * 0.001;
  const colorShift = Math.sin(time * 8) * 12;
  const pulseEffect = Math.sin(time * 12) * 0.15 + 1.0;
  const screenPosY = screenPos.y;
  const screenPosX = screenPos.x;

  //1) filled center
  ctx.globalAlpha = effect.opacity * 0.3;
  ctx.fillStyle = `hsl(${effect.fillColor.h + colorShift * 0.5}, ${
    effect.fillColor.s
  }%, ${effect.fillColor.l}%)`;
  ctx.beginPath();
  ctx.arc(screenPosX, screenPosY, scaledRadius * 0.7, 0, 2 * Math.PI);
  ctx.fill();

  //2) outer glow
  ctx.globalAlpha = effect.opacity * 0.5;
  ctx.strokeStyle = `hsl(${effect.glowColor.h + colorShift}, ${
    effect.glowColor.s
  }%, ${effect.glowColor.l}%)`;
  ctx.lineWidth = effect.glowLineWidth * 1.5;
  ctx.beginPath();
  ctx.arc(screenPosX, screenPosY, scaledRadius * pulseEffect, 0, 2 * Math.PI);
  ctx.stroke();

  //3) main ring
  ctx.globalAlpha = effect.opacity * 0.85;
  ctx.strokeStyle = `hsl(${effect.primaryColor.h + colorShift * 0.8}, ${
    effect.primaryColor.s
  }%, ${effect.primaryColor.l}%)`;
  ctx.lineWidth = effect.ringLineWidth;
  ctx.beginPath();
  ctx.arc(screenPosX, screenPosY, scaledRadius * 0.9, 0, 2 * Math.PI);
  ctx.stroke();

  //4) inner detail
  ctx.globalAlpha = effect.opacity * 0.6;
  ctx.strokeStyle = `hsl(${effect.secondaryColor.h + colorShift * 1.3}, ${
    effect.secondaryColor.s
  }%, ${effect.secondaryColor.l}%)`;
  ctx.lineWidth = effect.innerLineWidth;
  ctx.beginPath();
  ctx.arc(screenPosX, screenPosY, scaledRadius * 0.5, 0, 2 * Math.PI);
  ctx.stroke();
}

//full-screen overlay that fades out
function randerFlashScreenEffect(ctx, effect) {
  if (effect.opacity <= 0) {
    return;
  }
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;

  ctx.save();
  ctx.globalAlpha = effect.opacity;
  ctx.fillStyle = effect.color || "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}
