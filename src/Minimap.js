//Top-down minimap renderer
//Draws tiles as colored squares, sprites as dots, player as circle with facing line

import { cMini, mctx } from "./Dom.js";
import { player } from "./Player.js";
import { TAU } from "./Utils.js";
import { gameStateObject } from "./Map.js";
//Draw minimap: tiles -> sprites -> player (draw order matters)
export function drawMinimap(sprites) {
  mctx.clearRect(0, 0, cMini.width, cMini.height);

  const scale = 8; //pixels per world tile

  //Draw map tiles with material-based colors
  for (let y = 0; y < gameStateObject.MAP_H; y++) {
    for (let x = 0; x < gameStateObject.MAP_W; x++) {
      const cell = gameStateObject.MAP[y][x];

      let color = "#0c1220"; //empty/floor
      if (cell === 1) {
        color = "#6e3434";
      } //brick (red)
      else if (cell === 2) {
        color = "#707a88";
      } //Gray stone (blue-gray)
      else if (cell === 3) {
        color = "#00e676";
      } //Hedges
      else if (cell === 4) {
        color = "#996633";
      } //Impassible door
      else if (cell === 5) {
        color = "#FFE300";
      } //exit portal
      else if (cell === 6) {
        color = " #3561ff";
      } //blue door (passable)
      else if (cell === 7) {
        color = "#FE6660";
      } //flesh

      mctx.fillStyle = color;
      mctx.fillRect(2 + x * scale, 2 + y * scale, scale - 1, scale - 1); //1px gutters
    }
  }

  //Draw alive sprites as 4x4 colored squares
  for (const s of sprites) {
    if (!s.alive) {
      continue;
    }

    mctx.fillStyle =
      s.type === "demon"
        ? "#ff6a6a"
        : s.type === "barrel"
        ? "#57d694"
        : s.type === "key"
        ? "#6aa2ff"
        : s.type === "med"
        ? "#f5f1c9"
        : s.type === "ammo"
        ? "#9cf58d"
        : "#ffffff";

    mctx.fillRect(2 + s.x * scale - 2, 2 + s.y * scale - 2, 4, 4);
  }

  //Draw player circle and facing line
  mctx.fillStyle = "#e7f3ff";
  mctx.beginPath();
  mctx.arc(2 + player.x * scale, 2 + player.y * scale, 2.5, 0, TAU);
  mctx.fill();

  const dirX = Math.cos(player.a);
  const dirY = Math.sin(player.a);

  mctx.strokeStyle = "#78f3d3";
  mctx.beginPath();
  mctx.moveTo(2 + player.x * scale, 2 + player.y * scale);
  mctx.lineTo(
    2 + (player.x + dirX * 1.5) * scale,
    2 + (player.y + dirY * 1.5) * scale
  );
  mctx.stroke();
}
