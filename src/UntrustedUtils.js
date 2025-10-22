/**
 * Returns a random element from a non-empty array.
 * @template T
 * @param {T[]} array - The array from which to select a random element.
 * @returns {T} A random element from the array.
 * @throws Will throw an error if the array is empty or not an array.
 */
export function getRandomElementFromArray(array) {
  if (!Array.isArray(array) || array.length === 0) {
    throw new Error("Array must be non-empty.");
  }
  const randomIndex = rollDice(array.length) - 1;
  return array[randomIndex];
}

/**
 * Rolls a dice with x sides, returning a random integer from 1 to x (inclusive).
 * @param {number} x - The maximum value (number of sides on the dice). Must be greater than 0.
 * @returns {number} A random integer between 1 and x (inclusive).
 * @throws Will throw an error if x is less than or equal to 0.
 */
export function rollDice(x) {
  if (x <= 0) {
    throw new Error("The maximum value must be greater than 0.");
  }
  return ((Math.random() * x) | 0) + 1;
}

/**
 * Generates a random integer from 0 to x-1 (inclusive).
 * Unlike rollDice, this function allows 0 as a possible result.
 * @param {number} x - The upper bound (exclusive). Must be a positive number.
 * @returns {number} A random integer between 0 and x-1 (inclusive).
 */
export function rollDiceTwo(x) {
  return (Math.random() * x) | 0;
}

/**
 * Performs a binary search for an numerical array sorted in ascending order
 * @param {number[]} arr - The sorted array to search.
 * @param {number} value - The value to find.
 * @returns {number} The index of the nearest value in the array.
 */
export function nearestIndexInAscendingOrder(arr, value) {
  const n = arr ? arr.length : 0;
  if (n === 0) {
    return -1;
  }
  if (value <= arr[0]) {
    return 0;
  }
  if (value >= arr[n - 1]) {
    return n - 1;
  }

  let lo = 0,
    hi = n - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = arr[mid];
    if (v === value) {
      return mid;
    }
    if (v < value) {
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  //lo is the insertion point, hi = lo - 1
  return value - arr[hi] <= arr[lo] - value ? hi : lo;
}

export function lerp(start, end, t) {
  return start + (end - start) * t;
}

//Fast hex color to rgb array and back
//Assumes valid input, no error checking
//Much faster than regex or string-splitting methods
//35 == #
export function hexToRgb(hex) {
  const s = hex.charCodeAt(0) === 35 ? hex.slice(1) : hex;
  const n = parseInt(
    s.length === 3
      ? s
          .split("")
          .map((c) => c + c)
          .join("")
      : s,
    16
  );
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgbToCss(r, g, b) {
  //clamp + fast ints
  r = r < 0 ? 0 : r > 255 ? 255 : r | 0;
  g = g < 0 ? 0 : g > 255 ? 255 : g | 0;
  b = b < 0 ? 0 : b > 255 ? 255 : b | 0;
  return `rgb(${r},${g},${b})`;
}

export function hexToHue(hex) {
  //strip '#', accept 3/4/6/8 digit hex; ignore alpha if present
  const s = hex.charCodeAt(0) === 35 ? hex.slice(1) : hex;
  let r, g, b;

  if (s.length === 3 || s.length === 4) {
    //#rgb / #rgba → expand
    r = parseInt(s[0] + s[0], 16);
    g = parseInt(s[1] + s[1], 16);
    b = parseInt(s[2] + s[2], 16);
  } else {
    //#rrggbb / #rrggbbaa → read first 6
    const n = parseInt(s.slice(0, 6), 16);
    r = (n >>> 16) & 255;
    g = (n >>> 8) & 255;
    b = n & 255;
  }

  const max = r > g ? (r > b ? r : b) : g > b ? g : b;
  const min = r < g ? (r < b ? r : b) : g < b ? g : b;
  const d = max - min;
  if (d === 0) {
    return 0;
  } //grayscale

  //compute hue in degrees directly
  let h;
  if (max === r) {
    h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  } else if (max === g) {
    h = ((b - r) / d + 2) * 60;
  } else {
    h = ((r - g) / d + 4) * 60;
  }
  return h >= 360 ? h - 360 : h; //normalize [0, 360)
}

//Math helpers for raycaster

//Clamps value v between bounds a and b
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const fastClamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

//Full turn in radians (2π) for angle calculations
export const TAU = Math.PI * 2;
