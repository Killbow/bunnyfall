// @ts-check
// Callers run this on the primary, never a replica, because a stale #1 is counted again and written.
import { arenaHonoursPlan } from './arena.js';
import { iliacHonoursPlan } from './iliac.js';
import { gambitHonoursPlan } from './gambit.js';

/** @param {{ db: any }} ctx @param {any} player @param {number} nowS */
export async function withHonours(ctx, player, nowS) {
  if (!player) return player;
  const plans = [arenaHonoursPlan(ctx, player, nowS), iliacHonoursPlan(ctx, player, nowS), gambitHonoursPlan(ctx, player, nowS)];
  const reads = plans.flatMap((p) => p.reads);
  const res = reads.length ? await ctx.db.batch(reads) : [];
  let at = 0;
  /** @type {any[]} */
  const answers = [];
  for (const p of plans) { answers.push(await p.from(res.slice(at, at + p.reads.length))); at += p.reads.length; }
  return { ...player, arena: answers[0], iliac: answers[1], gambit: answers[2] };
}
