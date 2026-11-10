// @ts-check
// ENTRY-HOLD: A SHARED DUNGEON'S ENEMIES WAIT FOR THE ROOM'S HOST.
// Until the relay names a dungeon room's host, every client ran its own enemies as if it were the host, so two players
// could briefly hold two different rooms. While held, the layout enemies are not drawn and decide nothing. The hold ends
// when this client is named host, when it is a mirror and the host's data has landed (so the enemies appear as the host
// has them), when the place is not a shared dungeon room, or after ENTRY_HOLD_MAX_MS with no word (the silent-host
// patience), and the ordinary seat law decides from there.
import { FOES_STALE_MS } from './wire.js';

/** The longest a dungeon's enemies are held on entry with no word from a host. */
export const ENTRY_HOLD_MAX_MS = FOES_STALE_MS;

/** One dungeon visit's hold. `begin` when the dungeon is built online, `step` every online frame. */
export function createEntryHold(maxMs = ENTRY_HOLD_MAX_MS) {
  /** @type {number|null} when the hold began; null while nothing is held */
  let since = null;
  return {
    get held() { return since != null; },
    /** @param {number} now */
    begin(now) { since = now; },
    end() { since = null; },
    /** One frame's verdict: whether the enemies are still held. `shared` this place's room is a shared dungeon room;
     *  `joined` this client is in that room and the relay has named its host; `mine` that host is this client; `synced`
     *  the host's data has landed here.
     *  @param {{ now: number, shared: boolean, joined: boolean, mine: boolean, synced: boolean }} s */
    step({ now, shared, joined, mine, synced }) {
      if (since == null) return false;
      if (!shared || now - since >= maxMs || (joined && (mine || synced))) since = null;
      return since != null;
    },
  };
}
