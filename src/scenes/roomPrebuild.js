// The room of a shop or a house, built while the player reads the greeting, so the room is usually ready when the box
// closes. One room at a time. A room the door does not take is freed: another door, a changed plan (the hour, the day,
// the home), a load or a teleport, or a box never closed. A build not yet begun when the door opens never starts.

export const PREBUILD_TTL_MS = 30_000;

/** @param {{ free: (ctx: any) => void, ttlMs?: number }} deps */
export function createRoomPrebuild({ free, ttlMs = PREBUILD_TTL_MS }) {
  /** @type {{ hit: any, plan: string, done: Promise<any>, timer: any } | null} */
  let slot = null;
  let asks = 0;
  function drop() {
    asks++;
    if (!slot) return;
    const { done, timer } = slot;
    slot = null;
    clearTimeout(timer);
    done.then((ctx) => { if (ctx) free(ctx); });
  }
  /** @param {any} hit @param {string} plan @param {() => Promise<any>} build */
  function start(hit, plan, build) {
    drop();
    const done = Promise.resolve().then(build).catch(() => null);
    slot = { hit, plan, done, timer: setTimeout(drop, ttlMs) };
  }
  return {
    start,
    /** @param {any} hit @returns {(plan: string, build: () => Promise<any>) => void} */
    ask(hit) {
      drop();
      const mine = asks;
      return (plan, build) => { if (asks === mine) start(hit, plan, build); };
    },
    /** @param {any} hit @param {string} plan @returns {Promise<any>} */
    async take(hit, plan) {
      if (!slot || slot.hit !== hit || slot.plan !== plan) { drop(); return null; }
      const { done, timer } = slot;
      slot = null;
      asks++;
      clearTimeout(timer);
      return done;
    },
    drop,
    get pending() { return slot !== null; },
  };
}
