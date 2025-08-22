//Camera basis vectors for raycasting - calculates forward direction and FOV plane
import { HALF_FOV } from "./Constants.js";
import { player } from "./Player.js";

//Calculate camera basis vectors from player angle and FOV
//Returns: dirX/Y (forward), planeX/Y (FOV plane), invDet (for transformations)
export function cameraBasis() {
  const dirX = Math.cos(player.a);
  const dirY = Math.sin(player.a);
  const planeX = -dirY * Math.tan(HALF_FOV);
  const planeY = dirX * Math.tan(HALF_FOV);
  const invDet = 1.0 / (planeX * dirY - dirX * planeY);
  return { dirX, dirY, planeX, planeY, invDet };
}
