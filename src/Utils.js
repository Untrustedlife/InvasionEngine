//Math helpers for raycaster

//Clamps value v between bounds a and b
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

//Full turn in radians (2π) for angle calculations
export const TAU = Math.PI * 2;
