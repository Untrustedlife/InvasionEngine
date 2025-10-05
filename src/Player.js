export const player = {
  x: 3.5,
  y: 3.5,
  velX: 0.0,
  velY: 0.0,
  a: 0,
  accel: 10.0,
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
  sightDist: 15,
  mouseSensitivity: 0.22,
  height: 1.2, //0.8,
  calculatePlayerHeight: () => {
    if (2 - player.height < 0.01) {
      return 0.01;
    }
    //Get current zone floor depth offset
    const floorDepth = player.getCurrentFloorDepth
      ? player.getCurrentFloorDepth()
      : 0;

    return (2 - player.height - floorDepth) * 1;
  },
  getCurrentZoneId: () => {
    //This will be set by the movement/collision system
    return player._currentZoneId || 0;
  },
  getCurrentFloorDepth: () => {
    //This will be set by the movement/collision system
    return player._currentFloorDepth || 0;
  },
  _currentZoneId: 0,
  _currentFloorDepth: 0,
};
export const collisionRadius = 0.2;
export let wave = 1;
export const MIN_WAVE = 1;
export const MAX_WAVE = 99;
export function setWave(v) {
  const n = Math.max(MIN_WAVE, Math.min(MAX_WAVE, v | 0 || MIN_WAVE));
  wave = n;
}
