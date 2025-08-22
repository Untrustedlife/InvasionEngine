/**
 * Map Editor Constants
 * Configuration values specific to the map editor functionality
 */

export const MAX_UNDO = 300;
export const DEFAULT_MAP_WIDTH = 20;
export const DEFAULT_MAP_HEIGHT = 20;
export const DEFAULT_CELL_SIZE = 16;
export const MIN_CELL_SIZE = 2;
export const MAX_CELL_SIZE = 48;
export const MIN_MAP_SIZE = 1;
export const MAX_MAP_SIZE = 256;
export const MAX_TILE_ID = 255;

//Default tile definitions
export const DEFAULT_TILES = [
  { id: 0, name: "empty", color: "#0b1020" },
  { id: 1, name: "backroomswall", color: "#ECDE60" },
  { id: 2, name: "panel", color: "#707a88" },
  { id: 3, name: "hedge", color: "#00e676" },
  { id: 4, name: "door", color: "#996633" },
  { id: 5, name: "exit", color: "#FFE300" },
  { id: 6, name: "blue_door", color: "#3561ff" },
  { id: 7, name: "[NODEOSERROR] Flesh", color: "#FE6660" },
  { id: -1, name: "infoPlayerStart", color: "#00FF00" },
  { id: -2, name: "infoPlayerExit", color: "#FF0000" },
];

//Special tile IDs for export processing
export const SPECIAL_TILES = {
  PLAYER_START: -1,
  PLAYER_EXIT: -2,
};

//Protected tiles that cannot be removed from the tile list
export const PROTECTED_TILE_IDS = [-1, -2];

//Sample map data
export const SAMPLE_MAP = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 2, 6, 2, 0, 0, 0, 0, 0, 0, 0, 2, 6, 2, 0, 0, 1],
  [1, 0, 0, 0, 2, 0, 2, 0, 0, 0, 0, 0, 0, 0, 2, 0, 2, 0, 0, 1],
  [1, 0, 0, 0, 2, 2, 2, 0, 0, 0, 0, 0, 0, 0, 2, 2, 2, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 3, 0, 0, 0, 0, 5, 0, 0, 0, 0, 3, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 3, 0, 0, 0, 0, 3, 0, 0, 0, 0, 3, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 3, 0, 3, 3, 3, 1, 3, 3, 3, 0, 3, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 3, 0, 3, 0, 0, 0, 0, 0, 3, 0, 3, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 3, 0, 3, 0, 2, 2, 2, 0, 3, 0, 3, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 3, 0, 1, 0, 2, 0, 2, 0, 1, 0, 3, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 2, 6, 2, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
];
