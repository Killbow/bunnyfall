// @ts-check
// BUNNYFALL /dm (2026-11-12, the owner: "a /dm command that sends a text in a color of choice on the top of the screen.
// i will use it to make rodney talk but also to use announcements") - THE DUNGEON MASTER'S COLOURS, as every end reads
// them: the client's command (`/dm [colour] <text>`), the wire's check of the narrate frame, the relay's fan and the
// banner (ui/dmBanner.js). A colour is a name below or `#rrggbb`; none is the Dungeon Master's own orange.
//
// Pure: no DOM, no network.

export const DM_DEFAULT = '#ff9a3c';
export const DM_COLOURS = Object.freeze({
  orange: DM_DEFAULT, red: '#ff4a4a', crimson: '#c4142c', gold: '#ffd24a', yellow: '#fff27a', green: '#5ee07a',
  teal: '#3fd6c8', blue: '#5aa8ff', purple: '#b46cff', nyx: '#b46cff', pink: '#ff8ad8', white: '#ffffff', grey: '#b8b8b8',
});
const HEX_RE = /^#[0-9a-f]{6}$/i;

/** A colour as the wire carries it - `#rrggbb`, lower case - or null for anything else. */
export function dmColourOf(raw) {
  if (typeof raw !== 'string') return null;
  const k = raw.trim().toLowerCase();
  if (Object.hasOwn(DM_COLOURS, k)) return DM_COLOURS[k];
  return HEX_RE.test(k) ? k : null;
}

/** A typed `/dm` line's words after the command: `{ text, colour }` - the first word a colour when it names one. */
export function dmLineOf(raw) {
  const s = String(raw ?? '').trim();
  const m = /^(\S+)\s+([\s\S]+)$/.exec(s);
  const c = m ? dmColourOf(m[1]) : null;
  return c ? { text: m[2].trim(), colour: c } : { text: s, colour: null };
}
