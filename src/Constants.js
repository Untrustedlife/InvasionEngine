//Raycaster configuration constants

//Field of view in radians (115 degrees)
export const FOV = (115 * Math.PI) / 180;
export const HALF_FOV = FOV * 0.5;

//Clipping distances in world units
export const NEAR = 0.18; //near clipping to prevent extreme wall heights
export const PROJ_NEAR = 0.6; //projection-only near distance for wall stretch prevention
export const FAR_PLANE = 15; //far clipping distance

export const MAX_SLICE_FACTOR = 1.4;

//Render scale (0-1) - lower = faster, upscaled by CSS
export const RENDER_SCALE = 0.95;

//Fog effect configuration
export const FOG_START_FRAC = 0.6; //fog starts at 60% of FAR_PLANE
export const FOG_COLOR = "#101b2e";

//Game balance constants
export const ARROWS_FROM_QUIVER = 3;
export const HEALTH_FROM_FOOD = 10;
export const REALMDRONE_DAMAGE = 3.33;

//Vignette effect parameters
export const VIGNETTE_BASE = 0.3;
export const VIGNETTE_NEAR_BOOST = 6;
export const VIGNETTE_NEAR_START = 1;
export const VIGNETTE_NEAR_END = 0.6;
export const VIGNETTE_NEAR_SCALE = 0.05;
export const VIGNETTE_SHIFT_FRAC = 0.22;
