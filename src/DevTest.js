//Simple dev tests for forcefield mechanics

import { buildForcefieldRing } from "./Gameplay.js";
import { EXIT_POS } from "./Map.js";
import { player } from "./Player.js";
import { isSolidTile } from "./Collision.js";

///TThis file is mostly useless and I should remove it, yet I do dream of adding unit tests
export function runDevTests() {
  try {
    console.log("tests…");
    player.hasBlueKey = false;
    buildForcefieldRing();
    const ex = EXIT_POS.x,
      ey = EXIT_POS.y;
    const around = [
      [ex - 1, ey - 1],
      [ex, ey - 1],
      [ex + 1, ey - 1],
      [ex - 1, ey],
      [ex + 1, ey],
      [ex - 1, ey + 1],
      [ex, ey + 1],
      [ex + 1, ey + 1],
    ];
    for (const [x, y] of around) {
      console.assert(isSolidTile(x, y) === true, "ring cell solid");
    }
    console.log("Tests passed");
  } catch (e) {
    console.error("Tests failed", e);
  }
}
