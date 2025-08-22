//Sprite projection - transforms world sprites to screen coordinates
//Ground sprites align to floor, floating sprites center on horizon
import { WIDTH, HEIGHT } from "./Dom.js";
import { clamp } from "./Utils.js";
import { player } from "./Player.js";

//Calculate sprite screen height based on distance from camera
function projectHeight(distanceFromCamera) {
  return clamp(HEIGHT / distanceFromCamera, 0, HEIGHT);
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

//Place ground sprite with perspective-correct floor alignment based on distance
function placeGrounded(spriteHeight, floorBias = 0, scaleLockFraction = 0.5) {
  const adjustedFloorBias = floorBias * 100;
  const horizonLineY = HEIGHT >> 1;
  const perspectiveBottomY =
    horizonLineY + (spriteHeight >> 1) + (adjustedFloorBias | 0);

  //Calculate transition range for floor locking effect
  const transitionStartFraction = Math.max(
    0.2,
    Math.min(0.8, scaleLockFraction - 0.15)
  );
  const transitionEndFraction = Math.max(
    transitionStartFraction + 0.08,
    Math.min(0.95, scaleLockFraction + 0.15)
  );
  const transitionStartPixels = HEIGHT * transitionStartFraction;
  const transitionEndPixels = HEIGHT * transitionEndFraction;

  //Calculate floor lock interpolation factor
  let floorLockFactor = 0;
  if (spriteHeight >= transitionStartPixels) {
    floorLockFactor = Math.min(
      1,
      (spriteHeight - transitionStartPixels) /
        Math.max(1, transitionEndPixels - transitionStartPixels)
    );
  }

  //Interpolate between perspective position and floor-locked position
  const finalBottomY =
    perspectiveBottomY * (1 - floorLockFactor) + HEIGHT * floorLockFactor;
  let spriteTopY = finalBottomY - spriteHeight;
  if (spriteTopY < 0) {
    spriteTopY = 0;
  }
  return { startY: spriteTopY, endY: finalBottomY };
}

//Place floating sprite centered on horizon line
function placeFloating(spriteHeight) {
  const horizonLineY = HEIGHT >> 1;
  let spriteTopY = horizonLineY - (spriteHeight >> 1);
  if (spriteTopY < 0) {
    spriteTopY = 0;
  }
  let spriteBottomY = spriteTopY + spriteHeight;
  if (spriteBottomY > HEIGHT) {
    spriteBottomY = HEIGHT;
  }
  return { startY: spriteTopY, endY: spriteBottomY };
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
      : sprite && sprite.img && typeof sprite.img.scale === "number"
      ? sprite.img.scale
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

  const finalSpriteHeight = Math.max(1, Math.min(HEIGHT, roundedSpriteHeight));
  const spriteImage = sprite.img;
  const aspectRatio =
    spriteImage && spriteImage.width && spriteImage.height
      ? spriteImage.width / spriteImage.height
      : 1;
  const finalSpriteWidth = Math.max(
    1,
    Math.round(finalSpriteHeight * aspectRatio)
  );

  //Calculate floor bias for ground sprites based on size and scale
  const relativeSizeFactor = finalSpriteHeight / HEIGHT;
  const effectiveFloorBias =
    (sprite.floorBias ?? 0) * worldScale * relativeSizeFactor;
  const scaleLockAmount = Math.min(0.9, Math.max(0.2, worldScale));

  const verticalPosition = sprite.ground
    ? placeGrounded(finalSpriteHeight, effectiveFloorBias, scaleLockAmount)
    : placeFloating(finalSpriteHeight);

  const drawStartX = Math.round(screenCenterPixelX - (finalSpriteWidth >> 1));
  const drawEndX = Math.min(WIDTH, drawStartX + finalSpriteWidth);

  return {
    drawStartX,
    drawEndX,
    drawStartY: verticalPosition.startY,
    drawEndY: verticalPosition.endY,
    depth: cameraSpaceY,
    size: finalSpriteHeight,
    width: drawEndX - drawStartX,
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
