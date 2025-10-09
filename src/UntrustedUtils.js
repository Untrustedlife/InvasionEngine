/**
 * Returns a random element from a non-empty array.
 * @template T
 * @param {T[]} array - The array from which to select a random element.
 * @returns {T} A random element from the array.
 * @throws Will throw an error if the array is empty or not an array.
 */
export function chooseRandomElementFromArray(array) {
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
  return Math.floor(Math.random() * x) + 1;
}

/**
 * Generates a random integer from 0 to x-1 (inclusive).
 * Unlike rollDice, this function allows 0 as a possible result.
 * @param {number} x - The upper bound (exclusive). Must be a positive number.
 * @returns {number} A random integer between 0 and x-1 (inclusive).
 */
export function rollDiceTwo(x) {
  return Math.floor(Math.random() * x);
}

/**
 * Lerps between start and end by t (0 to 1).
 * @param {number} start
 * @param {number} end
 * @param {number} t
 * @returns
 */
export function lerp(start, end, t) {
  return start + (end - start) * t;
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
