//Procedural wall textures with pre-sliced column caching for fast rendering
//TEX array holds texture canvases, TEXCACHE pre-slices them into vertical columns
import { clamp } from "./Utils.js";
import { SampleGameWallTextures } from "./SampleGame/WallTextures.js";

//Create a canvas element with specified dimensions for texture generation
function makeTex(textureWidth = 64, textureHeight = 64) {
  const canvas = new OffscreenCanvas(textureWidth, textureHeight);
  return canvas;
}

//preinitialize array of 7 empty textures and a 0th null for "nothing here"
export const TEX = new Array(8).fill(null);

//Convert texture to column-major format for fast vertical sampling
export function cacheColumns(tex) {
  const g = tex.getContext("2d");
  const img = g.getImageData(0, 0, tex.width, tex.height);
  const cols = [];
  for (let x = 0; x < tex.width; x++) {
    const col = new Uint8ClampedArray(tex.height * 4);
    for (let y = 0; y < tex.height; y++) {
      const i = (y * tex.width + x) * 4;
      const j = y * 4;
      col[j] = img.data[i];
      col[j + 1] = img.data[i + 1];
      col[j + 2] = img.data[i + 2];
      col[j + 3] = img.data[i + 3];
    }
    cols.push({ data: col, h: tex.height });
  }
  return { cols, w: tex.width, h: tex.height };
}

//Pre-sliced texture columns for fast rendering
export const TEXCACHE = TEX.map((tex) => (tex ? cacheColumns(tex) : null));

export function addLoadedTextures(loadedTextures) {
  TEX.push(...loadedTextures);
  rebuildTextureCache();
}

//Rebuild TEXCACHE when new textures are added
function rebuildTextureCache() {
  TEXCACHE.length = 0; //Clear existing cache
  TEX.forEach((tex) => {
    TEXCACHE.push(tex ? cacheColumns(tex) : null);
  });
}

//In RC Invasion this is only length 21 with 0.05 increments, but we want smoother shading since our walls are way bigger,
//this is still WAY mor eoptimized then doing it per wall per frame every frame even if we reach int0 82 shade levels
//Eliminates 115k+ expensive operations per second

export const SHADE_LEVELS = Array.from({ length: 82 }, (_, i) => i * 0.0125);
export const SHADED_TEX = {};

function precomputeShading() {
  //Build pre-shaded versions of all textures at startup so we can just grab the images at runtime and avoid extra drawImage calls (Can probably do the same for sprites...)
  for (let texId = 1; texId < TEX.length; texId++) {
    if (!TEX[texId]) {
      continue;
    }
    SHADED_TEX[texId] = {};
    for (const shadeLevel of SHADE_LEVELS) {
      const shadedCanvas = new OffscreenCanvas(
        TEX[texId].width,
        TEX[texId].height
      );
      const g = shadedCanvas.getContext("2d");
      g.drawImage(TEX[texId], 0, 0);
      const colorValue = (shadeLevel * 255) | 0;
      g.globalCompositeOperation = "multiply";
      g.fillStyle = `rgb(${colorValue},${colorValue},${colorValue})`;
      g.fillRect(0, 0, shadedCanvas.width, shadedCanvas.height);
      SHADED_TEX[texId][shadeLevel] = shadedCanvas;
    }
  }
}

//Load a 64x64 wall texture image from assets/gfx (forced) and return a canvas
async function loadWallTexture(imageName) {
  const imagePathReal = `../assets/gfx/${imageName}`;
  //Async so use promises
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = makeTex(64, 64); //Use existing makeTex function
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.imageSmoothingEnabled = false;
      context.drawImage(img, 0, 0, 64, 64); //Force to 64x64
      resolve(canvas);
    };
    img.onerror = () =>
      reject(new Error(`Failed to load texture: ${imagePathReal}`));
    img.src = imagePathReal;
  });
}

//Load the wallpaper asynchronously and update TEX/TEXCACHE
export async function initAsyncTextures() {
  try {
    let imagesToReplace = SampleGameWallTextures;
    await loadImagesToTex(imagesToReplace);
    rebuildTextureCache();
    precomputeShading();
  } catch (err) {
    console.warn("Failed to init wall textures:", err);
  }
}

/**
 * Loads and replaces wall textures from an array of descriptors.
 *
 * @async
 * @function loadImagesToTex
 * @param {{ index: number, image: string }[]} descriptors
 *   Array of texture names to load.
 * @returns {Promise<void>} Resolves when all textures have been attempted.
 *
 * @example
 * await loadImagesToReplaceTextures([
 *   { index: 0, image: 'textures/stone.jpg' },
 * //Also supports images that don't replace existing textures
 *   {image: 'textures/brick.png' },
 * ]);
 */
async function loadImagesToTex(descriptors) {
  if (!Array.isArray(descriptors)) {
    console.warn(
      "Expected an array of { index, image } objects. In loadImagesToReplaceTextures"
    );
    return;
  }

  const promises = descriptors.map(async (desc, i) => {
    const { index, image } = desc || {};
    try {
      const tex = await loadWallTexture(image);
      if (index && index >= 0) {
        TEX[index] = tex;
      }
      return tex;
    } catch (error) {
      console.warn(
        `Failed to load texture "${image}" for index ${index} and dont support replacing with cool gmod missing texture:`,
        error
      );
      return null;
    }
  });

  await Promise.all(promises);
}
