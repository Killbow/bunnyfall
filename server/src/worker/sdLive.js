// The Worker's live ask of the hub for the Super dungeon record, with its cache, retry, and seat
// timings. A realm sends the busy refusal while the hub does not answer.
import { SOCIAL_ROOM, SD_INTERNAL_LIVE, validSdRecord } from '../relay.js';
import { ROOM_CALL_MS } from '../relayScale.js';

export const SD_LIVE_FRESH_MS = 10_000;
export const SD_BEAT_RETRY_MS = 60_000;
// The census asks this many channels at once, so a call the runtime queues never times out unsent.
export const SD_CENSUS_BATCH = 6;
export const SD_LIVE_MISS_MS = 2_000;
export const SD_LIVE_KEEP_MS = 5 * 60_000;
export const SD_FIND_KNOWN_MS = 10 * 60_000;
export const SD_GUEST_SEATS = 64;
export const SD_PZ_WAIT_SAY_MS = 4_000;
export async function sdLiveAsk(rooms, s) {
  if (!rooms?.idFromName || !rooms?.get) return null;
  try {
    const res = await rooms.get(rooms.idFromName(SOCIAL_ROOM)).fetch(new Request(`https://relay.internal${SD_INTERNAL_LIVE}`, { method: 'POST', body: JSON.stringify({ s }), signal: AbortSignal.timeout(ROOM_CALL_MS) }));
    // `undefined` means the hub did not answer and the hello is refused busy;
    // `null` means no record and the hello is refused as closed.
    if (!res?.ok) return undefined;
    return validSdRecord((await res.json())?.rec);
  } catch (e) { console.warn('[sd] live', e?.message ?? e); return undefined; }
}
// The client retries a busy refusal; SD_NO_CLOSED is final, so never send it on hub silence.
export const SD_NO_BUSY = 'busy';
