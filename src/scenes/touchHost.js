// @ts-check
// BUNNYFALL TOUCH (2026-11-20): the game's half of asking before a touch - see net/touchLaw.js for the law.
//
//   /hug Ann (any touch gesture and a name), or the wheel   asks Ann by a private marker line (the whisper's channel)
//   /accept [name]     says yes to the newest ask - and yes to that player's touch gestures from now on
//   /decline [name]    says no to the newest ask, this once
//   /untouch <name>    takes the leave back (/touchlist lists who has it)
//
// Marker lines never reach the Whispers tab: `heard` takes them first. The gesture itself is said on Local by the ASKER's
// game when the answer comes back, through `say` (the chat's own action line), so everyone near sees it the usual way.
import { getPref, setPref } from '../systems/uiPrefs.js';
import { TOUCH_ASK_MS, askPhrase, isTouch, markerOf, parseTouch, readMarker, touchLine } from '../net/touchLaw.js';

const PREF = 'touchAllowed';
const nameKey = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * @param {{
 *   log: () => any,                      the chat log
 *   link: () => any,                     the hub's session (whispers travel on it)
 *   say: (text: string) => any,          says an action line on Local
 *   hears?: (sub: string|null) => boolean, the block list's word on an account (false: never answered)
 *   now?: () => number,
 * }} deps
 */
export function createTouchHost({ log, link, say, hears = () => true, now = () => Date.now() }) {
  /** @type {{ to: string, verb: string, at: number }|null} */
  let offer = null;
  /** @type {{ from: string, sub: string|null, verb: string, at: number }[]} */
  let asks = [];
  const note = (text) => log()?.push('local', { text, system: true });
  const read = () => { const v = getPref(PREF); return v && typeof v === 'object' ? { ...v } : {}; };
  const allow = (sub, name) => { if (!sub) return; const v = read(); v[sub] = String(name ?? '').slice(0, 48); setPref(PREF, v); };
  const revoke = (sub) => { const v = read(); delete v[sub]; setPref(PREF, v); };
  const reply = (to, kind, verb) => link()?.status === 'open' && link().sendChat(markerOf(kind, verb), { ch: 'whisper', to }) === true;
  const live = () => asks.filter((a) => now() - a.at < TOUCH_ASK_MS);

  /** Ask `to` for a touch gesture. True when the ask went. */
  function ask(verb, to) {
    const s = link();
    if (!isTouch(verb) || !to) return false;
    if (!s || s.status !== 'open') { note('Gestures at a player need the online server.'); return false; }
    if (!reply(to, 'ask', verb)) { note('Try again in a moment.'); return false; }
    offer = { to, verb, at: now() };
    note(`You reach out to ${to}... (waiting for their answer)`);
    return true;
  }

  function answer(kind, who) {
    asks = live();
    const q = nameKey(who);
    const i = q ? asks.findIndex((a) => nameKey(a.from).startsWith(q)) : asks.length - 1;
    if (i < 0) { note(q ? `${who} has not asked you for anything.` : 'Nobody is waiting for your answer.'); return; }
    const [a] = asks.splice(i, 1);
    if (!reply(a.from, kind, a.verb)) { note('Try again in a moment.'); asks.push(a); return; }
    if (kind === 'yes') { allow(a.sub, a.from); note(`You said yes to ${a.from}. They may use touch gestures on you from now on (/untouch ${a.from} takes it back).`); }
    else note(`You said no to ${a.from}.`);
  }

  return {
    ask,
    /** A typed line: true/false when it was one of these commands, undefined otherwise. */
    onSend(_tabId, text) {
      const s = String(text ?? '').trim();
      const t = parseTouch(s);
      if (t) return ask(t.verb, t.to);
      const m = /^\/(accept|decline|untouch|touchlist)(?:\s+([\s\S]*))?$/i.exec(s);
      if (!m) return undefined;
      const cmd = m[1].toLowerCase(), rest = (m[2] ?? '').trim();
      if (cmd === 'accept' || cmd === 'decline') { answer(cmd === 'accept' ? 'yes' : 'no', rest); return 'read'; }
      const v = read();
      if (cmd === 'touchlist') { const names = Object.values(v); note(names.length ? `Players who may use touch gestures on you: ${names.join(', ')}.` : 'No one may use touch gestures on you yet.'); return 'read'; }
      const q = nameKey(rest);
      const hit = q ? Object.entries(v).find(([, n]) => nameKey(n).startsWith(q)) : null;
      if (!hit) { note(q ? `${rest} is not on your list. /touchlist shows it.` : 'Who? /untouch <name>'); return 'read'; }
      revoke(hit[0]);
      note(`${hit[1]} must ask again before a touch gesture.`);
      return 'read';
    },
    /** A whisper line from the hub: true when it was a marker (taken, never shown as a whisper). */
    heard(line) {
      const k = readMarker(line?.text);
      if (!k) return false;
      if (line.mine) return true;   // the echo of my own marker
      if (line.miss) { if (offer && k.kind === 'ask') { offer = null; note(line.miss === 'many' ? `More than one player online is called "${line.to}". Type more of the name.` : `Nobody online is called "${line.to}".`); } return true; }
      const sub = typeof line.sub === 'string' ? line.sub : null;
      if (hears && !hears(sub)) return true;   // a blocked account is never answered
      const from = String(line.name ?? '').trim();
      if (!from) return true;
      if (k.kind === 'ask') {
        if (sub && Object.hasOwn(read(), sub)) { reply(from, 'yes', k.verb); return true; }   // the leave was given once: no asking
        asks = live().filter((a) => nameKey(a.from) !== nameKey(from));
        asks.push({ from, sub, verb: k.verb, at: now() });
        note(`${from} would like to ${askPhrase(k.verb)}. /accept (this lets them do it any time) or /decline.`);
        return true;
      }
      if (!offer || offer.verb !== k.verb || now() - offer.at > TOUCH_ASK_MS || !nameKey(from).startsWith(nameKey(offer.to))) return true;   // an answer nobody asked for
      offer = null;
      if (k.kind === 'yes') say(touchLine(k.verb, from) ?? '');
      else note(`${from} would rather not.`);
      return true;
    },
  };
}
