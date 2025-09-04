//ASCII-art sprite generator - each character maps to a pixel color
//'.' = transparent, letters map to palette colors, integer scaling preserves pixel crispness
//I made a tool for making these, but that code is a mess.
import { clamp } from "./Utils.js";

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

  const src = document.createElement("canvas");
  src.width = w;
  src.height = h;
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
    const out = document.createElement("canvas");
    out.width = w * scale;
    out.height = h * scale;
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
      const canvas = document.createElement("canvas");
      const originalWidth = img.width;
      const originalHeight = img.height;
      canvas.width = originalWidth * scale;
      canvas.height = originalHeight * scale;
      const ctx = canvas.getContext("2d");
      ctx.imageSmoothingEnabled = false; // Pixel-perfect scaling
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      // Set properties like existing sprites
      canvas.baseline = baselineFraction;
      canvas.scale = scale;
      resolve(canvas);
    };
    img.onerror = () =>
      reject(new Error(`Failed to load sprite: ${imagePathReal}`));
    img.src = imagePathReal;
  });
}

export let bow, wolfIdle, arrowQuiver, keycard1, food, barrel, pitchfork;

//We could maybe make some kind of asset lookup table for this later insetad of it all being defined as variables
export async function loadAsyncSprites() {
  //Ascii Sprites (Legacy versions)
  wolfIdle = makeSprite(
    `
  ................................
  ..............BB..BB............
  .............BbbbbbbB...........
  ...........BbbbGGGGbbbB.........
  ..........BbbbGGGGGGbbbB........
  .........BbbGGGGGGGGGGbbB.......
  ........BbbGGGgGGGGgGGbbB.......
  ........BbbGGgGyyGgGGGbbB.......
  .......BbbGGGGGGGGGGGGbbB.......
  .......BbbGGGGGGGGGGGGbbB.......
  ......BbbGGGGGGGGGGGGGGbbB......
  ......BbbGGGGgGGGGgGGGGbbB......
  ......BbbGGGGwwwwwwGGGGbbB......
  .....BbbGGGwwwWWkWWwwwGGbbB.....
  .....BbbGGGwwwwkkwwwwGGbbB......
  .....BbbGGGwwwwrwwwwGGGbbB......
  .....BbbGGGwwwwwwwwwGGGbbB......
  .....BbbGGGGwwwwwwwGGGGbbB......
  .....BbbGGGGGGGGGGGGGGGbbB......
  .....BbbGGGGGGGGGGGGGGGbbB......
  ......BbbGGGGGGGGGGGGGbbB.......
  ......BbbGGGGGGGGGGGGGbbB.......
  .......BBbbbgggGGGGgggbbBB......
  ........BBBbbbbbbbbbbbbBBB......
  ................................
  `,
    {
      B: "#2c1810", //Dark brown
      b: "#5c3d2e", //Medium brown
      g: "#7a6b5c", //Light brown/grey
      G: "#a89080", //Lighter brown
      k: "#080508", //Black
      w: "#e8e0d5", //White/cream
      W: "#f5f0e8", //Bright white
      r: "#8b4513", //Saddle brown
      y: "#ffeb9c", //Light yellow for eyes
    },
    4
  );

  barrel = makeSprite(
    `
  ............
  ....bbbb....
  ..bbGGGGbb..
  .bssssssssb.
  .bGGgGGgGGb.
  .bssssssssb.
  .bGgGGGGgGb.
  .bssssssssb.
  .bGGgGGgGGb.
  .bssssssssb.
  .bGgGGGGgGb.
  .bssssssssb.
  .bGGgGGgGGb.
  .bssssssssb.
  .bGGgGGgGGb.
  .bssssssssb.
  ..bbGGGGbb..
  ....bbbb....
  ............
  ............
  `,
    {
      k: "#0a0f10",
      g: "#FA5053",
      G: "#CD1C18",
      s: "#950606",
      b: "#0e1620",
    },
    3
  );
  arrowQuiver = makeSprite(
    `
  ............r...
  ............rr..
  ...........w..r.
  .......sb.w...rr
  .......bdw...w..
  .......sfd..w...
  ......sfffdw....
  .....sfffffdb...
  ....sfbffffss...
  ...sfbfbffs.....
  ..sfbfbfbs......
  .sfbfbfbs.......
  .sffbfbs........
  ..sffbs.........
  ...sss..........
  ................
  `,
    {
      b: "#100904", //Darker leather/border brown
      d: "#8f715b",
      f: "#5a3b1a", //Leather
      r: "#DC143C", //Red fletching
      s: "#000000", //Silver arrowhead
      w: "#4d260a", //Brown wood
    },
    3
  );

  //Image sprites
  food = await makeSpriteLoad("apple.png", 3);
  bow = await makeSpriteLoad("bow.png", 3);
  pitchfork = await makeSpriteLoad("pitchfork.png", 3);
  keycard1 = await makeSpriteLoad("keycard1.png", 3);

}
//Runtime list of active sprites (enemies, pickups, effects)
export const sprites = [];
