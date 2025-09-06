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
import { zBuffer } from "./Render.js";
import { projectSprite } from "./Projection.js";
import { gameStateObject, EXIT_POS, START_POS, mapDefinitions } from "./Map.js";
import { player, collisionRadius, wave, setWave } from "./Player.js";
import { isSolidTile, collide } from "./Collision.js";
import { ChangeMapLevel, tryCooldown } from "./Main.js";
import {
  ARROWS_FROM_QUIVER,
  FAR_PLANE,
  HEALTH_FROM_FOOD,
  ENTITY_DAMAGE,
  MELEE_RANGE,
  WEAPON_COOLDOWN,
  MAX_SPEED,
} from "./Constants.js";
import { sprites, wolfIdle, barrel, arrowQuiver, bow } from "./Sprites.js";
import { entityTypes, spawnEntity } from "./Entities.js";

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
  const rot = player.rotSpeed * dt;
  const accel = player.accel * dt * dt;
  const dirX = Math.cos(player.a);
  const dirY = Math.sin(player.a);
  const leftX = -dirY;
  const leftY = dirX;
  const speed = Math.sqrt(player.velX * player.velX + player.velY * player.velY);

  //Update weapon animation each turn
  if (player.weaponAnim > WEAPON_COOLDOWN) {
    // done with animation
    player.weaponAnim = -1.0;
  }
  if (player.weaponAnim >= 0.0) {
    //add delta time
    player.weaponAnim += dt;
  }

  //deceleration
  const friction = 8.0
  let fdirX = -player.velX / speed;
  let fdirY = -player.velY / speed;
  
  if(Math.abs(player.velX) < 0.002){ 
	player.velX = 0.0
  }else{
  	player.velX += fdirX * friction * dt * dt;
  }

  if(Math.abs(player.velY) < 0.002){ 
	  player.velY = 0.0
  }else{
  	player.velY += fdirY * friction * dt * dt;
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

  const newSpeed = Math.sqrt(player.velX * player.velX + player.velY * player.velY);

  if(newSpeed > MAX_SPEED){
    player.velX *= MAX_SPEED / newSpeed;
    player.velY *= MAX_SPEED / newSpeed;
  }

  const nx = player.x + player.velX,
    ny = player.y + player.velY;
  if (!collide(nx, player.y, collisionRadius)) {
    player.x = nx;
  } else{
    player.velX = 0;
  }
  if (!collide(player.x, ny, collisionRadius)) {
    player.y = ny;
  }else{
    player.velY = 0;
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

  switch (hit.type) {
    case "arrows":
      hit.alive = false;
      player.ammo = Math.min(60, player.ammo + ARROWS_FROM_QUIVER);
      updateBars();
      addMsg(`Arrows +${ARROWS_FROM_QUIVER}`);
      SFX.pickup();
      break;
    default:
      if (hit.onHit) {
        hit.onHit(hit, true);
      }
      break;
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
      case "arrows":
        s.alive = false;
        player.ammo = Math.min(60, player.ammo + ARROWS_FROM_QUIVER);
        updateBars();
        SFX.pickup();
        addMsg(`Arrows +${ARROWS_FROM_QUIVER}`);
        break;
      default:
        if (s.onTouch) {
          s.onTouch(s);
        }
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
  const { arrowQuiver } = assets;
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

  //SPawn arrow quivers
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
        floorBiasFrac: 0.04,
      });
    }
  }

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
  const assets = { arrowQuiver };
  placeSprites(assets);
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
  const assets = { arrowQuiver };
  placeSprites(assets);
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
