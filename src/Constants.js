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

//Game balance constants
export const ARROWS_FROM_QUIVER = 5;
export const HEALTH_FROM_FOOD = 10;
export const ENTITY_DAMAGE = 3.33;
export const MELEE_RANGE = 2.5;
export const START_HEALTH = 20;
export const WEAPON_COOLDOWN = 0.75;
export const MAX_SPEED = 20;
