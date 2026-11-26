import { chapterTitlesOpenFor, chapterTitlesOfAccount } from './npcChapters.js';
import { seatsOpenFor } from './townSeats.js';
import { seatTitlesOf } from './seatTurning.js';
import { seasonZeroOf } from '../../src/net/townSeatLaw.js';
import { withMasteryMarks } from './hunts.js';

export const withSeatTitles = async (ctx, player, env) => withChapterTitles(ctx, seatsOpenFor(player, env) ? { ...player, seatTitles: await seatTitlesOf(ctx.db, player.id) } : player, env);
export const withChapterTitles = async (/** @type {any} */ ctx, /** @type {any} */ player, /** @type {any} */ env) => withMasteryMarks(ctx, chapterTitlesOpenFor(player, env)
  ? { ...player, chapterTitles: [...new Set((await chapterTitlesOfAccount(ctx.db, player.id, ctx.nowS, seasonZeroOf(env.SEASON_ZERO_WEEK))).map((t) => t.title))] } : player);
