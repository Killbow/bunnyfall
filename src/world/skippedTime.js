// @ts-check
// Spans of the character's own clock that a RaiseTime skipped (a rest or loiter sub-tick, a journey, a sentence, or a
// quest's raise). Held in memory only, for laws that charge skipped time more gently than time played.

/** @type {{ from: number, to: number, charged?: boolean }[]} */
const spans = [];
const SPANS_MAX = 32;
/** Raises this close together (a rest's sub-ticks) join into one span. */
const MERGE_GAP_MINUTES = 1;

/** The clock moved back (a load): spans after it never happened. @param {number} minute */
export function dropSkippedAfter(minute) {
  while (spans.length && spans[spans.length - 1].from >= minute) spans.pop();
  const last = spans[spans.length - 1];
  if (last && last.to > minute) last.to = minute;
}

/** @param {number} from @param {number} to */
export function noteSkippedSpan(from, to) {
  if (!Number.isFinite(from) || !Number.isFinite(to) || !(to > from)) return;
  dropSkippedAfter(from);
  const last = spans[spans.length - 1];
  if (last && from - last.to <= MERGE_GAP_MINUTES) { last.to = to; return; }
  spans.push({ from, to });
  if (spans.length > SPANS_MAX) spans.shift();
}

/** @param {number} from @param {number} to */
export function skippedMinutesIn(from, to) {
  let n = 0;
  for (const s of spans) n += Math.max(0, Math.min(to, s.to) - Math.max(from, s.from));
  return n;
}

/** The skipped span that crossed a minute, or null. @param {number} minute */
export const skippedSpanAt = (minute) => spans.find((s) => minute > s.from && minute <= s.to) ?? null;

export function clearSkippedSpans() { spans.length = 0; }
