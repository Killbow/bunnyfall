// Checks a relay setting a developer sends the hub, and answers a bad value with the refusal in
// words (null when the value is good).
import { GRANT_MODES } from '../../../src/net/grantLaw.js';
import { cellSeedOf } from '../../../src/net/cellTree.js';
import { HERALD_FAMILIES, heraldThread } from '../../../src/net/herald/heraldCard.js';
import { heraldRole } from '../../../src/net/gateHerald.js';
import { BODY_KEYS, BODY_LINE_KEYS } from '../room/constants.js';
import { bodyConfig, BODY_DEFAULT, BODY_LINE_MAX } from '../../../src/net/bossBody.js';

export const relayCfgRefusal = (k, v) => {
  if (k === 'egDrain') return v === 'on' || v === 'off' ? null : 'egDrain is on (the Spire\'s road shut - no new breach) or off';
  if (k === 'groundGate') return v === 'on' || v === 'off' ? null : 'groundGate is on (a ground room refuses a build on an older ground) or off';
  if (k === 'grantMode') return GRANT_MODES.includes(v) ? null : `grantMode is ${GRANT_MODES.join(', ')} - the spawn grants measure, enforce, or are off`;
  if (k === 'grantRoll') return v === 'on' || v === 'off' ? null : 'grantRoll is on (an encounter\'s grant rolls its species from its seed) or off';
  if (k === 'grantStrip') return v === 'on' || v === 'off' ? null : 'grantStrip is on (the relay drops a foe record its grant does not stand) or off';
  if (k === 'grantDoor') return v === 'on' || v === 'off' ? null : 'grantDoor is on (a foes room refuses a build that does not stand on spawn grants) or off';
  if (k === 'cellSeed') return cellSeedOf(v) === undefined ? 'cellSeed is off (the cell tree fixed at L0) or the level the directory seeds it at, 1 to 4 (2: 64-pixel cells)' : null;
  if (k === 'leaseDoor') return v === 'on' || v === 'off' ? null : 'leaseDoor is on (a lease room refuses a build that hands on no lease, and hears a socket in nothing but its ping while it holds no live lease) or off';
  if (k === 'lootDoor') return v === 'on' || v === 'off' ? null : 'lootDoor is on (a loot room refuses a build that reads less loot than this relay) or off';
  if (Object.values(HERALD_FAMILIES).some((f) => f.thread === k)) return heraldThread(v) === null ? `${k} is a Discord thread's id, 15 to 21 digits - not its name or its link` : null;
  if (k !== 'bossBody') return heraldRole(v) === null ? `${k} is a Discord role's id, 15 to 21 digits - not its name or its mention` : null;
  let o = null;
  try { o = JSON.parse(v); } catch {  }
  const known = (x, keys) => !!x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).every((key) => keys.includes(key));
  const ok = known(o, BODY_KEYS) && ['body', 'hull'].every((part) => o[part] === undefined || known(o[part], BODY_LINE_KEYS)) && bodyConfig(v) !== BODY_DEFAULT;
  return ok ? null : `bossBody is JSON {enforce, body: {depth, perS}, hull: {depth, perS}}, each part whole, each number 0 to ${BODY_LINE_MAX}`;
};
