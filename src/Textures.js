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
  const g = c.getContext("2d");
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
  const g = c.getContext("2d");
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
  const g = c.getContext("2d");
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
  const g = c.getContext("2d");
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
  const g = c.getContext("2d");
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
  const g = c.getContext("2d");

  g.fillStyle = "#103b5f";
  g.fillRect(28, 8, 8, 48);
  g.fillStyle = "#74c8ff";
  for (let y = 12; y < 52; y += 8) {
    g.fillRect(30, y, 4, 2);
  }
  return c;
}

//Organic membrane barrier
function paintField() {
  const c = makeTex();
  const g = c.getContext("2d");
  const w = c.width;
  const h = c.height;
  const img = g.createImageData(w, h);
  //helper: sRGB blend between two hex colors
  const blendHex = (a, b, t) => {
    const ca = parseInt(a.slice(1), 16);
    const cb = parseInt(b.slice(1), 16);
    const ar = (ca >> 16) & 255,
      ag = (ca >> 8) & 255,
      ab = ca & 255;
    const br = (cb >> 16) & 255,
      bg = (cb >> 8) & 255,
      bb = cb & 255;
    const r = (ar + (br - ar) * t) | 0;
    const g2 = (ag + (bg - ag) * t) | 0;
    const b2 = (ab + (bb - ab) * t) | 0;
    return `#${((r << 16) | (g2 << 8) | b2).toString(16).padStart(6, "0")}`;
  };
  //deterministic RNG for feature placement
  let seed = 1337;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 0xffffffff;
  //fatty lobules (round lightened blobs)
  const lobules = [];
  for (let i = 0; i < 7; i++) {
    lobules.push({
      x: 6 + rnd() * (w - 12),
      y: 6 + rnd() * (h - 12),
      r: 5 + rnd() * 9,
    });
  }
  //fatty tubules (elongated lightened streaks)
  const tubules = [];
  for (let i = 0; i < 4; i++) {
    const sx = rnd() * w,
      sy = rnd() * h;
    const ang = rnd() * Math.PI * 2;
    const len = 20 + rnd() * 28;
    const ex = sx + Math.cos(ang) * len;
    const ey = sy + Math.sin(ang) * len;
    const rad = 2.0 + rnd() * 2.5;
    tubules.push({ sx, sy, ex, ey, rad });
  }
  //distance from point to segment helper
  const distToSeg = (px, py, x1, y1, x2, y2) => {
    const vx = x2 - x1,
      vy = y2 - y1;
    const wx = px - x1,
      wy = py - y1;
    const vv = vx * vx + vy * vy || 1;
    let t = (wx * vx + wy * vy) / vv;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = x1 + t * vx - px;
    const dy = y1 + t * vy - py;
    return Math.sqrt(dx * dx + dy * dy);
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      //base undulation and roughness
      const undA = Math.sin(x * 0.23) * 0.07 + Math.cos(y * 0.19) * 0.06;
      const undB =
        Math.sin((x + y) * 0.09) * 0.05 + Math.cos((x - y) * 0.08) * 0.04;
      const stria =
        Math.sin(x * 0.6 + y * 0.15) * 0.02 +
        Math.cos(x * 0.2 - y * 0.5) * 0.015;
      const grain = (((x * 31) ^ (y * 17)) & 31) / 255 - 0.03;
      const pulse = undA + undB + stria;
      //start from flesh base
      let dynBase = "#FE6660";
      //fatty lobules (pale pus-yellow tint towards centers)
      let lobLight = 0;
      for (let i = 0; i < lobules.length; i++) {
        const dx = x - lobules[i].x,
          dy = y - lobules[i].y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < lobules[i].r) {
          lobLight = Math.max(lobLight, 1 - d / lobules[i].r);
        }
      }
      if (lobLight > 0) {
        dynBase = blendHex(dynBase, "#f3e08a", Math.min(0.45, lobLight * 0.6));
      }
      //fatty tubules (elongated light brighten)
      let tubLight = 0;
      for (let i = 0; i < tubules.length; i++) {
        const d = distToSeg(
          x,
          y,
          tubules[i].sx,
          tubules[i].sy,
          tubules[i].ex,
          tubules[i].ey
        );
        const t = 1 - Math.min(1, d / tubules[i].rad);
        if (t > 0) {
          tubLight = Math.max(tubLight, t);
        }
      }
      if (tubLight > 0) {
        dynBase = blendHex(dynBase, "#f3d37a", Math.min(0.5, tubLight * 0.8));
      }
      //pores/pits: sparse darker dots
      const pore = (x * 13 + y * 29) % 211 === 0 || ((x + y * 5) & 63) === 7;
      const poreAmt = pore ? -0.3 : 0;
      //occasional glossy highlight specks
      const spec = (x * 7 - y * 11) % 197 === 0 ? 0.16 : 0;
      const amt = pulse + grain + poreAmt + spec;
      setPx(img, x, y, shadeHex(dynBase, amt));
    }
  }
  g.putImageData(img, 0, 0);
  //semi-transparent vein lines
  g.globalAlpha = 0.5; //keep existing color choice
  g.strokeStyle = "#9F0000";
  g.lineWidth = 1;
  for (let i = 0; i < 10; i++) {
    g.beginPath();
    const y0 = 2 + i * 8;
    g.moveTo(2, y0);
    for (let x = 2; x < w - 2; x += 8) {
      const yv = y0 + Math.sin((x + i * 7) * 0.4) * 3 + (i % 2 ? 2 : -2);
      g.lineTo(x, yv);
    }
    g.stroke();
  }
  g.globalAlpha = 1;
  //darker border to frame the membrane
  g.strokeStyle = "#7E1A09"; //keep existing border color
  g.lineWidth = 2;
  g.strokeRect(1, 1, w - 2, h - 2);
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
      const context = canvas.getContext("2d");
      context.imageSmoothingEnabled = false;
      context.drawImage(img, 0, 0, 64, 64); //Force to 64x64
      resolve(canvas);
    };
    img.onerror = () =>
      reject(new Error(`Failed to load texture: ${imagePathReal}`));
    img.src = imagePathReal;
  });
}

//Load multiple wall textures and add them to TEX/TEXCACHE arrays
async function loadWallTextures(textureList) {
  const promises = textureList.map(async (texPath, index) => {
    try {
      return await loadWallTexture(texPath);
    } catch (error) {
      console.warn(`Failed to load texture ${texPath}:`, error);
      return paintBrick(); //Fallback to brick texture (Should add gmod missing file texture lmao)
    }
  });
  return Promise.all(promises);
}
//#endregion

//#region Backrooms Textures
// Load the wallpaper asynchronously and update TEX/TEXCACHE
export async function initAsyncTextures() {
  try {
    const c = await paintBackroomsWallpaper();
    TEX[1] = c; // replace placeholder at index 1
    rebuildTextureCache();
  } catch (err) {
    console.warn("Failed to init backrooms wallpaper:", err);
  }
}
//Backrooms wallpaper
async function paintBackroomsWallpaper() {
  const c = await loadWallTexture("backrooms_wallpaper.jpg");
  return c;
}
//
