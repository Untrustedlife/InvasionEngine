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
import { rollDice } from "./UntrustedUtils.js";
import { resumeAudio, SFX, ensureShooterMusic } from "./Audio.js";
import { cameraBasis } from "./Camera.js";
import { drawSpriteColumn, zBuffer } from "./Render.js";
import { projectSprite } from "./Projection.js";
import { gameStateObject, EXIT_POS, START_POS, mapDefinitions } from "./Map.js";
import { player, collisionRadius, wave, setWave } from "./Player.js";
import { isSolidTile, collide } from "./Collision.js";
import { ChangeMapLevel } from "./Main.js";
import {
  ARROWS_FROM_QUIVER,
  FAR_PLANE,
  HEALTH_FROM_FOOD,
  REALMDRONE_DAMAGE,
} from "./Constants.js";
import {
  sprites,
  wolfIdle,
  barrel,
  enchantedKey,
  food,
  arrowQuiver,
  bow,
} from "./Sprites.js";

//Used so that you are forced to play through all levels before it randomizes
let order = 0;
export const keys = new Set();
let dragging = false;
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
  });
  window.addEventListener("keyup", (e) => keys.delete(e.code));
  canvas.addEventListener("mousedown", (e) => {
    if (e.button === 0) {
      fire();
    }
    dragging = true;
    lastMouseX = e.clientX;
    resumeAudio();
    ensureShooterMusic();
  });
  window.addEventListener("mouseup", () => (dragging = false));
  window.addEventListener("mousemove", (e) => {
    if (dragging) {
      const dx = e.clientX - lastMouseX;
      lastMouseX = e.clientX;
      player.a += dx * 0.0035;
    }
  });
  btnReset.onclick = () => hardReset();
  btnToggleMap.onclick = () => cMini.classList.toggle("visible");
}

export function move(dt) {
  const run = keys.has("ShiftLeft") || keys.has("ShiftRight");
  const spd = player.speed * (run ? 2 : 1) * dt;
  const rot = player.rotSpeed * dt;
  const dirX = Math.cos(player.a);
  const dirY = Math.sin(player.a);
  const leftX = -dirY;
  const leftY = dirX;
  let mx = 0,
    my = 0;
  if (keys.has("ArrowLeft")) {
    player.a -= rot;
  }
  if (keys.has("ArrowRight")) {
    player.a += rot;
  }
  if (keys.has("ArrowUp")) {
    mx += dirX * spd;
    my += dirY * spd;
  }
  if (keys.has("ArrowDown")) {
    mx -= dirX * spd;
    my -= dirY * spd;
  }
  if (keys.has("KeyW")) {
    mx += dirX * spd;
    my += dirY * spd;
  }
  if (keys.has("KeyS")) {
    mx -= dirX * spd;
    my -= dirY * spd;
  }
  if (keys.has("KeyA")) {
    mx -= leftX * spd;
    my -= leftY * spd;
  }
  if (keys.has("KeyD")) {
    mx += leftX * spd;
    my += leftY * spd;
  }
  const nx = player.x + mx,
    ny = player.y + my;
  if (!collide(nx, player.y, collisionRadius)) {
    player.x = nx;
  }
  if (!collide(player.x, ny, collisionRadius)) {
    player.y = ny;
  }
}

export function fire() {
  let fired = false;
  if (player.ammo > 0) {
    player.ammo--;
    updateBars();
    SFX.shot();
    fired = true;
  }
  const basis = cameraBasis();
  const hit = pickSpriteAtCenter(basis);
  if (hit) {
    if (hit.type === "wolf") {
      if (fired) {
        hit.alive = false;
        addMsg("Drone defeated!");
        SFX.killedDrone();
      } else {
        addMsg("No arrows.");
      }
    }
    if (hit.type === "barrel") {
      if (fired) {
        hit.alive = false;
        splashDamage(hit.x, hit.y, 2.5);
        addMsg("Kaboom!");
        SFX.explode();
      }
    }
    if (hit.type === "key") {
      hit.alive = false;
      player.hasBlueKey = true;
      SFX.door();
      addMsg("Realmchild Growths Destroyed! Find the exit!");
      removeAllFlesh();
    }
    if (hit.type === "food") {
      hit.alive = false;
      if (player.health >= player.maxHealth) {
        player.maxHealth += 1;
        player.health = clamp(
          player.health + HEALTH_FROM_FOOD,
          0,
          player.maxHealth
        );
        addMsg(`Became Stronger.`);
      } else {
        player.health = clamp(
          player.health + HEALTH_FROM_FOOD,
          0,
          player.maxHealth
        );
        addMsg(`Health restored.`);
      }
      updateBars();
      SFX.pickup();
    }
    if (hit.type === "arrows") {
      hit.alive = false;
      player.ammo = Math.min(60, player.ammo + ARROWS_FROM_QUIVER);
      updateBars();
      addMsg(`Arrows +${ARROWS_FROM_QUIVER}`);
      SFX.pickup();
    }
  } else if (!fired) {
    addMsg("No arrows. Look for quivers.");
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

    switch (s.type) {
      case "key":
        s.alive = false;
        player.hasBlueKey = true;
        SFX.door();
        addMsg("Realmchild Growths Destroyed! Find the exit!");
        removeAllFlesh();
        break;

      case "food":
        s.alive = false;
        if (player.health >= player.maxHealth) {
          addMsg(`Became Stronger`);
          player.maxHealth += 1;
          player.health = clamp(
            player.health + HEALTH_FROM_FOOD,
            0,
            player.maxHealth
          );
        } else {
          player.health = clamp(
            player.health + HEALTH_FROM_FOOD,
            0,
            player.maxHealth
          );
          addMsg(`Health +${HEALTH_FROM_FOOD}`);
        }
        updateBars();
        SFX.pickup();
        break;
      case "arrows":
        s.alive = false;
        player.ammo = Math.min(60, player.ammo + ARROWS_FROM_QUIVER);
        updateBars();
        SFX.pickup();
        addMsg(`Arrows +${ARROWS_FROM_QUIVER}`);
        break;
      default:
        break;
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
    addMsg(`You escaped! Wave ${wave} cleared.`);
    setWave(wave + 1);
    exitPending = true;
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
    if (FAR_PLANE > 0 && p.depth > FAR_PLANE) {
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

export function splashDamage(x, y, r) {
  for (const s of sprites) {
    if (!s.alive) {
      continue;
    }
    const d = Math.hypot(s.x - x, s.y - y);
    if (d < r) {
      s.alive = false;
    }
  }
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

export function placeSprites(assets) {
  const { barrel, enchantedKey, food, arrowQuiver, wolfIdle } = assets;
  sprites.length = 0;

  if (rollDice(100) < 50) {
    for (let i = 0; i < rollDice(2) * ((gameStateObject.MAP_H / 20) | 0); i++) {
      const bt = randomEmptyTile(1.0);
      sprites.push({
        x: bt.x + 0.5,
        y: bt.y + 0.5,
        img: barrel,
        type: "barrel",
        alive: true,
        dist: 0,
        ground: true,
        scale: 0.5,
        floorBias: 5,
      });
    }
  }

  const kt = randomEmptyTile(4.0);
  sprites.push({
    x: kt.x + 0.5,
    y: kt.y + 0.5,
    img: enchantedKey,
    type: "key",
    alive: true,
    dist: 0,
    ground: true,
    scale: 0.25,
    floorBias: 35,
  });
  const mt = randomEmptyTile(3.0);
  sprites.push({
    x: mt.x + 0.5,
    y: mt.y + 0.5,
    img: food,
    type: "food",
    alive: true,
    dist: 0,
    ground: true,
    scale: 0.25,
    floorBias: 35,
  });
  for (
    let i = 0;
    i < 1 + ((wave / 3) | 0) * ((gameStateObject.MAP_H / 20) | 0);
    i++
  ) {
    if (
      (i <= 1 && rollDice(100) < 50) ||
      (i < 1 && player.ammo <= 0 && rollDice(100) < 80) ||
      rollDice(100) < 25
    ) {
      const at = randomEmptyTile(3.0);
      sprites.push({
        x: at.x + 0.5,
        y: at.y + 0.5,
        img: arrowQuiver,
        type: "arrows",
        alive: true,
        dist: 0,
        ground: true,
        scale: 0.25,
        floorBias: 35,
      });
    }
  }
  const wolfCount = Math.min(
    (2 + (wave - 1) * 2) * ((gameStateObject.MAP_H / 20) | 0),
    8
  );
  for (let i = 0; i < wolfCount; i++) {
    const t = randomEmptyTile(3.5);
    sprites.push({
      x: t.x + 0.5,
      y: t.y + 0.5,
      img: wolfIdle,
      type: "wolf",
      alive: true,
      dist: 0,
      vx: 0,
      vy: 0,
      hurtCD: 0,
      ground: true,
      scale: 0.5,
      floorBias: 5,
    });
  }
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
  const line = document.createElement("div");
  line.textContent = text;
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
        : "Find the enchanted key.";
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
  const assets = { wolfIdle, barrel, enchantedKey, food, arrowQuiver };
  placeSprites(assets);
  updateBars();
  addMsg(`Wave ${wave}: Find the enchanted key.`);
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
  const assets = { wolfIdle, barrel, enchantedKey, food, arrowQuiver };
  placeSprites(assets);
  updateBars();
  addMsg(`Wave ${wave}: Find the enchanted key.`);
}

export function hardReset() {
  setWave(1);
  ChangeMapLevel(0);
  resetLevel();
}

export function updateAI(dt) {
  for (const s of sprites) {
    if (!s.alive) {
      continue;
    }
    if (s.type !== "wolf") {
      continue;
    }
    const dx = player.x - s.x;
    const dy = player.y - s.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 0.3) {
      const sp = 0.9 * dt;
      const ux = dx / dist;
      const uy = dy / dist;
      const nx = s.x + ux * sp;
      const ny = s.y + uy * sp;
      if (!isSolidTile(nx, s.y)) {
        s.x = nx;
      }
      if (!isSolidTile(s.x, ny)) {
        s.y = ny;
      }
    }
    if (dist < 0.6 && s.hurtCD <= 0) {
      player.health = Math.max(0, player.health - REALMDRONE_DAMAGE) | 0;

      updateBars();
      addMsg("Drone bite!");
      SFX.hurt();
      s.hurtCD = 0.8;
      checkGameOver();
    }
    if (s.hurtCD > 0) {
      s.hurtCD -= dt;
    }
  }
}
