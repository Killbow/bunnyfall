// @ts-check
// One request for the play beat, mail, board, post, greed, and festival polls. Each part returns what its own route
// returns, and a part that throws returns `{ error: 'server' }` without failing the others.
import { creditPlay, accountKind } from './accounts.js';
import { inboxOf } from './letters.js';
import { readBoard } from './board.js';
import { postBoxOf } from './post.js';
import { greedMine } from './staffCommands.js';
import { listFestivals } from './playerFestival.js';

export const HEARTBEAT_PARTS = Object.freeze(['beat', 'mail', 'board', 'post', 'greed', 'festivals']);

/**
 * @param {{ db: any, nowS: number }} ctx
 * @param {any} player
 * @param {any} env
 * @param {any} body
 * @param {string|null} [sessionId]
 */
export async function heartbeat(ctx, player, env, body, sessionId = null) {
  /** @type {Record<string, any>} */
  const out = {};
  const part = async (/** @type {string} */ name, /** @type {() => Promise<any>} */ fn) => {
    try { out[name] = await fn(); } catch (e) {
      console.warn(`[heartbeat] the ${name} part failed`, /** @type {any} */ (e)?.message ?? e);
      out[name] = { error: 'server' };
    }
  };
  // The reads run before the beat: a D1 session sends every statement after a write to the primary, and no
  // part reads what the beat writes.
  if (body?.mail === true) await part('mail', async () => (accountKind(player) !== 'linked' ? { error: 'mail-needs-account' } : inboxOf(ctx, player, env)));
  if (body?.board !== undefined) await part('board', () => readBoard(ctx, player, env, body.board, { lean: body.boardLean === true }));
  if (body?.post === true) await part('post', async () => (accountKind(player) !== 'linked' ? { error: 'post-needs-account' } : postBoxOf(ctx, player, env)));
  if (body?.greed === true) await part('greed', () => greedMine(ctx, player));
  if (body?.festivals === true) await part('festivals', () => listFestivals(ctx, player));
  if (body?.beat === true) await part('beat', () => creditPlay(ctx, player.id, sessionId));
  return out;
}
