// @ts-check
// Outdoors the wind is never exactly zero, so a zero wind after a load outdoors is the indoor wind carried out,
// and the load asks for a new one.

export const windStaleOutdoors = (/** @type {boolean} */ inside, /** @type {ReadonlyArray<number>} */ wind) => !inside && Array.isArray(wind) && wind.length === 3 && wind.every((c) => c === 0);
