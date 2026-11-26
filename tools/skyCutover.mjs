#!/usr/bin/env node
// Lists the aligned instants when a new sky segment can switch without the sky's hour skipping.
// Usage: node tools/skyCutover.mjs [--after <date>] [--scale <TimeScale>]
// Pick an instant after the merge, since a switch must fall after the build that carries it is live.
import { SKY_SEGMENTS, alignedSkySwitches, skyLawOf } from '../src/net/skyLaw.js';
import { isMain } from './lib/isMain.mjs';

export function cutoverLines(argv, now = Date.now()) {
  const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
  const scale = Number(arg('--scale') ?? NaN);
  const minutesPerMs = Number.isFinite(scale) && scale > 0 ? scale / 60 / 1000 : SKY_SEGMENTS[SKY_SEGMENTS.length - 1].minutesPerMs;
  const afterText = arg('--after');
  const after = afterText ? Date.parse(afterText) : now;
  if (!Number.isFinite(after)) return [`--after: "${afterText}" is not a date`];
  const ts = minutesPerMs * 60 * 1000;
  const last = SKY_SEGMENTS[SKY_SEGMENTS.length - 1];
  const moving = !!last && last.minutesPerMs === minutesPerMs;
  const replacing = !moving && !!last && after < last.fromMs;
  const segments = moving || replacing ? SKY_SEGMENTS.slice(0, -1) : SKY_SEGMENTS;
  const what = moving ? `instants for the last row (now ${new Date(last.fromMs).toISOString()})` : replacing ? `instants to replace the last row (not live until ${new Date(last.fromMs).toISOString()})` : 'switches for a new row';
  const lines = [`TimeScale ${+ts.toFixed(4)} (a sky day every ${+(1440 / ts).toFixed(2)} real minutes); aligned ${what} after ${new Date(after).toISOString()}:`];
  for (const t of alignedSkySwitches(minutesPerMs, after, { count: 8, segments })) lines.push(`  ${new Date(t).toISOString()}   Date.UTC(${new Date(t).getUTCFullYear()}, ${new Date(t).getUTCMonth()}, ${new Date(t).getUTCDate()}, ${new Date(t).getUTCHours()}, ${new Date(t).getUTCMinutes()}, ${new Date(t).getUTCSeconds()})`);
  if (lines.length === 1) lines.push(skyLawOf(segments).rateAt(after) === minutesPerMs ? '  none: the sky already runs at this rate then - a switch to it changes nothing' : '  none within a day - this rate never lines up with the sky as it stands');
  return lines;
}

if (isMain(import.meta.url)) console.log(cutoverLines(process.argv.slice(2)).join('\n'));
