//Sprite projection - transforms world sprites to screen coordinates
//Ground sprites align to floor, floating sprites center on horizon
import { WIDTH, HEIGHT } from "./Dom.js";
import { clamp } from "./Utils.js";
import { player } from "./Player.js";
import { spriteEnum } from "./Sprites.js";
import { ZONE_GRID_CACHE } from "./Render.js";
import { gameStateObject } from "./Map.js";
//Calculate sprite screen height based on distance from camera
function projectHeight(distanceFromCamera) {
  return HEIGHT / distanceFromCamera;
}

//Transform world coordinates to camera space using camera basis vectors
function toCameraSpace(worldDeltaX, worldDeltaY, cameraBasisVectors) {
  const { dirY, dirX, planeY, planeX, invDet } = cameraBasisVectors;
  const transformedX = invDet * (dirY * worldDeltaX - dirX * worldDeltaY);
  const transformedY = invDet * (-planeY * worldDeltaX + planeX * worldDeltaY);
  return { transX: transformedX, transY: transformedY };
}

//Calculate horizontal screen center position from camera-space coordinates
function screenCenterX(cameraSpaceX, cameraSpaceY) {
  return Math.round((WIDTH >> 1) * (1 + cameraSpaceX / cameraSpaceY));
}

//Transform world sprite to screen coordinates with floor alignment and scaling
export function projectSprite(sprite, cameraBasisVectors) {
  const worldDeltaX = sprite.x - player.x;
  const worldDeltaY = sprite.y - player.y;
  const { transX: cameraSpaceX, transY: cameraSpaceY } = toCameraSpace(
    worldDeltaX,
    worldDeltaY,
    cameraBasisVectors
  );

  if (cameraSpaceY <= 0.01) {
    return null; //Behind camera
  }

  const screenCenterPixelX = screenCenterX(cameraSpaceX, cameraSpaceY);

  //Get sprite scale - prioritize instance scale, then image scale, then default
  const worldScale =
    sprite && typeof sprite.scale === "number"
      ? sprite.scale
      : sprite &&
        spriteEnum[sprite.img] &&
        typeof spriteEnum[sprite.img].scale === "number"
      ? spriteEnum[sprite.img].scale
      : 1;

  //Apply height hysteresis to reduce size bobbing during movement
  const targetSpriteHeight = projectHeight(cameraSpaceY) * worldScale;
  const lastRoundedHeight =
    typeof sprite._hR === "number"
      ? sprite._hR
      : Math.round(targetSpriteHeight);
  const hysteresisThreshold = 0.1;
  let roundedSpriteHeight = lastRoundedHeight;
  if (targetSpriteHeight > lastRoundedHeight + hysteresisThreshold) {
    roundedSpriteHeight = Math.round(targetSpriteHeight);
  } else if (targetSpriteHeight < lastRoundedHeight - hysteresisThreshold) {
    roundedSpriteHeight = Math.round(targetSpriteHeight);
  }
  sprite._hR = roundedSpriteHeight;

  const finalSpriteHeight = roundedSpriteHeight;

  const spriteImage = spriteEnum[sprite.img];
  const aspectRatio =
    spriteImage && spriteImage.width && spriteImage.height
      ? spriteImage.width / spriteImage.height
      : 1;
  const finalSpriteWidth = Math.max(
    1,
    Math.round(finalSpriteHeight * aspectRatio)
  );

  //Calculate floor bias for ground sprites based on size and scale

  //Use the same constants the walls use
  const EYE = player.calculatePlayerHeight();
  const horizon = HEIGHT * 0.5; //add + proj*Math.tan(pitch) if we implement pitch
  let occludedBottom = 0; //Pixels occluded by liquid cover, from bottom up
  let startY, endY;
  if (sprite.ground) {
    //Base locked to floor at depth cameraSpaceY (same eye-height model as walls)
    const bias = sprite.floorBiasFrac ?? 0.04;

    //Move sprites lower if they are on a lower plane
    const newZoneId =
      ZONE_GRID_CACHE[(sprite.y | 0) * gameStateObject.MAP_W + (sprite.x | 0)];

    const zone = gameStateObject.zones[newZoneId];
    const newFloorAdjuster = 2 - (zone.floorDepth || 0); //0 is base floor depth, 1.2 is player height

    //Bottom of sprite on floor
    const bottomY =
      horizon +
      (HEIGHT * (newFloorAdjuster - EYE)) / (2 * cameraSpaceY) -
      bias * finalSpriteHeight;
    const topY = bottomY - finalSpriteHeight;

    startY = Math.round(topY);
    endY = Math.round(bottomY);

    if (zone && zone.isLiquid) {
      const fd = zone.floorDepth ?? 0;
      //Submerge occlusion: hide the lower part of a sprite when it’s under liquid.
      //Right now this only fires for “low water” because fd is tied to the base floor.
      //Making “high water” (raised rivers/pools) work is trivial—
      //just separate water height from floor height.
      if (fd < 0) {
        const waterDepth = fd < 0 ? -fd : 0; //world units below base
        //Tunables (world-unit based, independent of player eye height)
        const WATER_FULL_COVER_UNITS = 1.2; //depth at which we approach max cover
        const depthNorm = clamp(waterDepth / WATER_FULL_COVER_UNITS, 0, 1);
        //Quadratic ease (gentler start): depthNorm^2
        const autoCover = depthNorm;
        const coverFrac = clamp(autoCover, 0, 1);
        occludedBottom = Math.min(
          finalSpriteHeight - 1,
          Math.round(finalSpriteHeight * coverFrac)
        );
      }
    }
  } else {
    const topY = Math.round(horizon - finalSpriteHeight * 0.5);
    startY = topY;
    endY = topY + finalSpriteHeight;
  }

  const verticalPosition = { startY, endY };
  const drawStartX = Math.round(screenCenterPixelX - (finalSpriteWidth >> 1));
  const drawEndX = drawStartX + finalSpriteWidth;

  return {
    drawStartX,
    drawEndX,
    drawStartY: verticalPosition.startY,
    drawEndY: verticalPosition.endY,
    depth: cameraSpaceY,
    size: finalSpriteHeight,
    width: drawEndX - drawStartX,
    occludedBottom,
  };
}
//Debug helpers
export function debugDrawFloorAndHorizonLines(g) {
  g.save();
  g.strokeStyle = "rgba(0,255,0,0.35)";
  g.beginPath();
  g.moveTo(0, HEIGHT >> 1);
  g.lineTo(WIDTH, HEIGHT >> 1);
  g.stroke();

  g.strokeStyle = "rgba(255,0,0,0.35)";
  g.beginPath();
  g.moveTo(0, HEIGHT - 1);
  g.lineTo(WIDTH, HEIGHT - 1);
  g.stroke();
  g.restore();
}

export function debugStrokeSpriteBox(g, s, basis, color = "#0ff") {
  const p = projectSprite(s, basis);
  if (!p) {
    return;
  }
  g.save();
  g.strokeStyle = color;
  g.strokeRect(
    p.drawStartX + 0.5,
    p.drawStartY + 0.5,
    p.drawEndX - p.drawStartX - 1,
    p.drawEndY - p.drawStartY - 1
  );
  g.restore();
}
