//Game mechanics - input, movement, combat, AI, level progression

import {
  btnReset,
  btnToggleMap,
  msg,
  hpBar,
  ammoBar,
  hpText,
  ammoText,
  cMini,
} from "./Dom.js";
import { clamp } from "./Utils.js";
import { rollDice, chooseRandomElementFromArray } from "./UntrustedUtils.js";
import { resumeAudio, SFX, ensureShooterMusic } from "./Audio.js";
import { cameraBasis } from "./Camera.js";
import { zBuffer, rebuildRowDistLUT } from "./Render.js";
import { projectSprite } from "./Projection.js";
import {
  gameStateObject,
  EXIT_POS,
  START_POS,
  mapDefinitions,
  zoneIdAt,
} from "./Map.js";
import { player, collisionRadius, wave, setWave } from "./Player.js";
import { isSolidTile, collide } from "./Collision.js";
import { ChangeMapLevel, tryCooldown } from "./Main.js";
import {
  ARROWS_FROM_QUIVER,
  HEALTH_FROM_FOOD,
  ENTITY_DAMAGE,
  MELEE_RANGE,
  WEAPON_COOLDOWN,
  MAX_SPEED,
} from "./Constants.js";
import { sprites } from "./Sprites.js";
import { spawnEntity } from "./Entities.js";
import { entityTypes } from "./both/SharedConstants.js";
//Used so that you are forced to play through all levels before it randomizes
let order = 0;
export const keys = new Set();
let lastMouseX = 0;
let exitPending = false; //debounce exit transitions

export function wireInput(canvas) {
  window.addEventListener("keydown", (e) => {
    keys.add(e.code);
    resumeAudio();
    ensureShooterMusic();
    if (e.code === "Space") {
      e.preventDefault();
      fire();
    }
    if (e.code === "KeyM") {
      e.preventDefault();
      cMini.classList.toggle("visible");
    }

    if (e.code === "Enter") {
      const mouseLookEnabled =
        !!document.pointerLockElement ||
        !!document.mozPointerLockElement ||
        !!document.webkitPointerLockElement;

      if (!mouseLookEnabled) {
        if (canvas.requestPointerLock) {
          canvas.requestPointerLock();
        } else if (canvas.mozRequestPointerLock) {
          canvas.mozRequestPointerLock();
        } else if (canvas.webkitRequestPointerLock) {
          canvas.webkitRequestPointerLock();
        }
      } else {
        if (document.exitPointerLock) {
          document.exitPointerLock();
        } else if (document.mozExitPointerLock) {
          document.mozExitPointerLock();
        } else if (document.webkitExitPointerLock) {
          document.webkitExitPointerLock();
        }
      }
    }

    if (e.code === "Escape") {
      if (document.exitPointerLock) {
        document.exitPointerLock();
      } else if (document.mozExitPointerLock) {
        document.mozExitPointerLock();
      } else if (document.webkitExitPointerLock) {
        document.webkitExitPointerLock();
      }
    }

    if (e.code === "BracketLeft") {
      //[ key - decrease
      switch (player.mouseSensitivity) {
        case 0.33:
          addMsg(`Mouse sensitivity set to high.`);
          player.mouseSensitivity = 0.22;
          break;
        case 0.22:
          addMsg(`Mouse sensitivity set to medium.`);
          player.mouseSensitivity = 0.11;
          break;
        case 0.11:
          addMsg(`Mouse sensitivity set to low.`);
          player.mouseSensitivity = 0.05;
          break;
        case 0.05:
          addMsg(`Mouse sensitivity already lowest.`);
          player.mouseSensitivity = 0.05;
          break;
      }
    }

    if (e.code === "BracketRight") {
      //] key - increase
      switch (player.mouseSensitivity) {
        case 0.33:
          addMsg(`Mouse sensitivity already set to highest.`);
          player.mouseSensitivity = 0.33;
          break;
        case 0.22:
          addMsg(`Mouse sensitivity set to highest.`);
          player.mouseSensitivity = 0.33;
          break;
        case 0.11:
          addMsg(`Mouse sensitivity set to high.`);
          player.mouseSensitivity = 0.22;
          break;
        case 0.05:
          addMsg(`Mouse sensitivity set to medium.`);
          player.mouseSensitivity = 0.11;
          break;
      }
    }
  });
  window.addEventListener("keyup", (e) => keys.delete(e.code));
  canvas.addEventListener("mousedown", (e) => {
    if (e.button === 0) {
      fire();
    }
    lastMouseX = e.clientX;
    resumeAudio();
    ensureShooterMusic();
  });

  canvas.addEventListener("mousemove", (e) => {
    const mouseLookEnabled =
      !!document.pointerLockElement ||
      !!document.mozPointerLockElement ||
      !!document.webkitPointerLockElement;
    if (mouseLookEnabled) {
      //e.movementX and e.movementY are the delta since last event
      const deltaX = e.movementX * Math.PI * (0.015 * player.mouseSensitivity);
      player.a += deltaX;
    }
  });

  btnReset.onclick = () => hardReset();
  btnToggleMap.onclick = () => cMini.classList.toggle("visible");
}

export function move(dt) {
  const run = keys.has("ShiftLeft") || keys.has("ShiftRight");
  const rot = player.rotSpeed * dt;

  //CHANGED: only one dt for integration
  const accel = player.accel * dt;

  const dirX = Math.cos(player.a);
  const dirY = Math.sin(player.a);
  const leftX = -dirY;
  const leftY = dirX;

  //Update weapon animation each turn
  if (player.weaponAnim > WEAPON_COOLDOWN) {
    player.weaponAnim = -1.0;
  }
  if (player.weaponAnim >= 0.0) {
    player.weaponAnim += dt;
  }

  //linear drag (Idea is we can change friction based on zones later so we cna in fact have ice skating if we want)
  const friction = 3.0;

  //apply drag first
  player.velX -= player.velX * friction * dt;
  player.velY -= player.velY * friction * dt;

  //snap tiny velocities after damping
  if (Math.abs(player.velX) < 0.002) {
    player.velX = 0.0;
  }
  if (Math.abs(player.velY) < 0.002) {
    player.velY = 0.0;
  }

  player.isMoving = false;
  let ax = 0,
    ay = 0;

  if (keys.has("ArrowLeft")) {
    player.a -= rot;
  }
  if (keys.has("ArrowRight")) {
    player.a += rot;
  }

  if (keys.has("ArrowUp") || keys.has("KeyW")) {
    ax += dirX * accel;
    ay += dirY * accel;
    player.isMoving = true;
  }
  if (keys.has("ArrowDown") || keys.has("KeyS")) {
    ax -= dirX * accel;
    ay -= dirY * accel;
    player.isMoving = true;
  }
  if (keys.has("KeyA")) {
    ax -= leftX * accel;
    ay -= leftY * accel;
    player.isMoving = true;
  }
  if (keys.has("KeyD")) {
    ax += leftX * accel;
    ay += leftY * accel;
    player.isMoving = true;
  }

  player.velX += ax;
  player.velY += ay;

  //hypot squares then adds then square roots (SO same math just cleaner)
  const newSpeed = Math.hypot(player.velX, player.velY);

  if (newSpeed > MAX_SPEED) {
    player.velX *= MAX_SPEED / newSpeed;
    player.velY *= MAX_SPEED / newSpeed;
  }

  //Apply velocity * dt after everything else to compute position (for collisions)
  const nx = player.x + player.velX * dt,
    ny = player.y + player.velY * dt;

  if (!collide(nx, player.y, collisionRadius)) {
    player.x = nx;
  } else {
    player.velX = 0;
  }
  if (!collide(player.x, ny, collisionRadius)) {
    player.y = ny;
  } else {
    player.velY = 0;
  }
  // Check for zone changes and update player height accordingly
  if (player.health >= 0) {
    const newZoneId =
      ZONE_GRID_CACHE[(player.y | 0) * gameStateObject.MAP_W + (player.x | 0)];
    const newFloorDepth = gameStateObject.zones[newZoneId]?.floorDepth || 0;

    if (
      player._currentZoneId !== newZoneId ||
      player._currentFloorDepth !== newFloorDepth
    ) {
      player._currentZoneId = newZoneId;
      player._currentFloorDepth = newFloorDepth;
      rebuildRowDistLUT(); // Rebuild LUT when floor depth changes
    }
  }
}

export function fire() {
  if (player.weaponAnim >= 0.0) {
    return;
  }
  player.weaponAnim = 0.0;
  updateBars();
  SFX.shot();

  const basis = cameraBasis();
  const hit = pickSpriteAtCenter(basis);

  if (!hit) {
    return;
  }
  const p = projectSprite(hit, basis);
  if (p.depth > MELEE_RANGE) {
    return;
  }

  if (hit.onHit) {
    hit.onHit(hit, true);
  }
}

export function autoPickup() {
  for (const s of sprites) {
    if (!s.alive) {
      continue;
    }
    const d = Math.hypot(s.x - player.x, s.y - player.y);
    if (d >= 0.6) {
      continue;
    }
    if (s.onTouch) {
      s.onTouch(s);
    }
  }
}

export function checkExit() {
  if (exitPending) {
    return;
  } //debounce while transitioning
  const px = player.x | 0,
    py = player.y | 0;
  if (gameStateObject.MAP[py][px] === 5) {
    SFX.portal();
    addMsg(`Floor ${wave} cleared.`);
    setWave(wave + 1);
    exitPending = true;
    player.velX = 0.0;
    player.velY = 0.0;
    setTimeout(() => {
      resetLevelInOrder(true);
      exitPending = false;
    }, 100);
  }
}

export function pickSpriteAtCenter(basis) {
  //I wanted to move this outside of the function but was paranoid that it would act weird if window is resized. (Might be able to?)
  const HALF_WIDTH = document.getElementById("view").width >> 1;
  const center = HALF_WIDTH | 0; //conservative center
  const depth = zBuffer[center] || 1e9;
  let best = null;
  let bestDepth = 1e9;
  for (const s of sprites) {
    if (!s.alive) {
      continue;
    }
    const p = projectSprite(s, basis);
    if (!p) {
      continue;
    }
    if (player.sightDist > 0 && p.depth > player.sightDist) {
      continue;
    }
    if (
      center >= p.drawStartX &&
      center < p.drawEndX &&
      p.depth < depth + 0.1
    ) {
      if (p.depth < bestDepth) {
        best = s;
        bestDepth = p.depth;
      }
    }
  }
  return best;
}

export function randomEmptyTile(minDist = 2.0) {
  let tries = 0;
  while (tries++ < 200) {
    const x = ((Math.random() * (gameStateObject.MAP_W - 2)) | 0) + 1;
    const y = ((Math.random() * (gameStateObject.MAP_H - 2)) | 0) + 1;
    if (gameStateObject.MAP[y][x] !== 0) {
      continue;
    }
    const dx = x + 0.5 - player.x;
    const dy = y + 0.5 - player.y;
    if (Math.hypot(dx, dy) < minDist) {
      continue;
    }
    return { x, y };
  }
  return { x: 9, y: 9 };
}

//zoneId -> [{x,y}, ...] of NON-solid tiles inside that zone's rect
const emptyTilesByZone = new Map();

//Build once when the level loads (or call whenever we update the level)
export function buildEmptyTilesOnce() {
  emptyTilesByZone.clear();
  const { MAP_W: W, MAP_H: H, MAP, zones } = gameStateObject;
  for (let zoneId = 0; zoneId < zones.length; zoneId++) {
    const z = zones[zoneId];
    const x0r = Math.min(z.x, z.x + z.w);
    const x1r = Math.max(z.x, z.x + z.w) - 1; //inclusive
    const y0r = Math.min(z.y, z.y + z.h);
    const y1r = Math.max(z.y, z.y + z.h) - 1; //inclusive
    const x0 = clamp(x0r, 0, W - 1);
    const x1 = clamp(x1r, 0, W - 1);
    const y0 = clamp(y0r, 0, H - 1);
    const y1 = clamp(y1r, 0, H - 1);
    const list = [];
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (!isSolidTile(x, y)) {
          list.push({ x, y });
        }
      }
    }
    emptyTilesByZone.set(zoneId, list);
  }

  //console.log("Built empty tiles for zones:", emptyTilesByZone);
}

export function randomEmptyTileInZone(zoneId) {
  const arr = emptyTilesByZone.get(zoneId);
  if (!arr || arr.length === 0) {
    return null;
  }
  return chooseRandomElementFromArray(arr);
}

export function onTileChanged() {
  buildEmptyTilesOnce();
}

export function openForcefieldRing() {
  const ex = EXIT_POS.x,
    ey = EXIT_POS.y;
  for (let y = ey - 1; y <= ey + 1; y++) {
    for (let x = ex - 1; x <= ex + 1; x++) {
      if (gameStateObject.MAP[y][x] === 7) {
        gameStateObject.MAP[y][x] = 0;
      }
    }
  }
}

//Keep this aorund as this is an engine feature,
//and i dont want good code to be lost as people are meant to make more games out of our engine.
export function removeAllFlesh() {
  const w = gameStateObject.MAP_W,
    h = gameStateObject.MAP_H;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (gameStateObject.MAP[y][x] === 7) {
        gameStateObject.MAP[y][x] = 0;
      }
    }
  }
}

export function buildForcefieldRing() {
  const ex = EXIT_POS.x,
    ey = EXIT_POS.y;
  for (let y = ey - 1; y <= ey + 1; y++) {
    for (let x = ex - 1; x <= ex + 1; x++) {
      if (x === ex && y === ey) {
        continue;
      }
      gameStateObject.MAP[y][x] = 7;
    }
  }
}

export function placeSprites() {
  sprites.length = 0;
  if (rollDice(100) < 50) {
    for (let i = 0; i < rollDice(2) * ((gameStateObject.MAP_H / 20) | 0); i++) {
      const t = randomEmptyTile(1.0);
      sprites.push(
        spawnEntity(entityTypes.barrel, { x: t.x + 0.5, y: t.y + 0.5 })
      );
    }
  }

  //Spawn keycard

  let t = randomEmptyTile(4.0);
  sprites.push(spawnEntity(entityTypes.key, { x: t.x + 0.5, y: t.y + 0.5 }));

  //Spawn food

  t = randomEmptyTile(4.0);
  sprites.push(spawnEntity(entityTypes.food, { x: t.x + 0.5, y: t.y + 0.5 }));

  //Spawn enemies
  const wolfCount = Math.min(
    (2 + (wave - 1) * 2) * ((gameStateObject.MAP_H / 20) | 0),
    8
  );
  for (let i = 0; i < wolfCount; i++) {
    const t = randomEmptyTile(3.5);
    sprites.push(
      spawnEntity(entityTypes.entity, { x: t.x + 0.5, y: t.y + 0.5 })
    );
  }

  t = randomEmptyTile(4.0);
  sprites.push(spawnEntity(entityTypes.ball, { x: t.x + 0.5, y: t.y + 0.5 }));

  gameStateObject.zones.forEach((zone, idx) => {
    const zoneId = idx;
    const rules = zone.spawnRules;

    rules?.forEach((rule) => {
      const amount = Math.max(0, rule.amount | 0);
      for (let n = 0; n < amount; n++) {
        const t = randomEmptyTileInZone(zoneId);
        if (!t) {
          break;
        }
        sprites.push(
          spawnEntity(rule.entityType, { x: t.x + 0.5, y: t.y + 0.5 })
        );
      }
    });
  });
}

export function updateBars() {
  hpBar.style.width = `${(player.health / player.maxHealth) * 100}%`;
  ammoBar.style.width = `${(player.ammo / 60) * 100}%`;
  hpText.textContent = Math.max(0, player.health);
  ammoText.textContent = player.ammo;
}

let msgTimer = 0;
let gameOverTimer = 0;
let isGameOver = false;
let gameOverPopupShown = false;
const navigationTriggered = false;

export function setMsg(t) {
  msg.textContent = t;
  msgTimer = 2.2;
}

export function addMsg(text) {
  const log = document.getElementById("gameLog");
  const items = log?.querySelector(".log-items");
  if (!items) {
    return;
  }
  const first = items.firstElementChild;
  if (first) {
    const html = first.innerHTML;
    const m = html.match(/^(.*?)(?:\s+x(\d+))?$/);
    const base = m ? m[1] : html;
    const count = m && m[2] ? parseInt(m[2]) : 1;
    if (base === text) {
      const newCount = m && m[2] ? count + 1 : 2;
      first.innerHTML = `${text} x${newCount}`;
      return;
    }
  }
  const line = document.createElement("div");
  line.innerHTML = text;
  items.prepend(line);

  //Auto-scroll only when expanded
  if (!log.classList.contains("collapsed")) {
    requestAnimationFrame(() => {
      items.scrollTop = 0; //top
    });
  }
}

export function clearLog() {
  const items = document.querySelector("#gameLog .log-items");
  if (items) {
    items.innerHTML = "";
  }
}

export function tickMsg(dt) {
  if (msgTimer > 0) {
    msgTimer -= dt;
    if (msgTimer <= 0) {
      msg.textContent = player.hasBlueKey
        ? "Find the exit."
        : "Find the key card.";
    }
  }
}

export function checkGameOver() {
  if (isGameOver) {
    return;
  }
  if (player.health <= 0) {
    isGameOver = true;
    player.speed = 0;
    player.rotSpeed = 0;
    gameOverTimer = 2.0;
    addMsg("YOU DIED! Soul disconnecting from the node...");
  }
}

export function tickGameOver(dt) {
  if (!isGameOver) {
    return;
  }

  gameOverTimer -= dt;
  if (gameOverTimer <= 0) {
    showGameOverPopup();
  }
}

//Show the terminal-style game over popup
/* DO NOT FUCK WITH THIS CODE IT WAS A PAIN IN THE ASS TO MAKE WORK*/
function showGameOverPopup() {
  //Prevent multiple calls
  if (gameOverPopupShown) {
    return;
  }
  gameOverPopupShown = true; //Mark as shown
  const gameContainer = document.getElementById("game");
  if (gameContainer) {
    //Create popup dynamically with inline styles (showToast pattern)
    const popup = document.createElement("div");
    popup.style.position = "fixed";
    popup.style.top = "0";
    popup.style.left = "0";
    popup.style.width = "100vw";
    popup.style.height = "100vh";
    popup.style.background = "#ff0000";
    popup.style.display = "flex";
    popup.style.alignItems = "center";
    popup.style.justifyContent = "center";
    popup.style.zIndex = "999999";
    popup.style.fontFamily = '"Courier New", monospace';
    popup.style.opacity = "0";
    popup.style.transition = "opacity 2s ease-in";
    popup.innerHTML = `
      <div style="
        background: #000;
        border: 3px solid #04650d;
        color: #20b2db;
        width: 600px;
        max-width: 90vw;
        box-shadow: 0 0 20px #04650d;
        font-family: 'Courier New', monospace;
      ">
        <div style="
          background:#000;
          color: #04650d;
          padding: 8px 15px;
          display: flex;
          justify-content: space-between;
          font-weight: bold;
          font-size: 12px;
        ">
          <span style ="color: #FFFFFF; border: 1px solid #04650d;">Death...</span>
        </div>
        <div style="padding: 20px; min-height: 200px;">
          <div style="margin-bottom: 30px;">
            <div style="text-align: center; color: #FFFFFF; font-size: 32px; margin: 8px 0;">YOU HAVE DIED</div>
          </div>
          <div style="text-align: center; margin-top: 20px;">
            <button id="returnBtn" style="
              background: #000;
              border: 2px solid #04650d;
              color: #04650d;
              padding: 12px 24px;
              font-family: 'Courier New', monospace;
              font-size: 14px;
              font-weight: bold;
              cursor: pointer;
              text-transform: uppercase;
              letter-spacing: 1px;
            ">RETURN TO TERMINAL</button>
          </div>
        </div>
      </div>
    `;

    //Add to document.body like showToast (avoids game loop conflicts)
    document.body.appendChild(popup);

    //Add flood-protected event listener to the button
    const returnBtn = popup.querySelector("#returnBtn");
    if (returnBtn) {
      let buttonClicked = false;
      returnBtn.addEventListener("click", (e) => {
        e.preventDefault();
        if (buttonClicked) {
          return;
        } //Prevent flooding
        buttonClicked = true;
        setTimeout(() => {
          window.location.href = "../index.html";
        }, 100);
      });
    }

    //Trigger fade-in animation after a brief delay
    setTimeout(() => {
      popup.style.opacity = "1";
    }, 50);

    //Pause the game visually
    gameContainer.classList.add("game-paused");

    //Prevent game input while popup is shown
    keys.clear();
  }
}
/* YOU MAY FUCK WITH THE CODE BEYOND THIS POINT*/

export function resetLevel(changeMap = false) {
  if (changeMap) {
    ChangeMapLevel();
  }
  player.x = START_POS.x;
  player.y = START_POS.y;
  player.a = 0;
  player.hasBlueKey = false;
  gameStateObject.MAP[EXIT_POS.y][EXIT_POS.x] = 5;
  buildForcefieldRing();
  placeSprites();
  updateBars();
  addMsg(`Floor ${wave}: Find the keycard.`);
}

export function resetLevelInOrder(changeMap = false) {
  if (changeMap) {
    if (order >= mapDefinitions.length - 1) {
      ChangeMapLevel();
    } else {
      order += 1;
      ChangeMapLevel(order);
    }
  }
  player.x = START_POS.x;
  player.y = START_POS.y;
  player.a = 0;
  player.hasBlueKey = false;
  gameStateObject.MAP[EXIT_POS.y][EXIT_POS.x] = 5;
  buildForcefieldRing();
  placeSprites();
  updateBars();
  addMsg(`Floor ${wave}: Find the keycard.`);
}

export function hardReset() {
  setWave(1);
  ChangeMapLevel(0);
  resetLevel();
}

export function updateAI(dt) {
  for (const entity of sprites) {
    if (!entity.alive) {
      continue;
    }
    if (entity.ai) {
      entity.ai(entity, dt);
    }
  }
}
