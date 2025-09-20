//Raycaster configuration constants

//Field of view in radians (115 degrees)
export const FOV = (90 * Math.PI) / 180;
export const HALF_FOV = FOV * 0.5;

//Clipping distances in world units
export const NEAR = 0.01; //near clipping to prevent extreme wall heights
export const PROJ_NEAR = 0.01; //projection-only near distance for wall stretch prevention
export const FAR_PLANE = 15; //far clipping distance

export const MAX_SLICE_FACTOR = 1.4;

//Fog effect configuration
export const FOG_START_FRAC = 0.6; //fog starts at 60% of FAR_PLANE
export const FOG_COLOR = "#101b2e";

// Game-specific constants are now imported from SampleGame
import {
  ARROWS_FROM_QUIVER,
  HEALTH_FROM_FOOD,
  ENTITY_DAMAGE,
  MELEE_RANGE,
  START_HEALTH,
  WEAPON_COOLDOWN,
  MAX_SPEED,
} from "./SampleGame/GameConstants.js";

export {
  ARROWS_FROM_QUIVER,
  HEALTH_FROM_FOOD,
  ENTITY_DAMAGE,
  MELEE_RANGE,
  START_HEALTH,
  WEAPON_COOLDOWN,
  MAX_SPEED,
};
