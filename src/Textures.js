//Procedural wall textures with pre-sliced column caching for fast rendering
//TEX array holds texture canvases, TEXCACHE pre-slices them into vertical columns
import { clamp } from "./Utils.js";

//Create a canvas element with specified dimensions for texture generation
function makeTex(textureWidth = 64, textureHeight = 64) {
  const canvas = document.createElement("canvas");
  canvas.width = textureWidth;
  canvas.height = textureHeight;
  return canvas;
}

/*
//Shade hex color by amount using approximate gamma correction
function shadeHex(hexColor, shadeAmount) {
  const colorValue = parseInt(hexColor.slice(1), 16);
  const redChannel = (colorValue >> 16) & 255;
  const greenChannel = (colorValue >> 8) & 255;
  const blueChannel = colorValue & 255;
  const gammaCorrect = (channelValue) =>
    clamp(((channelValue / 255) ** 2.2 + shadeAmount) * 255, 0, 255) | 0;
  return `#${(
    (gammaCorrect(redChannel) << 16) |
    (gammaCorrect(greenChannel) << 8) |
    gammaCorrect(blueChannel)
  )
    .toString(16)
    .padStart(6, "0")}`;
}
*/

/*
//Set pixel color in ImageData at given coordinates
function setPx(imageData, pixelX, pixelY, hexColor) {
  const pixelIndex = (pixelY * imageData.width + pixelX) * 4;
  const colorValue = parseInt(hexColor.slice(1), 16);
  imageData.data[pixelIndex] = (colorValue >> 16) & 255; //Red
  imageData.data[pixelIndex + 1] = (colorValue >> 8) & 255; //Green
  imageData.data[pixelIndex + 2] = colorValue & 255; //Blue
  imageData.data[pixelIndex + 3] = 255; //Alpha (opaque)
}

*/


export const TEX = [null];

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
  TEXCACHE.length = 0; // Clear existing cache
  TEX.forEach((tex) => {
    TEXCACHE.push(tex ? cacheColumns(tex) : null);
  });
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

// Load the wallpaper asynchronously and update TEX/TEXCACHE
export async function initAsyncTextures() {
  try {
    let imagesToReplace = [
      { index: 1, image: "OfficeWall.png" },
      { index: 2, image: "Panel.png" },
      { index: 3, image: "Hedge.png" },
      { index: 4, image: "OfficeDoor.png" },
      { index: 5, image: "Portal.png" },
      { index: 6, image: "OfficeDoorBlue.png" },
      { index: 7, image: "Field.png" },
      // Add more textures to replace if needed
    ];
    await loadImagesToTex(imagesToReplace);
    rebuildTextureCache();
  } catch (err) {
    console.warn("Failed to init backrooms wallpaper:", err);
  }
}

/**
 * Loads and replaces wall textures from an array of descriptors.
 *
 * @async
 * @function loadImagesToReplaceTextures
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
      //Generate empty promises to be replaced once texture loads
      for(let i = 0; i < descriptors.length; i++){
	TEX.push(new Promise((resolve, reject) => {}));
      }
      const tex = await loadWallTexture(image);
      if (index && index >= 0 && index < TEX.length) {
        TEX[index] = tex;
      } 
    } catch (error) {
      console.warn(
        `Failed to load texture "${image}" for index ${index} and dont support replacing with cool gmod missing texture:`,
        error
      );
    }
  });

  await Promise.all(promises);
}
