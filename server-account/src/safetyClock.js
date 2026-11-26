// @ts-check
import { discordOn, sendCard, cardOf } from './discord.js';

export const POSTS_MAX = 5;
export const RESOLVED_LINES_KEEP_S = 90 * 24 * 3600;
export const CASE_OPEN_MAX_S = 90 * 24 * 3600;
export const SAFETY_SWEEP_ROWS = 500;
export const SAFETY_SWEEP_ROUNDS = 25;

/** @param {any} ctx */
const more = (ctx) => (typeof ctx.budget === 'function' ? ctx.budget() : true);

async function postCards(ctx, env, fetchFn) {
  const due = (await ctx.db.prepare(`SELECT id, discord_msg, updated_at, status FROM mod_cases
      WHERE (discord_state = 'due' OR (discord_state = 'off' AND status = 'open'))
      ORDER BY credible DESC, reports DESC, updated_at LIMIT ?1`).bind(POSTS_MAX).all())?.results ?? [];
  let n = 0;
  for (const c of due) {
    const card = await cardOf(ctx.db, c.id, ctx.nowS);
    if (!card) continue;
    const sent = await sendCard(env, fetchFn, card, c.discord_msg ?? null, { nonce: c.id });
    // Only an unreachable Discord stops the queue; a refused card is marked failed so it never blocks the rest.
    if ('down' in sent) break;
    if ('gone' in sent) { await ctx.db.prepare('UPDATE mod_cases SET discord_msg = NULL WHERE id = ?1').bind(c.id).run(); continue; }
    if ('refused' in sent) { await ctx.db.prepare("UPDATE mod_cases SET discord_state = 'failed' WHERE id = ?1").bind(c.id).run(); continue; }
    // A case that changed while its card was drawn stays due, so the next minute draws it again.
    await ctx.db.prepare("UPDATE mod_cases SET discord_msg = ?2, discord_state = CASE WHEN updated_at = ?3 AND status = ?4 THEN 'posted' ELSE 'due' END WHERE id = ?1")
      .bind(c.id, sent.id, c.updated_at, c.status).run();
    n++;
  }
  return n;
}

/**
 * @param {{ db: any, nowS: number, rand: (b: Uint8Array) => void, budget?: () => boolean }} ctx
 * @param {any} env
 * @param {{ fetchFn?: (url: string, init: any) => Promise<Response> }} [io]
 */
export async function safetyMinute(ctx, env, { fetchFn = (u, i) => globalThis.fetch(u, i) } = {}) {
  return discordOn(env) ? postCards(ctx, env, fetchFn) : 0;
}

/** @param {{ db: any, nowS: number, budget?: () => boolean }} ctx */
export async function safetySweep(ctx) {
  const { db, nowS } = ctx;
  const paged = async (sql, ...args) => {
    let n = 0;
    for (let i = 0; i < SAFETY_SWEEP_ROUNDS; i++) {
      const got = Number((await db.prepare(sql).bind(...args, SAFETY_SWEEP_ROWS).run())?.meta?.changes ?? 0);
      n += got;
      if (got < SAFETY_SWEEP_ROWS || !more(ctx)) break;
    }
    return n;
  };
  let n = 0;
  n += await paged('DELETE FROM mod_feed WHERE id IN (SELECT id FROM mod_feed LIMIT ?1)');
  n += await paged(`UPDATE mod_cases SET status = 'dismissed', resolved_by = 'the clock', resolved_at = ?1, resolution = 'expired', updated_at = ?1, claimed_at = NULL,
      discord_state = CASE WHEN discord_msg IS NULL THEN 'off' ELSE 'due' END
    WHERE id IN (SELECT id FROM mod_cases WHERE status = 'open' AND opened_at < ?2 LIMIT ?3)`, nowS, nowS - CASE_OPEN_MAX_S);
  n += await paged(`UPDATE mod_cases SET lines_kept = 0, discord_state = CASE WHEN discord_msg IS NULL THEN discord_state ELSE 'due' END
    WHERE id IN (SELECT id FROM mod_cases WHERE lines_kept = 1 AND resolved_at IS NOT NULL AND resolved_at < ?1 AND status != 'open' LIMIT ?2)`, nowS - RESOLVED_LINES_KEEP_S);
  n += await paged(`DELETE FROM mod_case_lines WHERE rowid IN (SELECT l.rowid FROM mod_case_lines l JOIN mod_cases c ON c.id = l.case_id
    WHERE c.lines_kept = 0 LIMIT ?1)`);
  n += await paged(`UPDATE mod_reports SET note = NULL WHERE rowid IN (SELECT r.rowid FROM mod_reports r JOIN mod_cases c ON c.id = r.case_id
    WHERE c.lines_kept = 0 AND r.note IS NOT NULL LIMIT ?1)`);
  n += await paged('DELETE FROM mod_ai_days WHERE day IN (SELECT day FROM mod_ai_days LIMIT ?1)');
  return n;
}
