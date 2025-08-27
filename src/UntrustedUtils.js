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
