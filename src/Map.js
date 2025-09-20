import { sampleMaps } from "./SampleGame/MapExtentions.js";

import { entityTypes } from "./both/SharedConstants.js";
import { FOG_COLOR } from "./Constants.js";
import { hexToRgb } from "./UntrustedUtils.js";
export const EXIT_POS = { x: 10, y: 8 };
export const START_POS = { x: 3.5, y: 3.5 };

//What a zone object looks like
const referenceZones = [
  {
    color: "#271810",
    x: 10,
    y: 8,
    w: 6,
    h: 6,
    cielingColorFront: "#271810",
    cielingColorBack: "#271810",
    floorColorBack: "#271810",
    fogColor: "#000000",
  },
];

export const gameStateObject = {
  MAP: [
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
  ],
  MAP_W: -1,
  MAP_H: -1,
  cielingColorFront: "",
  floorColorFront: "",
  cielingColorBack: "",
  floorColorBack: "",
  // Do not persist this map to localStorage.
  // Useful for maps with toggleables (e.g., force fields) that should reset
  // to their original on/off state when you re-enter.
  // true  -> changes are not saved
  // false -> changes persist to the map when you reenter
  // the map through it being randomly picked after playing through all of them
  dontPersist: false,
  //Changes fog/clip distance if you want something spooky
  sightDist: 15,
  //Fog colors can be changed through zones now. If you want the fog on the map to change.
  zones: [
    {
      color: "#101b2e",
      x: 0,
      y: 0,
      w: 1,
      h: 1,
    },
  ],
};

export const mapDefinitions = sampleMaps;
const zoneRgbCache = new Map();
export function getZoneBaseRgb(zoneId) {
  //pick zone color or fall back to whats defined on map object
  const mats = gameStateObject.zones;
  const key = (mats && mats[zoneId]?.color) || FOG_COLOR;
  let rgb = zoneRgbCache.get(key);
  if (!rgb) {
    rgb = hexToRgb(key);
    zoneRgbCache.set(key, rgb);
  }
  return rgb;
}

export function zoneIdAt(x, y, zones) {
  for (let i = 0; i < zones.length; i++) {
    const z = zones[i];
    const x0 = Math.min(z.x, z.x + z.w);
    const x1 = Math.max(z.x, z.x + z.w) - 1; //inclusive max
    const y0 = Math.min(z.y, z.y + z.h);
    const y1 = Math.max(z.y, z.y + z.h) - 1; //inclusive max
    if (x >= x0 && x <= x1 && y >= y0 && y <= y1) {
      return i;
    } //first match wins
  }
  return 0; //fallback to 0
}
