//Set to

const isFirefox =
  typeof navigator !== "undefined" &&
  navigator.userAgent.toLowerCase().includes("firefox");
const firefoxScale = isFirefox ? 0.7 : 0.8;

export const LOGICAL_W = 960 * firefoxScale;
export const LOGICAL_H = 540 * firefoxScale;
export const canvas = document.getElementById("view");

//Backing stores match the logical size
canvas.width = LOGICAL_W;
canvas.height = LOGICAL_H;

export const WIDTH = LOGICAL_W; //use these in all math
export const HEIGHT = LOGICAL_H;

export const offscreen = new OffscreenCanvas(WIDTH, HEIGHT);

export const ctx = offscreen.getContext("2d", { colorSpace: "srgb" });
//Ensure crisp pixel-perfect scaling for the entire frame
ctx.imageSmoothingEnabled = false;
//visible context
export const vctx = canvas.getContext("2d", { colorSpace: "srgb" });

//Ensure crisp pixel-perfect scaling for the entire frame
vctx.imageSmoothingEnabled = false;
canvas.style.filter = "brightness(1.15) contrast(1.06)";

export const cMini = document.getElementById("mini");
export const mctx = cMini.getContext("2d");
mctx.imageSmoothingEnabled = false;

export const hpBar = document.getElementById("hpBar");
export const ammoBar = document.getElementById("ammoBar");
export const hpText = document.getElementById("hpText");
export const ammoText = document.getElementById("ammoText");
export const msg = document.getElementById("msg");

export const btnReset = document.getElementById("btnReset");
export const btnToggleMap = document.getElementById("btnToggleMap");

export const supportsImageBitmap =
  typeof createImageBitmap !== "undefined" &&
  typeof ImageBitmap !== "undefined";
