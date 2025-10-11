//Top-down minimap renderer
//Draws tiles as colored squares, sprites as dots, player as circle with facing line

import { cMini, mctx } from "./Dom.js";
import { player } from "./Player.js";
import { TAU } from "./Utils.js";
import { gameStateObject } from "./Map.js";
import { spriteColorMap, colorMap } from "./SampleGame/MiniMapConstants.js";
import { WALL_MAP } from "./Textures.js";
//Draw minimap: tiles -> sprites -> player (draw order matters)
const SCALE = 6; //pixels per tile
const VIEW = 20; //tiles shown per side
const PAD = 2; //border
const HALF = Math.floor(VIEW / 2);
cMini.width = PAD + VIEW * SCALE + PAD;
cMini.height = PAD + VIEW * SCALE + PAD;

export function drawMinimap(sprites) {
  mctx.clearRect(0, 0, cMini.width, cMini.height);
  //Fast floor since these can't be negative AFAIK
  const startX = Math.max(
    0,
    Math.min((player.x | 0) - HALF, gameStateObject.MAP_W - VIEW)
  );
  const startY = Math.max(
    0,
    Math.min((player.y | 0) - HALF, gameStateObject.MAP_H - VIEW)
  );
  //Draw map tiles with material-based colors
  for (let y = 0; y < VIEW; y++) {
    for (let x = 0; x < VIEW; x++) {
      const mapY = startY + y;
      const mapX = startX + x;
      //Safe lookup (treat OOB as empty)
      const cell = gameStateObject.MAP[mapY]?.[mapX] ?? 0;
      const color = WALL_MAP[cell].miniMapColor || "#000000"; //default to black if unknown
      mctx.fillStyle = color;
      mctx.fillRect(PAD + x * SCALE, PAD + y * SCALE, SCALE - 1, SCALE - 1); //1px gutters
    }
  }

  //Sprites (relative to same window)
  for (const s of sprites) {
    if (!s.alive) {
      continue;
    }
    const sx = PAD + (s.x - startX) * SCALE;
    const sy = PAD + (s.y - startY) * SCALE;
    mctx.fillStyle = spriteColorMap[s.type] || spriteColorMap.default;
    mctx.fillRect(sx - 2, sy - 2, 4, 4);
  }

  //Player (same origin)
  const px = PAD + (player.x - startX) * SCALE;
  const py = PAD + (player.y - startY) * SCALE;

  mctx.fillStyle = "#e7f3ff";
  mctx.beginPath();
  mctx.arc(px, py, 2.5, 0, TAU);
  mctx.fill();

  const dirX = Math.cos(player.a),
    dirY = Math.sin(player.a);
  mctx.strokeStyle = "#78f3d3";
  mctx.beginPath();
  mctx.moveTo(px, py);
  mctx.lineTo(px + dirX * 1.5 * SCALE, py + dirY * 1.5 * SCALE);
  mctx.stroke();
}
