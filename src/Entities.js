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
  food: "food",
});

export const ENTITY_TEMPLATES = {
  [entityTypes.entity]: {
    type: entityTypes.entity,
    ground: true,
    scale: 0.66,
    floorBiasFrac: 0.2,
  },
  [entityTypes.barrel]: {
    type: entityTypes.barrel,
    ground: true,
    scale: 0.66,
    floorBiasFrac: 0.04,
  },
  [entityTypes.food]: {
    type: entityTypes.food,
    ground: true,
    scale: 0.25,
    floorBiasFrac: 0.04,
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
import { updateBars, addMsg, checkGameOver } from "./Gameplay.js";
import { SFX } from "./Audio.js";
import { ENTITY_DAMAGE, HEALTH_FROM_FOOD } from "./Constants.js";
import { rollDice, chooseRandomElementFromArray } from "./UntrustedUtils.js";
import { tryCooldown } from "./Main.js";
import { createExplosionEffect, createFlashScreenEffect } from "./Effects.js";
import { clamp } from "./Utils.js";
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
        createFlashScreenEffect({ color: "	#740707", duration: 0.5 });
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
  [entityTypes.food]: {
    onTouch(entity) {
      entity.alive = false;
      const wasMax = player.health >= player.maxHealth;
      if (wasMax) {
        player.maxHealth += 1;
      }
      player.health = clamp(
        player.health + HEALTH_FROM_FOOD,
        0,
        player.maxHealth
      );
      addMsg(wasMax ? "Yummy!" : "Health restored.");
      updateBars();
      SFX.pickup();
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
import { wolfIdle, barrel, sprites, food } from "./Sprites.js";

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
    case entityTypes.food:
      e.img = food;
      break;
  }

  if (overrides) {
    Object.assign(e, overrides);
  } //tweaks per spawn (E.G for a friendly entity or boss)
  return e;
}

export function splashDamage(x, y, radius) {
  // Create visual effect for the explosion radius
  createExplosionEffect(x, y, radius);
  for (const s of sprites) {
    if (!s.alive) {
      continue;
    }
    const d = Math.hypot(s.x - x, s.y - y);
    if (d < radius) {
      if (s.type === itemTypes.barrel) {
        s.alive = false;
        splashDamage(s.x, s.y, 2.5);
      }
      s.alive = false;
    }
  }
}
