/*
Game-specific entity definitions for BackroomsTower sample game.
This includes all the specific entity types, their behaviors, and sprite assignments.
*/

import {
  aiDrone1,
  aiDrone2,
  aiDrone3,
  barrel,
  sprites,
  food,
  keycard1,
  ball,
  sparkle,
} from "../Sprites.js";

import { entityTypes } from "../both/SharedConstants.js";
import { isSolidTile, collide } from "../Collision.js";
import { player, wave } from "../Player.js";
import {
  updateBars,
  addMsg,
  checkGameOver,
  removeAllFlesh,
} from "../Gameplay.js";
import { SFX } from "../Audio.js";
import { ENTITY_DAMAGE, HEALTH_FROM_FOOD } from "../Constants.js";
import { rollDice, chooseRandomElementFromArray } from "../UntrustedUtils.js";
import { tryCooldown } from "../Main.js";
import { createExplosionEffect, createFlashScreenEffect } from "../Effects.js";
import { clamp } from "../Utils.js";

// Game-specific entity templates
export const GAME_ENTITY_TEMPLATES = {
  [entityTypes.entity]: {
    type: entityTypes.entity,
    ground: true,
    scale: 0.66,
    floorBiasFrac: 0.2,
    animationTime: 0.0,
    animationFrame: 0,
  },
  [entityTypes.ball]: {
    type: entityTypes.ball,
    ground: false,
    scale: 0.75,
    floorBiasFrac: 0.2,
    cooldownTime: 0.5,
    health: 3,
  },
  [entityTypes.sparkle]: {
    type: entityTypes.sparkle,
    ground: false,
    scale: 0.75,
    floorBiasFrac: 0.2,
    cooldownTime: 3,
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
  [entityTypes.key]: {
    type: entityTypes.key,
    ground: true,
    scale: 0.25,
    floorBiasFrac: 0.04,
  },
};

// Global reference to spawnEntity function - will be set by the engine
let spawnEntityCallback = null;
let splashDamageCallback = null;

// Function to set the callbacks from the engine
export function setEntityCallbacks(spawnEntity, splashDamage) {
  spawnEntityCallback = spawnEntity;
  splashDamageCallback = splashDamage;
}

// Game-specific entity behaviors
export const GAME_ENTITY_BEHAVIOR = {
  [entityTypes.ball]: {
    ai(entity, dt) {
      if (!entity.alive) {
        return;
      }
      entity.cooldownTime -= dt;
      if (entity.cooldownTime <= 0) {
        entity.cooldownTime = 0.5;
        if (spawnEntityCallback) {
          sprites.push(
            spawnEntityCallback(entityTypes.sparkle, {
              x: entity.x,
              y: entity.y,
            })
          );
        }
      }

      const dx = player.x - entity.x;
      const dy = player.y - entity.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.3) {
        const sp = 1 * dt;
        const ux = dx / dist;
        const uy = dy / dist;
        const nx = entity.x + ux * sp;
        const ny = entity.y + uy * sp;

        if (!collide(nx, entity.y, 0.4)) {
          entity.x = nx;
        }
        if (!collide(entity.x, ny, 0.4)) {
          entity.y = ny;
        }
      }
      if (dist < 0.6 && entity.hurtCD <= 0) {
        player.health = Math.max(0, player.health - ENTITY_DAMAGE) | 0;

        updateBars();
        addMsg("Ball attacks!");
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
        if (entity.health > 1) {
          let murderMessages = ["Ball Hit!"];
          addMsg(chooseRandomElementFromArray(murderMessages));
          entity.health -= 1;
          SFX.killedEntity();
        } else {
          entity.alive = false;
          let murderMessages = ["Ball Busted!"];
          addMsg(chooseRandomElementFromArray(murderMessages));
          SFX.killedEntity();
        }
      } else {
        addMsg("No arrows.");
      }
    },
    onTouch(entity) {
      if (tryCooldown(entityTypes.entity, 10000)) {
        addMsg("You hear something like echoes nearby...");
      }
    },
    onExplode(entity) {
      entity.alive = false;
      SFX.killedEntity();
      addMsg("The ball is blown to bits.");
    },
  },
  [entityTypes.sparkle]: {
    ai(entity, dt) {
      if (!entity.alive) {
        return;
      }

      entity.cooldownTime -= dt;
      if (entity.cooldownTime <= 0) {
        entity.alive = false;
      }
    },
  },
  //Entity
  [entityTypes.entity]: {
    ai(entity, dt) {
      if (!entity.alive) {
        return;
      }
      //walk animation
      entity.animationTime += dt;
      if (entity.animationTime > 0.2) {
        entity.animationTime -= 0.2;
        entity.animationFrame += 1;
        entity.animationFrame %= 4;
      }
      switch (entity.animationFrame) {
        case 0:
          entity.img = aiDrone1;
          break;
        case 1:
          entity.img = aiDrone2;
          break;
        case 2:
          entity.img = aiDrone3;
          break;
        case 3:
          entity.img = aiDrone2;
          break;
      }
      const dx = player.x - entity.x;
      const dy = player.y - entity.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.3) {
        const sp = 1.5 * dt;
        const ux = dx / dist;
        const uy = dy / dist;
        const nx = entity.x + ux * sp;
        const ny = entity.y + uy * sp;
        if (!collide(nx, entity.y, 0.4)) {
          entity.x = nx;
        }
        if (!collide(entity.x, ny, 0.4)) {
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
    onExplode(entity) {
      entity.alive = false;
      SFX.killedEntity();
      addMsg("The entity is blown to gibs.");
    },
  },
  //Barrel
  [entityTypes.barrel]: {
    onHit(entity, fired) {
      if (fired) {
        entity.alive = false;
        if (splashDamageCallback) {
          splashDamageCallback(entity.x, entity.y, 2.5);
        }
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
    onExplode(entity) {
      entity.alive = false;
      if (splashDamageCallback) {
        splashDamageCallback(entity.x, entity.y, 2.5);
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
    onExplode(entity) {
      //The noods are immune to explosions
    },
  },
  //...
  [entityTypes.key]: {
    onTouch(entity) {
      entity.alive = false;
      player.hasBlueKey = true;
      SFX.door();
      addMsg("Keycard found! Find the exit!");
      removeAllFlesh();
    },
    onExplode(entity) {
      entity.alive = false;
      player.hasBlueKey = true;
      SFX.door();
      addMsg("The forcefield protecting the exit has suddenly lifted!");
      removeAllFlesh();
    },
  },
};

export function retrieveEntitySprite(e, id) {
  switch (id) {
    case entityTypes.entity:
      return aiDrone1;
    case entityTypes.ball:
      return ball;
    case entityTypes.sparkle:
      return sparkle;
    case entityTypes.barrel:
      return barrel;
    case entityTypes.food:
      return food;
    case entityTypes.key:
      return keycard1;
    default:
      return null;
  }
}

// Freeze the objects to prevent accidental modification
Object.freeze(GAME_ENTITY_TEMPLATES);
for (const k in GAME_ENTITY_TEMPLATES) {
  Object.freeze(GAME_ENTITY_TEMPLATES[k]);
}

Object.freeze(GAME_ENTITY_BEHAVIOR);
for (const k in GAME_ENTITY_BEHAVIOR) {
  Object.freeze(GAME_ENTITY_BEHAVIOR[k]);
}
