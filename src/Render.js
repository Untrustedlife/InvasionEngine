//Main raycasting renderer - casts one ray per screen column using DDA algorithm
//Draws textured walls with distance shading and fills z-buffer for sprite occlusion
//Could just add a sprite loader (all walls are 64x64)
import { ctx, WIDTH, HEIGHT } from "./Dom.js";
import {
  NEAR,
  PROJ_NEAR,
  FAR_PLANE,
  FOG_START_FRAC,
  FOG_COLOR,
  MAX_SLICE_FACTOR,
} from "./Constants.js";
import { TEXCACHE, TEX } from "./Textures.js";
import { player } from "./Player.js";
import { gameStateObject } from "./Map.js";

//Z-buffer stores wall distances for sprite depth testing
export const zBuffer = new Float32Array(WIDTH);

//Draw textured wall column using ImageData (fallback method)
//srcY/srcH select the portion of the source column to map to the visible segment
function drawColumn(g, x, y0, y1, col, shade, srcY, srcH) {
  const h = y1 - y0;
  if (h <= 0) {
    return;
  } //nothing to draw

  //step is how many source texel rows we advance per destination pixel
  const step = (srcH || col.h) / h;

  //ty accumulates the source Y (in texel space). We sample using floor(ty).
  let ty = srcY || 0;

  //Allocate a 1xH RGBA buffer. We'll fill it and blit in one putImageData.
  const img = g.createImageData(1, h);

  //Unrolled loops are unnecessary; Canvas will copy this block efficiently.
  for (let y = 0; y < h; y++) {
    //si = source index into the pre-sliced column's RGBA array.
    //Bitwise OR 0 works as fast floor for non-negative numbers.
    const si = ((ty | 0) * 4) | 0; // bitwise or (For positive)  is same as math.floor
    ty += step;

    //Apply multiplicative shade to RGB. Clamp via "| 0" to int 0..255.
    img.data[y * 4] = (col.data[si] * shade) | 0; //R
    img.data[y * 4 + 1] = (col.data[si + 1] * shade) | 0; //G
    img.data[y * 4 + 2] = (col.data[si + 2] * shade) | 0; //B
    img.data[y * 4 + 3] = 255; //A (opaque walls)
  }

  //One blit for the entire column at the required screen position.
  g.putImageData(img, x, y0);
}

//Faster wall slice draw: sample a 1px-wide column from the source texture
//and scale to the destination height using drawImage. Apply uniform shading
//via Canvas2D filter brightness for speed. This avoids per-pixel ImageData work.
//srcY/srcH select the portion of the source column to map to the visible segment
function drawWallColumnImg(g, x, y0, y1, texCanvas, texX, shade, srcY, srcH) {
  const h = y1 - y0;
  if (h <= 0) {
    return;
  }
  g.save();
  g.imageSmoothingEnabled = false;
  //Draw the column slice
  const sY = Math.max(0, Math.min(texCanvas.height, srcY || 0));
  const sH = Math.max(
    0,
    Math.min(texCanvas.height - sY, srcH || texCanvas.height)
  );
  g.drawImage(texCanvas, texX, sY, 1, sH, x, y0, 1, h);
  //Apply multiplicative shade using multiply composite for speed
  if (shade < 0.999) {
    const s = Math.max(0, Math.min(1, shade));
    const c = (s * 255) | 0;
    g.globalCompositeOperation = "multiply";
    g.fillStyle = `rgb(${c},${c},${c})`;
    g.fillRect(x, y0, 1, h);
  }
  g.restore();
}

//Draw sprite column with alpha blending - preserves transparency
const SPRITE_Y_ORIGIN_BOTTOM = false;
export function drawSpriteColumn(g, x, y0, y1, img, texX, _shade) {
  //Ensure increasing order
  if (y1 < y0) {
    const t = y0;
    y0 = y1;
    y1 = t;
  }

  //Convert to canvas top-origin if needed
  let yTop = y0;
  const h = y1 - y0;
  if (SPRITE_Y_ORIGIN_BOTTOM) {
    const H = g.canvas.height | 0;
    yTop = H - y1; //top in canvas space
    //h stays (y1-y0)
  }

  if (h <= 0) {
    return;
  }

  //Note: caller is responsible for setting any filter (batched per-sprite).
  g.imageSmoothingEnabled = false; //nearest-neighbor upscaling
  g.drawImage(img, texX, 0, 1, img.height, x, yTop, 1, h);
}
//Main raycasting function - casts rays using DDA algorithm and draws textured walls
//Fills zBuffer for sprite occlusion and draws sky/floor gradients
export function castWalls(nowSec, cameraBasisVectors, MAP, MAP_W, MAP_H) {
  const { dirX, dirY, planeX, planeY } = cameraBasisVectors; //Camera forward and plane vectors.

  //Draw sky gradient (top half)
  const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT / 2);
  sky.addColorStop(0, gameStateObject.cielingColorFront || "#6495ED");
  if (gameStateObject.cielingColorBack) {
    sky.addColorStop(0.5, gameStateObject.cielingColorBack || "#6495ED");
  }
  sky.addColorStop(0.9, FOG_COLOR);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, WIDTH, HEIGHT / 2);

  //Draw floor gradient (bottom half)
  const floor = ctx.createLinearGradient(0, HEIGHT, 0, HEIGHT / 2);
  floor.addColorStop(0.0, gameStateObject.floorColorFront || "#054213");
  floor.addColorStop(0.85, gameStateObject.floorColorBack || "#03210A");
  floor.addColorStop(0.95, FOG_COLOR);
  ctx.fillStyle = floor;
  ctx.fillRect(0, HEIGHT / 2, WIDTH, HEIGHT / 2);

  //Add atmospheric haze to prevent banding on empty rays
  const backgroundFogGradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  backgroundFogGradient.addColorStop(0.0, "rgba(16,27,46,0.08)");
  backgroundFogGradient.addColorStop(0.5, "rgba(16,27,46,0.16)");
  backgroundFogGradient.addColorStop(1.0, "rgba(16,27,46,0.20)");
  ctx.save();
  ctx.fillStyle = backgroundFogGradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.restore();

  //Cast one ray per screen column
  for (let screenColumnX = 0; screenColumnX < WIDTH; screenColumnX++) {
    //Map screen X to camera plane [-1, +1], offset by 0.5 to center pixel
    const cameraPlaneX = (2 * (screenColumnX + 0.5)) / WIDTH - 1;
    const rayDirectionX = dirX + planeX * cameraPlaneX;
    const rayDirectionY = dirY + planeY * cameraPlaneX;

    //DDA setup - current map position
    let currentMapX = player.x | 0;
    let currentMapY = player.y | 0;

    //Distance to cross one grid cell
    const deltaDistanceX = Math.abs(1 / (rayDirectionX || 1e-9));
    const deltaDistanceY = Math.abs(1 / (rayDirectionY || 1e-9));

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
      if (FAR_PLANE > 0) {
        const approximateDistance = Math.min(sideDistanceX, sideDistanceY);
        if (approximateDistance > FAR_PLANE) {
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
      continue;
    }

    //Perpendicular distance (fisheye-corrected) and true hit point
    let perpendicularDistance;
    if (wallSide === 0) {
      perpendicularDistance = sideDistanceX - deltaDistanceX;
    } else {
      perpendicularDistance = sideDistanceY - deltaDistanceY;
    }
    perpendicularDistance = Math.max(NEAR, perpendicularDistance);

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
      textureCoordinateU = hitPositionY - (hitPositionY | 0); // bitwise or (For positive)  is same as math.floor
    } else {
      //y-side (horizontal wall): use fractional part of X
      textureCoordinateU = hitPositionX - (hitPositionX | 0); // bitwise or (For positive)  is same as math.floor
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
    let textureColumnX = (textureCoordinateU * textureWidth) | 0; // bitwise or (For positive)  is same as math.floor
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

    //Project wall height to screen space (no corner softening)
    const projectionDistance =
      perpendicularDistance < PROJ_NEAR ? PROJ_NEAR : perpendicularDistance; // Faster than Math.max
    let wallLineHeight = (HEIGHT / projectionDistance) | 0;

    //Soft height limit for close walls
    const maxWallHeight = (HEIGHT * MAX_SLICE_FACTOR) | 0;
    /*
    if (wallLineHeight > maxWallHeight) {
      wallLineHeight = maxWallHeight + ((wallLineHeight - maxWallHeight) >> 2);
    }
    */

    //Compute unclipped vertical segment and derive texture source window for any clipping
    const unclippedStartY = ((HEIGHT - wallLineHeight) / 2) | 0;
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
      (textureHeight / Math.max(1, wallLineHeight));
    const sourceHeight =
      visibleHeight * (textureHeight / Math.max(1, wallLineHeight));

    //Distance shading with Y-side darkening
    let shadeAmount =
      (1 / (1 + perpendicularDistance * 0.25)) * (wallSide ? 0.5 : 1);

    //Animated effect for flesh texture
    if (hitTextureId === 7) {
      shadeAmount *= 0.8 + 0.2 * Math.sin(nowSec * 6 + screenColumnX * 0.05);
    }

    //Draw wall column using appropriate method
    if (textureCanvas) {
      drawWallColumnImg(
        ctx,
        screenColumnX,
        drawStartY,
        drawEndY,
        textureCanvas,
        textureColumnX,
        shadeAmount,
        sourceY,
        sourceHeight
      );
    } else {
      const imageColumn = textureData.cols[textureColumnX];
      drawColumn(
        ctx,
        screenColumnX,
        drawStartY,
        drawEndY,
        imageColumn,
        shadeAmount,
        sourceY,
        sourceHeight
      );
    }

    //Apply distance fog
    if (FAR_PLANE > 0 && perpendicularDistance > FAR_PLANE * FOG_START_FRAC) {
      const fogStartDistance = FAR_PLANE * FOG_START_FRAC;
      const fogEndDistance = FAR_PLANE;
      const fogLerpFactor = Math.min(
        1,
        Math.max(
          0,
          (perpendicularDistance - fogStartDistance) /
            Math.max(1e-6, fogEndDistance - fogStartDistance)
        )
      );
      if (fogLerpFactor > 0) {
        ctx.save();
        ctx.globalAlpha = fogLerpFactor * 0.85;
        ctx.fillStyle = FOG_COLOR;
        ctx.fillRect(screenColumnX, drawStartY, 1, drawEndY - drawStartY);
        ctx.restore();
      }
    }

    //Store distance for sprite depth testing
    zBuffer[screenColumnX] = perpendicularDistance;
  }
}
