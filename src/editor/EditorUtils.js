/**
 * Map Editor Utilities
 * Helper functions specific to the map editor functionality
 */

import { clamp } from "../Utils.js";

/**
 * Create a 2D map array filled with a specific value
 * @param {number} width - Map width
 * @param {number} height - Map height
 * @param {number} value - Fill value
 * @returns {number[][]} 2D array representing the map
 */
export function createMap(width, height, value) {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => value | 0)
  );
}

/**
 * Convert HSL values to hex color string
 * @param {number} hueValue - Hue (0-360)
 * @param {number} saturationValue - Saturation (0-100)
 * @param {number} lightnessValue - Lightness (0-100)
 * @returns {string} Hex color string
 */
export function hslToHex(hueValue, saturationValue, lightnessValue) {
  //Convert saturation and lightness from percentage to decimal
  const saturationDecimal = saturationValue / 100;
  const lightnessDecimal = lightnessValue / 100;

  //Helper function to calculate color component based on hue position
  const calculateHueSegment = (segmentNumber) =>
    (segmentNumber + hueValue / 30) % 12;

  //Calculate chroma (color intensity)
  const chroma =
    saturationDecimal * Math.min(lightnessDecimal, 1 - lightnessDecimal);

  //Helper function to calculate RGB component value
  const calculateColorComponent = (componentNumber) =>
    lightnessDecimal -
    chroma *
      Math.max(
        -1,
        Math.min(
          calculateHueSegment(componentNumber) - 3,
          Math.min(9 - calculateHueSegment(componentNumber), 1)
        )
      );

  //Convert decimal color value to hex string
  const convertToHexString = (colorValue) =>
    `0${Math.round(colorValue * 255).toString(16)}`.slice(-2);

  //Return final hex color string (RGB components: 0=red, 8=green, 4=blue)
  return `#${convertToHexString(
    calculateColorComponent(0)
  )}${convertToHexString(calculateColorComponent(8))}${convertToHexString(
    calculateColorComponent(4)
  )}`;
}

/**
 * Convert a name string to a constant-style identifier
 * @param {string} name - Input name
 * @returns {string} CONSTANT_STYLE name
 */
export function constify(name) {
  return (
    String(name || "")
      .trim()
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .toUpperCase() || "TILE"
  );
}

/**
 * Generate a default color for a tile ID using a stable hash-based hue
 * @param {number} tileId - Tile ID
 * @returns {string} Hex color string
 */
export function defaultColor(tileId) {
  const hueValue = (tileId * 47) % 360; //Deterministic hue based on tile ID
  const saturationValue = 60; //Moderate saturation for pleasant colors
  const lightnessValue = 45; //Medium lightness for good contrast
  return hslToHex(hueValue, saturationValue, lightnessValue);
}

/**
 * Get auto-generated name for a tile ID
 * @param {number} tileId - Tile ID
 * @returns {string} Auto-generated tile name
 */
export function autoNameFor(tileId) {
  const presetTileNames = {
    0: "empty",
    1: "brick",
    2: "panel",
    3: "hedge",
    4: "door",
    5: "exit",
    6: "blue_door",
    7: "[NODEOSERROR] Flesh",
  };
  return presetTileNames[tileId] || `tile_${tileId}`;
}

/**
 * Get canvas cell coordinates from mouse event
 * @param {MouseEvent} event - Mouse event
 * @param {HTMLCanvasElement} canvas - Canvas element
 * @param {number} cellSize - Cell size in pixels
 * @returns {{x: number, y: number}} Cell coordinates
 */
export function cellFromEvent(event, canvas, cellSize) {
  const canvasBounds = canvas.getBoundingClientRect();
  const cellPositionX = Math.floor(
    (event.clientX - canvasBounds.left) / cellSize
  );
  const cellPositionY = Math.floor(
    (event.clientY - canvasBounds.top) / cellSize
  );
  return { x: cellPositionX, y: cellPositionY };
}

/**
 * Show a toast notification
 * @param {string} message - Message to display
 */
export function showToast(message) {
  const div = document.createElement("div");
  div.textContent = message;
  div.style.position = "fixed";
  div.style.bottom = "14px";
  div.style.left = "50%";
  div.style.transform = "translateX(-50%)";
  div.style.background = "#0b162f";
  div.style.border = "1px solid #294173";
  div.style.padding = "8px 12px";
  div.style.borderRadius = "10px";
  div.style.boxShadow = "0 6px 20px #0007";
  div.style.zIndex = "1000";
  document.body.appendChild(div);
  setTimeout(() => div.remove(), 900);
}

/**
 * Safe value clamping for editor inputs
 * @param {number} value - Input value
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Clamped value
 */
export function safeClamp(value, min, max) {
  return clamp(+value | 0, min, max);
}
