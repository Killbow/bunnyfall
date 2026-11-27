// @ts-check
import { getPref } from '../ui/uiPrefs.js';
import { hudText } from '../ui/notify.js';
import { isEnhanced } from '../ui/uiSkin.js';
import { EVENT_KIND_ORDER, eventKindPref } from '../mods/features.js';

export const EVENT_NOTICE_KINDS = EVENT_KIND_ORDER;
// Caps the queue so a page that never draws the HUD does not collect lines without limit.
export const EVENT_NOTICES_KEPT = 32;
export const EVENT_BOARD_PREF = 'eventBoard';
export const EVENT_BOARD_PIECE = 'events';

/** @type {Array<{ kind: string, text: string, at: number, id: string|null }>} */
let _waiting = [];
/** @type {(() => any) | null} */
let _source = null;
/** @type {((text: string) => any) | null} */
let _off = null;
/** @type {((text: string) => any) | { hudMessageSink?: ((text: string) => any) | null } | null} */
let _log = null;

export const eventBoardOn = () => {
  try {
    if (getPref(EVENT_BOARD_PREF) === false) return false;
    return !(isEnhanced() && getPref('hudLayout')?.[EVENT_BOARD_PIECE]?.off === true);
  } catch { return true; }
};

export const eventKindShown = (/** @type {string} */ kind) => {
  try { return getPref(eventKindPref(kind)) !== false; } catch { return true; }
};

export function eventNoticeElsewhere(kind, text, filed = false) {
  try { if (_off && kind !== 'raid') _off(text); else if (filed) eventHudLine(text); else hudText(text); } catch { }
}

// `hudText` also files the line through `hudMessageSink`, so the sink is detached for this call to keep one copy of
// the line in the journal.
export function eventHudLine(text) {
  const holder = _log && typeof _log === 'object' ? _log : null;
  const sink = holder?.hudMessageSink ?? null;
  if (sink) holder.hudMessageSink = null;
  try { hudText(text); } finally { if (sink) holder.hudMessageSink = sink; }
}

/**
 * @param {string} kind
 * @param {string} text
 * @param {string|null} [id]
 */
export function eventNotice(kind, text, id = null) {
  const s = typeof text === 'string' ? text.trim() : '';
  if (!s) return false;
  if (!eventBoardOn()) { eventNoticeElsewhere(kind, s); return true; }
  try { if (typeof _log === 'function') _log(s); else _log?.hudMessageSink?.(s); } catch { }
  const k = EVENT_NOTICE_KINDS.includes(kind) ? kind : 'gate';
  if (!eventKindShown(k)) return true;
  _waiting.push({ kind: k, text: s, at: Date.now(), id: typeof id === 'string' && id ? id : null });
  if (_waiting.length > EVENT_NOTICES_KEPT) _waiting = _waiting.slice(-EVENT_NOTICES_KEPT);
  return true;
}

export function takeEventNotices() {
  const out = _waiting;
  _waiting = [];
  return out;
}

/**
 * Pass the `townTalk` holder rather than its sink, because the host sets `hudMessageSink` after it seats the board.
 * @template {(() => any) | ((o?: any) => any)} F
 * @param {F} source
 * @param {((text: string) => any) | null} [off]
 * @param {((text: string) => any) | { hudMessageSink?: ((text: string) => any) | null } | null} [log]
 * @returns {F}
 */
export function seatEventBoard(source, off = null, log = null) {
  _source = typeof source === 'function' ? source : null;
  _off = typeof off === 'function' ? off : null;
  _log = typeof log === 'function' || (log && typeof log === 'object') ? log : null;
  return source;
}

export function eventBoardSource() {
  try { return _source ? _source() ?? null : null; } catch { return null; }
}

export function _resetEventNotices() { _waiting = []; _source = null; _off = null; _log = null; }
