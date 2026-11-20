// @ts-check
// BUNNYFALL TOUCH (2026-11-20, the owner: "more ways to interact beyond trading, fighting and chatting"): THE LAW of the
// warm gestures - pure, shared by the chat parser, the wheel and the picture-throwing. No DOM, no network, no clock.
//
// Every gesture is just said, on Local, the chat's own action line: nobody is asked first.
import { EMOTES, emoteText } from './chatCommands.js';

/** The gestures that touch someone (the wheel's pictures and the chat's words for them). */
export const TOUCH_VERBS = Object.freeze(['hug', 'embrace', 'pat', 'headpat', 'kiss', 'handkiss', 'cuddle', 'comfort', 'highfive', 'handshake', 'fistbump', 'poke', 'tickle', 'nuzzle', 'hold', 'bump']);
export const isTouch = (verb) => TOUCH_VERBS.includes(verb);

/** The little pictures a gesture throws up over the bodies (the browser's own emoji face draws them). */
export const TOUCH_FX = Object.freeze({
  hug: ['\u{1F917}', '❤️'], embrace: ['❤️', '✨'], pat: ['\u{1F44B}', '✨'], headpat: ['✨', '\u{1F44B}'],
  kiss: ['\u{1F48B}', '❤️'], handkiss: ['\u{1F48B}', '✨'], cuddle: ['\u{1F495}', '\u{1F4A4}'], comfort: ['\u{1F49B}', '✨'],
  highfive: ['\u{1F64C}', '✨'], handshake: ['\u{1F91D}', '✨'], fistbump: ['\u{1F44A}', '\u{1F4A5}'], poke: ['\u{1F449}', '❗'],
  tickle: ['\u{1F602}', '\u{1F606}'], nuzzle: ['\u{1F495}', '\u{1F43E}'], hold: ['\u{1F49E}', '✨'], bump: ['\u{1F4A2}', '✨'],
  toast: ['\u{1F37B}', '✨'], wink: ['\u{1F609}', '✨'], wave: ['\u{1F44B}'], bow: ['\u{1F647}'], cheer: ['\u{1F389}', '✨'], dance: ['\u{1F3B6}', '\u{1F483}'],
  smile: ['\u{1F60A}'], laugh: ['\u{1F602}'], cry: ['\u{1F622}'], clap: ['\u{1F44F}'], thank: ['\u{1F64F}'], pray: ['\u{1F64F}', '✨'], salute: ['\u{1FAE1}'],
});

/** The wheel's slots, in order round the circle from the top: gestures a player picks most. */
export const WHEEL_VERBS = Object.freeze(['hug', 'pat', 'kiss', 'highfive', 'handshake', 'comfort', 'wave', 'bow']);

/** The action line a gesture says, for a verb and a name (the chat's own table). */
export const touchLine = (verb, name) => emoteText(verb, name);

/**
 * A said action line read back into its gesture: { verb, target } ('' when it was aimed at no one), or null. This is how
 * every player's game finds the gesture in the Local line it hears, with no new thing on the wire.
 * @param {string} text
 */
export function fxOfLine(text) {
  const s = String(text ?? '').trim();
  if (!s) return null;
  for (const [verb, [solo, aimed]] of Object.entries(EMOTES)) {
    if (s === solo) return { verb, target: '' };
    const at = aimed.indexOf('{t}');
    const pre = aimed.slice(0, at), post = aimed.slice(at + 3);
    if (s.length > pre.length + post.length && s.startsWith(pre) && s.endsWith(post)) return { verb, target: s.slice(pre.length, s.length - post.length) };
  }
  return null;
}
