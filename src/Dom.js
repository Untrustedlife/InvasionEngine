//Set to
//width=960 height=540 if you want to use the same scale as the original
export const LOGICAL_W = 480;
export const LOGICAL_H = 270;
export const canvas = document.getElementById("view");

//Backing stores match the logical size
canvas.width = LOGICAL_W;
canvas.height = LOGICAL_H;

export const WIDTH = LOGICAL_W; //use these in all math
export const HEIGHT = LOGICAL_H;

export const offscreen = new OffscreenCanvas(WIDTH, HEIGHT);

export const ctx = offscreen.getContext("2d");
//Ensure crisp pixel-perfect scaling for the entire frame
ctx.imageSmoothingEnabled = false;
//visible context
export const vctx = canvas.getContext("2d");

//Ensure crisp pixel-perfect scaling for the entire frame
vctx.imageSmoothingEnabled = false;

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
