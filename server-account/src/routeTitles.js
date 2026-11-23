// Title helpers for account answers.
import { chapterTitlesOpenFor, chapterTitlesOfAccount } from './npcChapters.js';
import { seatsOpenFor } from './townSeats.js';
import { seatTitlesOf } from './seatTurning.js';
import { seasonZeroOf } from '../../src/net/townSeatLaw.js';
import { withMasteryMarks } from './hunts.js';

/** SEAT1c: the account's row with the Charter titles it may wear laid on it (`seatTitles`, titles.js titlesHeld), while the
 *  seats are open to it - for the wardrobe's read and its write. */
export const withSeatTitles = async (ctx, player, env) => withChapterTitles(ctx, seatsOpenFor(player, env) ? { ...player, seatTitles: await seatTitlesOf(ctx.db, player.id) } : player, env);
/** CHAP4c: and the chapters' seats' titles its characters hold, while CHAPTER_TITLES is on (npcChapters.js). MARKS-OF-MASTERY:
 *  and the Marks of Mastery its rows earn (hunts.js) - the mint reads this one too. */
export const withChapterTitles = async (/** @type {any} */ ctx, /** @type {any} */ player, /** @type {any} */ env) => withMasteryMarks(ctx, chapterTitlesOpenFor(player, env)
  ? { ...player, chapterTitles: [...new Set((await chapterTitlesOfAccount(ctx.db, player.id, ctx.nowS, seasonZeroOf(env.SEASON_ZERO_WEEK))).map((t) => t.title))] } : player);
