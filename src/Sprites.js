//ASCII-art sprite generator - each character maps to a pixel color
//'.' = transparent, letters map to palette colors, integer scaling preserves pixel crispness
//I made a tool for making these, but that code is a mess.
import { clamp } from "./Utils.js";
import { supportsImageBitmap } from "./Dom.js";

export const SPRITE_BITMAPS = {};

export const spriteEnum = {
  aiDrone1: null,
  ball: null,
  sparkle: null,
  barrel: null,
  food: null,
  keycard1: null,
  aiDrone2: null,
  aiDrone3: null,
  pitchfork: null,
  bow: null,
};

//Convert canvas to ImageBitmap for optimal sprite rendering
async function canvasToImageBitmap(canvas) {
  if (!supportsImageBitmap || !canvas) {
    return canvas; // Fallback to canvas
  }
  try {
    // Use transferToImageBitmap if available (more efficient)
    if (canvas.transferToImageBitmap) {
      return canvas.transferToImageBitmap();
    }
    // Otherwise use createImageBitmap
    return await createImageBitmap(canvas);
  } catch (error) {
    console.warn("Sprite ImageBitmap conversion failed, using canvas:", error);
    return canvas;
  }
}

//Can add simple function for loading an actual image if i want heh
export function makeSprite(pattern, palette, scale = 1) {
  let rows = pattern
    .trim()
    .split("\n")
    .map((r) => r.replace(/\s+/g, ""));

  //Trim bottom transparent rows for proper ground alignment
  let lastSolidRow = rows.length - 1;
  while (
    lastSolidRow >= 0 &&
    rows[lastSolidRow].split("").every((ch) => ch === ".")
  ) {
    lastSolidRow--;
  }
  if (lastSolidRow >= 0 && lastSolidRow < rows.length - 1) {
    rows = rows.slice(0, lastSolidRow + 1);
  }

  const h = rows.length;
  const w = rows[0].length;
  const baselineFrac = 1;

  const src = new OffscreenCanvas(w, h);
  const g = src.getContext("2d");
  g.imageSmoothingEnabled = false;

  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const key = rows[y][x];
      const i = (y * w + x) * 4;
      if (key === ".") {
        img.data[i + 3] = 0;
        continue;
      }
      const col = palette[key] || "#ffffff";
      const v = parseInt(col.slice(1), 16);
      img.data[i] = (v >> 16) & 255;
      img.data[i + 1] = (v >> 8) & 255;
      img.data[i + 2] = v & 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);

  //Scale up with nearest-neighbor if requested
  if (scale !== 1) {
    const out = new OffscreenCanvas(w * scale, h * scale);
    const gg = out.getContext("2d");
    gg.imageSmoothingEnabled = false;
    gg.drawImage(src, 0, 0, out.width, out.height);
    out.baseline = baselineFrac;
    out.scale = scale;
    return out;
  }
  src.baseline = baselineFrac;
  src.scale = 1;
  return src;
}

export async function makeSpriteLoad(spriteName, scale) {
  const src = await loadSprite(spriteName, scale, 1);
  return src;
}

async function loadSprite(imageName, scale = 1, baselineFraction = 1.0) {
  const imagePathReal = `../assets/gfx/${imageName}`;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = new OffscreenCanvas(img.width * scale, img.height * scale);
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = false; //Pixel-perfect scaling
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      //Set properties like existing sprites
      canvas.baseline = baselineFraction;
      canvas.scale = scale;
      resolve(canvas);
    };
    img.onerror = () =>
      reject(new Error(`Failed to load sprite: ${imagePathReal}`));
    img.src = imagePathReal;
  });
}

//We could maybe make some kind of asset lookup table for this later insetad of it all being defined as variables
export async function loadAsyncSprites() {
  //Image sprites
  spriteEnum.food = await makeSpriteLoad("noodles.png", 3);
  spriteEnum.bow = await makeSpriteLoad("bow.png", 3);
  spriteEnum.pitchfork = await makeSpriteLoad("pitchfork.png", 3);
  spriteEnum.keycard1 = await makeSpriteLoad("keycard1.png", 3);
  spriteEnum.barrel = await makeSpriteLoad("emp.png", 3);
  spriteEnum.aiDrone1 = await makeSpriteLoad("aiDrone1.png", 3);
  spriteEnum.aiDrone2 = await makeSpriteLoad("aiDrone2.png", 3);
  spriteEnum.aiDrone3 = await makeSpriteLoad("aiDrone3.png", 3);
  spriteEnum.ball = await makeSpriteLoad("Palantrash1.png", 3);
  spriteEnum.sparkle = await makeSpriteLoad("sparkle.png", 3);

  // Convert all sprites to ImageBitmaps for optimal performance
  const conversionPromises = [
    { key: "food", canvas: spriteEnum.food },
    { key: "bow", canvas: spriteEnum.bow },
    { key: "pitchfork", canvas: spriteEnum.pitchfork },
    { key: "keycard1", canvas: spriteEnum.keycard1 },
    { key: "barrel", canvas: spriteEnum.barrel },
    { key: "aiDrone1", canvas: spriteEnum.aiDrone1 },
    { key: "aiDrone2", canvas: spriteEnum.aiDrone2 },
    { key: "aiDrone3", canvas: spriteEnum.aiDrone3 },
    { key: "ball", canvas: spriteEnum.ball },
    { key: "sparkle", canvas: spriteEnum.sparkle },
  ].map(async ({ key, canvas }) => {
    const optimizedSprite = await canvasToImageBitmap(canvas);
    spriteEnum[key] = optimizedSprite;
    SPRITE_BITMAPS[key] = optimizedSprite;
    return { key, optimizedSprite };
  });

  // Wait for all conversions to complete
  await Promise.all(conversionPromises);
}

//Runtime list of active sprites (enemies, pickups, effects)
export const sprites = [];
