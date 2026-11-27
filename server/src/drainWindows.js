// @ts-check
// A pending timer keeps a room from hibernating, so the last leave posts every open window and clears its timer.
// A failed post is not retried once the room is empty: each feed is an in-memory sample.

import { staffNetFlush, staffReactFlush, staffFeedsStop } from './staffFeeds.js';

/** @param {any} room */
const drained = (room) => room.state.getWebSockets().length === 0 && !room._vsocks?.size;

/** @param {any} room */
export async function flushAtDrain(room) {
  const posts = [];
  const grants = room._grants;
  if (grants && (grants.timer || grants.w?.rows.size || grants.w?.tallies.size)) posts.push(room._grantFlush());
  const staffNet = room._staffNet;
  if (staffNet && (staffNet.timer || staffNet.rows.size || staffNet.foes.size || staffNet.retry)) posts.push(staffNetFlush(room));
  const staffReact = room._staffReact;
  if (staffReact && (staffReact.timer || staffReact.rows.length || staffReact.retry)) posts.push(staffReactFlush(room));
  if (room._feedQ?.lines.length) posts.push(room._feedFlush());
  if (!posts.length) return 0;
  await Promise.allSettled(posts);
  if (drained(room)) {
    staffFeedsStop(room);
    if (room._grants?.timer) {
      clearTimeout(room._grants.timer);
      room._grants.timer = null;
    }
    if (room._feedQ?.timer) {
      clearTimeout(room._feedQ.timer);
      room._feedQ.timer = null;
    }
  }
  return posts.length;
}
