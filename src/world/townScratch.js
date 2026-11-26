// Scratch objects for the town loop of both outdoor hosts, written through every frame instead of minting garbage.
// `foes` is a thunk: the pools are declared far below the scratch, and a direct read hits the temporal dead zone.
import { personWantsToStop } from '../characters/mobilePerson.js';

/** @param {{ areEnemiesNearby: (pool:any) => boolean, foes: () => any }} deps */
export function createTownScratch({ areEnemiesNearby, foes }) {
  const local = [0, 0, 0];
  const opts = {
    playerStandingStill: false, distanceToPlayer: Infinity, sheathed: false,
    invisible: false, inBeastForm: false,
    enemiesNearby: () => areEnemiesNearby(foes()),
  };
  const seats = [];
  return {
    local,
    opts,
    gate(playerStandingStill, sheathed, invisible, inBeastForm) {
      opts.playerStandingStill = playerStandingStill;
      opts.sheathed = sheathed;
      opts.invisible = invisible;
      opts.inBeastForm = inBeastForm;
    },
    stops(person) {
      const dx = person.pos[0] - local[0], dz = person.pos[2] - local[2];
      opts.distanceToPlayer = Math.sqrt(dx * dx + dz * dz);
      return personWantsToStop(opts);
    },
    seat(i) { return seats[i] ??= { person: null, pos: null }; },
  };
}

export function createPersonTextureKeys() {
  const keys = new Map();
  return (archive, record, frame) => {
    const k = (archive * 4096 + record) * 1024 + frame;
    let v = keys.get(k);
    if (v === undefined) { v = `${archive}_${record}#${frame}`; keys.set(k, v); }
    return v;
  };
}
