import { entityTypes } from "../both/SharedConstants.js";
export const colorMap = {
  0: "#0c1220", //empty/floor
  1: "#ECDE60", //wallpaper
  2: "#707a88", //Gray stone (blue-gray)
  3: "#00e676", //Hedges
  4: "#996633", //Impassible door
  5: "#FFE300", //exit portal
  6: " #3561ff", //blue door (passable)
  7: "#00FFFF", //flesh
};
export const spriteColorMap = {
  [entityTypes.entity]: "#ffeb9c",
  [entityTypes.barrel]: "#CD1C18",
  [entityTypes.key]: "#6aa2ff",
  [entityTypes.food]: "#7fffd4",
  default: `#ffffff`,
};
