// @ts-check
// BUNNYFALL /dm (2026-11-12, the owner: "sends a text in a color of choice on the top of the screen. i will use it to make
// rodney talk but also to use announcements") - THE DUNGEON MASTER'S BANNER: each /dm line across the top of every
// player's screen in its colour (net/dmLaw.js), held long enough to read and faded out; lines that arrive together wait
// their turn. The chat keeps its own copy of each line (scenes/world.js `onDm`).

const STYLE_ID = 'bf-dm-banner-style';
const CSS = `
.bf-dm-banner { position: fixed; top: 9vh; left: 50%; transform: translate(-50%, -8px); z-index: 60; pointer-events: none;
  max-width: min(900px, 86vw); padding: 10px 26px; text-align: center; opacity: 0;
  font: 700 clamp(20px, 2.6vw, 34px)/1.25 'Cormorant', Georgia, serif; letter-spacing: 0.3px; white-space: pre-wrap; overflow-wrap: anywhere;
  text-shadow: 0 0 2px #000, 0 2px 4px rgba(0,0,0,0.95), 0 0 18px rgba(0,0,0,0.75);
  background: radial-gradient(ellipse at center, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0) 72%);
  transition: opacity 400ms ease, transform 400ms ease; }
.bf-dm-banner.on { opacity: 1; transform: translate(-50%, 0); }
@media (prefers-reduced-motion: reduce) { .bf-dm-banner { transition: opacity 200ms linear; transform: translate(-50%, 0); } }
`;

/** How long a line stays up: long enough to read, ms. */
export const dmBannerMs = (text) => Math.min(12_000, 3_500 + String(text ?? '').length * 55);
const FADE_MS = 450;

/** @param {{ doc?: Document }} [deps] */
export function createDmBanner({ doc = globalThis.document } = {}) {
  /** @type {{ text: string, colour: string }[]} */
  const queue = [];
  let el = /** @type {HTMLElement|null} */ (null);
  let busy = false;

  function ensure() {
    if (el || !doc?.body) return el;
    if (!doc.getElementById(STYLE_ID)) { const s = doc.createElement('style'); s.id = STYLE_ID; s.textContent = CSS; doc.head.append(s); }
    el = doc.createElement('div');
    el.className = 'bf-dm-banner';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    doc.body.append(el);
    return el;
  }

  function next() {
    const line = queue.shift();
    const box = line ? ensure() : null;
    if (!line || !box) { busy = false; return; }
    busy = true;
    box.textContent = line.text;
    box.style.color = line.colour;
    requestAnimationFrame(() => box.classList.add('on'));
    setTimeout(() => {
      box.classList.remove('on');
      setTimeout(next, FADE_MS);
    }, dmBannerMs(line.text));
  }

  return {
    /** A /dm line, in its colour - shown now, or after the ones before it. */
    show(text, colour) {
      if (!text) return;
      queue.push({ text: String(text), colour: colour || '#ff9a3c' });
      if (queue.length > 6) queue.shift();   // a flood keeps its newest lines
      if (!busy) next();
    },
  };
}
