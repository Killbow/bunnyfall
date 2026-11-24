// @ts-check
// Loads the code of an event that mods/contentOff.js can switch off, only while it is on. The world host asks here
// before it makes the event's pieces, so an event that is off makes nothing. Spoils recovery stays in the host.
import { contentOn } from '../mods/contentOff.js';

const LOADERS = Object.freeze({
  abyssDungeons: () => import('../worldEvents/sdHost.js'),
  dagonBreaches: () => import('../worldEvents/sigilBrokerPool.js'),
  eliteBreach: async () => ({ ...(await import('./eliteGates/egClient.js')), ...(await import('./eliteGates/egCall.js')) }),
  witchesFestival: () => import('../homes/witchesHost.js'),
});

/** @param {keyof typeof import('../mods/contentOff.js').CONTENT} key */
export const arcOn = (key) => contentOn(key);

/** @param {keyof typeof LOADERS} key @returns {Promise<any>} */
export async function loadArc(key) {
  return contentOn(key) ? LOADERS[key]() : null;
}
