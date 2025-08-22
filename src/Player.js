export const player = {
  x: 3.5,
  y: 3.5,
  a: 0,
  speed: 2,
  rotSpeed: 2.6,
  health: 6,
  maxHealth: 6,
  ammo: 1,
  hasBlueKey: false,
  tenacity: 20,
  maxTenacity: 20,
};

export const collisionRadius = 0.35;

export let wave = 1;
export const MIN_WAVE = 1;
export const MAX_WAVE = 99;
export function setWave(v) {
  const n = Math.max(MIN_WAVE, Math.min(MAX_WAVE, v | 0 || MIN_WAVE));
  wave = n;
}
