// @ts-check
import { seatWeekOf, seasonOf, seasonZeroOf } from '../../src/net/townSeatLaw.js';
import { tideAt } from '../../src/net/tideLaw.js';

export function tideNow(env, nowS, region) {
  const week = seatWeekOf(nowS * 1000);
  return tideAt(week, region, !!seasonOf(week, seasonZeroOf(env?.SEASON_ZERO_WEEK)));
}
