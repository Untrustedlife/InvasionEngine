export const player = {
  x: 3.5,
  y: 3.5,
  velX: 0.0,
  velY: 0.0,
  a: 0,
  accel: 6.0,
  rotSpeed: 2.6,
  health: 6,
  maxHealth: 20,
  ammo: 1,
  hasBlueKey: false,
  isMoving: false,
  weaponAnim: -1.0,
  tenacity: 20,
  maxTenacity: 20,
  height: 0.75,
  calculatePlayerHeight: () => {
    if (player.height < 0.01) {
      return 0.01;
    }
    return player.height * 1;
  },
};
export const collisionRadius = 0.2;
export let wave = 1;
export const MIN_WAVE = 1;
export const MAX_WAVE = 99;
export function setWave(v) {
  const n = Math.max(MIN_WAVE, Math.min(MAX_WAVE, v | 0 || MIN_WAVE));
  wave = n;
}
