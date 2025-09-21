//Collision detection against tile map
//Handles solid tiles, special doors, and player movement bounds
import { gameStateObject } from "./Map.js";
import { player } from "./Player.js";

//Check if tile at (x,y) blocks movement
//Special cases: EXIT(5) and BLUE_DOOR(6) are walkable, FORCEFIELD(7) needs blue key
export function isSolidTile(x, y) {
  if (
    x < 0 ||
    y < 0 ||
    x >= gameStateObject.MAP_W ||
    y >= gameStateObject.MAP_H
  ) {
    return true;
  }
  const cell = gameStateObject.MAP[y | 0][x | 0];
  if (cell === 0) {
    return false;
  }
  if (cell === 5) {
    return false;
  }

  if (cell === 7) {
    return !player.hasBlueKey;
  }
  if (cell === 6) {
    return false;
  }
  if (cell === 9) {
    return false;
  }
  return true;
}

//Test circular collider at position (nx, ny) with radius r
//Samples center and 4 axis points for fast approximation
export function collide(nx, ny, r) {
  if (isSolidTile(nx, ny)) {
    return true;
  }
  if (isSolidTile(nx - r, ny)) {
    return true;
  }
  if (isSolidTile(nx + r, ny)) {
    return true;
  }
  if (isSolidTile(nx, ny - r)) {
    return true;
  }
  if (isSolidTile(nx, ny + r)) {
    return true;
  }
  return false;
}
