//DOM acquisition helpers
import { RENDER_SCALE } from "./Constants.js";
export const canvas = document.getElementById("view");
export const ctx = canvas.getContext("2d");
//Respect internal render scale; CSS size remains via HTML attributes
if (RENDER_SCALE && RENDER_SCALE !== 1) {
  canvas.width = Math.max(1, Math.round(canvas.width * RENDER_SCALE));
  canvas.height = Math.max(1, Math.round(canvas.height * RENDER_SCALE));
}
export const WIDTH = canvas.width;
export const HEIGHT = canvas.height;

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
