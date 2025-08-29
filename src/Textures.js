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

//Set pixel color in ImageData at given coordinates
function setPx(imageData, pixelX, pixelY, hexColor) {
  const pixelIndex = (pixelY * imageData.width + pixelX) * 4;
  const colorValue = parseInt(hexColor.slice(1), 16);
  imageData.data[pixelIndex] = (colorValue >> 16) & 255; //Red
  imageData.data[pixelIndex + 1] = (colorValue >> 8) & 255; //Green
  imageData.data[pixelIndex + 2] = colorValue & 255; //Blue
  imageData.data[pixelIndex + 3] = 255; //Alpha (opaque)
}

//Gray stone bricks with mortar lines
function paintBrick() {
  const c = makeTex();
  const g = c.getContext("2d", { willReadFrequently: true });
  const w = c.width;
  const h = c.height;
  const img = g.createImageData(w, h);
  const brick = ["#7a7a7a", "#8a8a8a", "#9a9a9a", "#6a6a6a"];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const mortar = y % 16 === 15 || x % 16 === 15;
      const shade = (Math.sin(x * 0.18) + Math.cos(y * 0.12)) * 0.06;
      const base = mortar
        ? "#222222"
        : brick[(((x / 16) | 0) + ((y / 16) | 0)) % brick.length];
      setPx(img, x, y, shadeHex(base, shade));
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

//Cut stone blocks with rough texture
function paintPanel() {
  const c = makeTex();
  const g = c.getContext("2d", { willReadFrequently: true });
  const w = c.width;
  const h = c.height;
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const blockEdge = x % 32 === 0 || y % 16 === 0;
      const noise =
        (Math.sin(x * 0.12) + Math.cos(y * 0.17)) * 0.07 +
        (((x ^ y) & 7) / 128 - 0.03);
      const base = blockEdge ? "#2a2a2a" : "#6a6f73";
      let col = shadeHex(base, noise);
      if ((x * 13 + y * 7) % 97 === 0) {
        col = shadeHex(col, -0.25);
      }
      setPx(img, x, y, col);
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

//Leafy hedge wall texture
function paintTech() {
  const c = makeTex();
  const g = c.getContext("2d", { willReadFrequently: true });
  const w = c.width;
  const h = c.height;
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const waves =
        Math.sin((x + y) * 0.18) * 0.1 + Math.cos((x - y) * 0.14) * 0.08;
      const dither = ((x ^ (y << 1)) & 15) / 255 - 0.02;
      let col = shadeHex("#2e6a2e", waves + dither);
      if ((x + y * 2) % 13 === 0 || (x * 3 - y) % 29 === 0) {
        col = shadeHex(col, -0.18);
      }
      if ((x * 5 + y * 7) % 101 === 0) {
        col = shadeHex(col, 0.18);
      }
      setPx(img, x, y, col);
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

//Wooden door with iron bands
function paintDoor(color = "#5b4b2a") {
  const c = makeTex();
  const g = c.getContext("2d", { willReadFrequently: true });
  const w = c.width;
  const h = c.height;
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const grain =
        Math.sin(x * 0.22 + Math.cos(y * 0.05) * 0.4) * 0.08 +
        Math.sin(y * 0.07) * 0.02;
      setPx(img, x, y, shadeHex(color, grain));
    }
  }
  g.putImageData(img, 0, 0);

  g.fillStyle = "#3a3a3a";
  g.fillRect(0, 18, w, 4);
  g.fillRect(0, 42, w, 4);

  g.fillStyle = "#6a6a6a";
  for (let x = 6; x < w; x += 12) {
    g.fillRect(x, 19, 2, 2);
    g.fillRect(x, 43, 2, 2);
  }

  g.strokeStyle = "#444";
  g.lineWidth = 2;
  g.beginPath();
  g.arc(46, 32, 4, 0, Math.PI * 2);
  g.stroke();
  return c;
}

//Exit portal with magical glow
function paintExit() {
  const c = makeTex();
  const g = c.getContext("2d", { willReadFrequently: true });
  const w = c.width,
    h = c.height;

  g.fillStyle = "#1f1f24";
  g.fillRect(0, 0, w, h);

  const cx = w / 2,
    cy = h / 2;
  const grad = g.createRadialGradient(cx, cy, 4, cx, cy, 28);
  grad.addColorStop(0, "#74CCEA");
  grad.addColorStop(0.5, "#20B2DB");
  grad.addColorStop(1, "#FFE300");
  g.fillStyle = grad;
  g.beginPath();
  g.arc(cx, cy, 26, 0, Math.PI * 2);
  g.fill();

  g.strokeStyle = "rgba(255,255,255,0.25)";
  for (let i = 0; i < 6; i++) {
    g.beginPath();
    const r = 8 + i * 3;
    g.arc(cx, cy, r, i * 0.6, i * 0.6 + Math.PI * 1.2);
    g.stroke();
  }

  g.strokeStyle = "#3a3a3a";
  g.lineWidth = 4;
  g.beginPath();
  g.arc(cx, cy, 28, 0, Math.PI * 2);
  g.stroke();
  return c;
}

//Blue door with runes
function paintBlueDoor() {
  const c = paintDoor("#6a4a2a");
  const g = c.getContext("2d", { willReadFrequently: true });

  g.fillStyle = "#103b5f";
  g.fillRect(28, 8, 8, 48);
  g.fillStyle = "#74c8ff";
  for (let y = 12; y < 52; y += 8) {
    g.fillRect(30, y, 4, 2);
  }
  return c;
}

//Forcefield? Not sure why i put so much effort into this, th emath is confusing an dits a mess.
function paintField() {
  const c = makeTex();
  const g = c.getContext("2d", { willReadFrequently: true });
  const w = c.width,
    h = c.height;
  const img = g.createImageData(w, h);
  const BASE = "#00D9FF"; //base field color
  const GRID = 5; //HEX lattice spacing (smaller = tighter grid)
  const GRID_AMP = 0.6; //how strong the hex-ish lattice is
  const EDGE_AMP = 0.1; //edge brightening
  const GRAIN_AMP = 0.04; //tiny sparkle (set to 0 to disable)

  //cos(60°)=0.5, sin(60°)=~0.8660254
  const A = 0.5;
  const B = 0.8660254;
  const cx = w * 0.5,
    cy = h * 0.5;
  const minDim = Math.min(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      //make stripes,
      //and brighten near stripe centers with (1 - |sin|).
      const u0 = x / GRID;
      const u1 = (x * A + y * B) / GRID;
      const u2 = (x * A - y * B) / GRID;

      const l0 = 1 - Math.abs(Math.sin(Math.PI * u0));
      const l1 = 1 - Math.abs(Math.sin(Math.PI * u1));
      const l2 = 1 - Math.abs(Math.sin(Math.PI * u2));
      //get a hex-like net of bright lines.
      const lattice = (l0 + l1 + l2) / 3; //0..1

      //Brighter near the border; simple linear ramp.
      let edge = 1 - Math.min(x, y, w - 1 - x, h - 1 - y) / (minDim * 0.5);
      if (edge < 0) edge = 0;
      //Cheap, deterministic sparkle—small and safe.
      const grain = ((x * 13 + y * 17) % 23) / 23 - 0.5;
      const amt = lattice * GRID_AMP + edge * EDGE_AMP + grain * GRAIN_AMP;

      setPx(img, x, y, shadeHex(BASE, amt));
    }
  }

  g.putImageData(img, 0, 0);
  g.globalAlpha = 0.35;
  g.strokeStyle = "#6FEAFF";
  g.lineWidth = 1;
  for (let i = 0; i < 9; i++) {
    g.beginPath();
    const y0 = 3 + i * Math.floor(h / 10);
    g.moveTo(2, y0);
    for (let x = 2; x < w - 2; x += 6) {
      const yv =
        y0 +
        Math.sin((x + i * 7) * 0.35) * 2.5 +
        Math.sin((x * 0.5 - i * 9) * 0.12) * 1.5;
      g.lineTo(x, yv);
    }
    g.stroke();
  }

  //Uncomment this Gwen if you want a "frame" around teh forcefield
  /*g.globalAlpha = 1;
  //Soft cyan frame to sell the “contained field” look.
  g.strokeStyle = "#20B2DB";
  g.lineWidth = 2;
  g.strokeRect(1, 1, w - 2, h - 2);*/

  return c;
}

//Texture atlas (index -> canvas). Index 0 is null for “empty/air”.
const baseTextures = [
  null,
  paintBrick(), //Replaced by backrooms wall later
  paintPanel(),
  paintTech(),
  paintDoor(),
  paintExit(),
  paintBlueDoor(),
  paintField(),
];

export const TEX = [...baseTextures];

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

// #region New Code for Backrooms Game
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
//#endregion

//#region New Textures

// Load the wallpaper asynchronously and update TEX/TEXCACHE
export async function initAsyncTextures() {
  try {
    let imagesToReplace = [
      { index: 1, image: "OfficeWall.png" },
      { index: 6, image: "OfficeDoor.png" },
      // Add more textures to replace if needed
    ];
    await loadImagesToReplaceTextures(imagesToReplace);
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
async function loadImagesToReplaceTextures(descriptors) {
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
      if (index && index >= 0 && index < TEX.length) {
        TEX[index] = tex;
      } else {
        //Textures added that dont replace are just appended
        TEX.push(tex);
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

//
