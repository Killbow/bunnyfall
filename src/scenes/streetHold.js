// While a dungeon builds behind its door, the world frame neither simulates nor draws the street. The canvas keeps its
// last picture, and the loading screen comes up over it as for any other wait. The street goes on once the build
// ends, landed or not.

let held = false;

/** @param {boolean} on @returns {boolean} */
export function holdStreet(on) {
  held = !!on;
  return held;
}

export const streetHeld = () => held;
