/*
Core Entity System - Engine Level

This file contains the core entity system architecture that is game-agnostic.
The specific entity types and behaviors are now defined in the SampleGame folder
and imported to keep engine and game code separated.

Architecture:
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
*/

import { createExplosionEffect } from "./Effects.js";
import { sprites } from "./Sprites.js";

// Import game-specific definitions
import {
  GAME_ENTITY_TEMPLATES,
  GAME_ENTITY_BEHAVIOR,
  retrieveEntitySprite,
  setEntityCallbacks,
} from "./SampleGame/EntityDefinitions.js";

// Use the game definitions as the active templates and behaviors
export const ENTITY_TEMPLATES = GAME_ENTITY_TEMPLATES;
export const ENTITY_BEHAVIOR = GAME_ENTITY_BEHAVIOR;
//Id as entityType
let nextId = 0;

export function spawnEntity(
  id,
  position = { x: 0, y: 0 },
  overrides = undefined
) {
  const tpl = ENTITY_TEMPLATES[id];
  const proto = ENTITY_BEHAVIOR[id]; //shared methods
  //Allocate an instance whose prototype is the behavior object
  const e = Object.assign(Object.create(proto), tpl);
  //Minimal mutable state (copy only what changes)
  e.id = nextId++;
  e.x = position.x;
  e.y = position.y;
  e.dist = 0;
  e.alive = true;
  e.hurtCD = 0;
  // Set the sprite based on game definitions
  e.img = retrieveEntitySprite(e, id);
  if (overrides) {
    Object.assign(e, overrides);
  } //tweaks per spawn (E.G for a friendly entity or boss)
  return e;
}

export function splashDamage(x, y, r) {
  //Create visual effect for the explosion radius
  createExplosionEffect(x, y, r);
  for (const s of sprites) {
    if (!s.alive) {
      continue;
    }
    const d = Math.hypot(s.x - x, s.y - y);
    if (d < r) {
      if (s.onExplode) {
        s.onExplode(s);
      } else {
        s.alive = false;
      }
    }
  }
}

// Set up callbacks so game entities can access engine functions
setEntityCallbacks(spawnEntity, splashDamage);
