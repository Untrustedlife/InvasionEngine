/*
Why not use a polymorphic class hierarchy here?

In a typical engine I might model mobs/items with classes and inheritance.
But in plain JavaScript (no TS types), class trees are harder to maintain,
serialize, and extend. This file sticks to a faster, more data-driven approach:

- ENTITY_TEMPLATES: immutable per-type data (sprite, scale, flags, etc.)
- ENTITY_BEHAVIOR: shared methods per type (ai/onHit/onTouch) on a prototype
- spawnEntity(): creates a tiny instance via Object.create(proto) and copies
  only the mutable fields (x, y, alive, cooldowns, etc.)

Benefits:
- Simple to add content (add a template + behavior entry, then spawn)
- Fast and GC-friendly (stable shapes; no deep clones of big objects)
- Safe (templates are frozen; no accidental shared state)
- Easy save/load (store {id, type, x, y, hp…} + relink behavior on load)
- Easy to debug (plain objects; no complex inheritance chains)
If we ever move to TypeScript, we can layer interfaces/types/classes on top of this.

Edit:
We might be bale to move the object definitiosn for each type to their own type associated file and just ...type for each one. 
Then we could also move functions out of "gameplay" and into these files so we don't need to export them.

*/

//#region TYPES
export const entityTypes = Object.freeze({
  entity: "entity",
  barrel: "barrel",
});

export const ENTITY_TEMPLATES = {
  [entityTypes.entity]: {
    type: entityTypes.entity,
    ground: true,
    scale: 0.66,
    floorBias: 3,
  },
  [entityTypes.barrel]: {
    type: entityTypes.barrel,
    ground: true,
    scale: 0.5,
    floorBias: 5,
  },
};
Object.freeze(ENTITY_TEMPLATES);
for (const k in ENTITY_TEMPLATES) {
  Object.freeze(ENTITY_TEMPLATES[k]);
}

//#endregion
//#region BEHAVIOR
import { isSolidTile } from "./Collision.js";
import { player, wave } from "./Player.js";
import { updateBars, addMsg, checkGameOver, splashDamage } from "./Gameplay.js";
import { SFX } from "./Audio.js";
import { ENTITY_DAMAGE } from "./Constants.js";
import { rollDice, chooseRandomElementFromArray } from "./UntrustedUtils.js";
import { tryCooldown } from "./Main.js";

export const ENTITY_BEHAVIOR = {
  //Entity
  [entityTypes.entity]: {
    ai(entity, dt) {
      if (!entity.alive) {
        return;
      }
      const dx = player.x - entity.x;
      const dy = player.y - entity.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.3) {
        const sp = 0.9 * dt;
        const ux = dx / dist;
        const uy = dy / dist;
        const nx = entity.x + ux * sp;
        const ny = entity.y + uy * sp;
        if (!isSolidTile(nx, entity.y)) {
          entity.x = nx;
        }
        if (!isSolidTile(entity.x, ny)) {
          entity.y = ny;
        }
      }
      if (dist < 0.6 && entity.hurtCD <= 0) {
        player.health = Math.max(0, player.health - ENTITY_DAMAGE) | 0;

        updateBars();
        addMsg("Entity attacks!");
        SFX.hurt();
        entity.hurtCD = 0.8;
        checkGameOver();
      }
      if (entity.hurtCD > 0) {
        entity.hurtCD -= dt;
      }
    },
    onHit(entity, fired) {
      if (fired) {
        entity.alive = false;
        let murderMessages = [
          "Entity murdered!",
          "Entity destroyed!",
          "Entity purged!",
        ];
        addMsg(chooseRandomElementFromArray(murderMessages));
        SFX.killedEntity();
      } else {
        addMsg("No arrows.");
      }
    },
    onTouch(entity) {
      if (tryCooldown(entityTypes.entity, 10000)) {
        addMsg("You hear something like water nearby...");
      }
    },
  },
  //Barrel
  [entityTypes.barrel]: {
    onHit(entity, fired) {
      if (fired) {
        entity.alive = false;
        splashDamage(entity.x, entity.y, 2.5);
        addMsg("Kaboom!");
        SFX.explode();
      } else {
        addMsg("No arrows.");
      }
    },
    onTouch(entity) {
      if (tryCooldown(entityTypes.barrel, 10000)) {
        addMsg("Shooting this barrel may yield useful results...");
      }
    },
  },
  // ...
};
Object.freeze(ENTITY_BEHAVIOR);
for (const k in ENTITY_BEHAVIOR) {
  Object.freeze(ENTITY_BEHAVIOR[k]);
}

//#endregion
//Id as entityType
let nextId = 0;
import { wolfIdle, barrel } from "./Sprites.js";

export function spawnEntity(
  id,
  position = { x: 0, y: 0 },
  overrides = undefined
) {
  const tpl = ENTITY_TEMPLATES[id];
  const proto = ENTITY_BEHAVIOR[id]; // shared methods

  // Allocate an instance whose prototype is the behavior object
  const e = Object.assign(Object.create(proto), tpl);

  // Minimal mutable state (copy only what changes)
  e.id = nextId++;
  e.x = position.x;
  e.y = position.y;
  e.dist = 0;
  e.alive = true;
  e.hurtCD = 0;

  //This is messy but i can't come up with anything better rn due to how asynchronous loading works
  //Could maybe do a promise system but that seems like overkill
  //Maybe later if we have more entities
  switch (id) {
    case entityTypes.entity:
      e.img = wolfIdle;
      break;
    case entityTypes.barrel:
      e.img = barrel;
      break;
  }

  if (overrides) {
    Object.assign(e, overrides);
  } //tweaks per spawn (E.G for a friendly entity or boss)
  return e;
}
