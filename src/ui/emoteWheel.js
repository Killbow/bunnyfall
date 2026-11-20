// @ts-check
// BUNNYFALL TOUCH: THE EMOTE WHEEL - eight gestures in a ring over a player, opened from the F-card's Emotes row. A click
// (or a number key 1-8, Escape to leave) picks one; the host says it on Local. Dressed like the Discipline wheel: stone and
// brass under the Enhanced skin, dark wood and gold under Classic.
import { WHEEL_VERBS, TOUCH_FX } from '../net/touchLaw.js';
import { isEnhanced } from '../systems/uiSkin.js';
import { PIXEL_STACK } from './pixelifyFive.js';

const LABEL = { hug: 'Hug', pat: 'Pat', kiss: 'Kiss', highfive: 'High five', handshake: 'Handshake', comfort: 'Comfort', wave: 'Wave', bow: 'Bow' };
const CSS = `
.dfwheel { position: fixed; inset: 0; z-index: 7; display: none; pointer-events: none; font-family: var(--data, system-ui, sans-serif); color: #e9e4d9; }
.dfwheel[data-state="open"] { display: block; pointer-events: auto; background: radial-gradient(ellipse at center, rgba(0,0,0,.12) 0%, rgba(0,0,0,.5) 100%); }
.dfwheel-ring { position: absolute; left: 50%; top: 50%; width: 320px; height: 320px; margin: -160px 0 0 -160px; border-radius: 50%; pointer-events: auto;
  background: radial-gradient(circle, rgba(14,16,19,.94) 0 24%, transparent 24.5%), radial-gradient(circle, rgba(14,16,19,.55) 0 30%, rgba(14,16,19,.82) 31% 100%);
  border: 2px solid #2b323b; box-shadow: 0 0 0 3px rgba(192,138,62,.4), 0 0 34px rgba(192,138,62,.25), inset 0 0 30px #000; }
.dfwheel-name { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 110px; text-align: center; overflow-wrap: anywhere; font-family: var(--display, Georgia, serif); font-size: 19px; color: #c08a3e; text-shadow: 0 1px 2px #000; }
.dfwheel-name small { display: block; margin-top: 4px; font-family: var(--data, system-ui, sans-serif); font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: #9a9486; }
.dfwheel-slot { position: absolute; width: 72px; height: 72px; margin: -36px 0 0 -36px; border-radius: 50%; border: 2px solid #2b323b; background: rgba(0,0,0,.45); color: inherit; font: inherit; font-size: 11px; letter-spacing: .04em; cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; text-shadow: 0 1px 2px #000; transform: scale(.4); opacity: 0; transition: transform .16s ease-out, opacity .16s, background .12s, border-color .12s, box-shadow .12s; }
.dfwheel[data-state="open"] .dfwheel-slot { transform: scale(1); opacity: 1; }
.dfwheel-slot:hover, .dfwheel-slot:focus { transform: scale(1.12); background: radial-gradient(circle, rgba(192,138,62,.4), rgba(192,138,62,.12)); border-color: #c08a3e; box-shadow: 0 0 14px rgba(192,138,62,.7); color: #fff; outline: none; }
.dfwheel-slot b { font-size: 22px; font-weight: 400; line-height: 1; filter: sepia(.55) saturate(.8) brightness(.95); }
.dfwheel-slot:hover b, .dfwheel-slot:focus b { filter: none; }
.dfwheel-slot i { position: absolute; top: 3px; right: 6px; font-style: normal; font-size: 9px; color: #9a9486; }
.dfwheel[data-skin="classic"] { font-family: ${PIXEL_STACK}; color: #f0d27a; }
.dfwheel[data-skin="classic"] .dfwheel-ring { background: radial-gradient(circle, #1d140d 0 24%, transparent 24.5%), repeating-conic-gradient(#2a1d14 0 10deg, #2f2117 10deg 20deg); border: 3px solid #5b4630; box-shadow: 0 0 0 2px #0e0905, inset 0 0 30px #000; }
.dfwheel[data-skin="classic"] .dfwheel-name { font-family: ${PIXEL_STACK}; font-size: 14px; color: #f0d27a; }
.dfwheel[data-skin="classic"] .dfwheel-name small { font-family: ${PIXEL_STACK}; color: #b8a070; }
.dfwheel[data-skin="classic"] .dfwheel-slot { border-color: #5b4630; background: rgba(0,0,0,.5); }
.dfwheel[data-skin="classic"] .dfwheel-slot:hover, .dfwheel[data-skin="classic"] .dfwheel-slot:focus { border-color: #f0d27a; box-shadow: 0 0 12px #c8943a; }
`;

/**
 * @param {{ onPick: (verb: string, peerId: string) => void, canOpen?: () => boolean, onOpen?: () => void, onClose?: () => void, doc?: Document, win?: any }} deps
 */
export function createEmoteWheel({ onPick, canOpen = () => true, onOpen, onClose, doc = document, win = globalThis }) {
  const style = doc.createElement('style');
  style.textContent = CSS;
  doc.head.append(style);
  const root = doc.createElement('div');
  root.className = 'dfwheel';
  root.dataset.state = 'closed';
  const ring = doc.createElement('div');
  ring.className = 'dfwheel-ring';
  const nameNode = doc.createElement('div');
  nameNode.className = 'dfwheel-name';
  ring.append(nameNode);
  root.append(ring);
  doc.body.append(root);
  let open = false, peer = null;

  WHEEL_VERBS.forEach((verb, i) => {
    const a = (i / WHEEL_VERBS.length) * Math.PI * 2 - Math.PI / 2;
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = 'dfwheel-slot';
    b.style.left = `${150 + Math.cos(a) * 112}px`;
    b.style.top = `${150 + Math.sin(a) * 112}px`;
    const g = doc.createElement('b');
    g.textContent = TOUCH_FX[verb]?.[0] ?? '';
    b.append(g, doc.createTextNode(LABEL[verb] ?? verb));
    b.title = `${i + 1}`;
    const k = doc.createElement('i');
    k.textContent = `${i + 1}`;
    b.append(k);
    b.addEventListener('click', () => { const id = peer; hide(); if (id) onPick(verb, id); });
    ring.append(b);
  });

  function hide() {
    if (!open) return false;
    open = false; peer = null;
    root.dataset.state = 'closed';
    onClose?.();
    return true;
  }
  const onKey = (e) => {
    if (!open) return;
    if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); hide(); return; }
    const n = /^(?:Digit|Numpad)([1-8])$/.exec(e.code);
    if (n) { e.preventDefault(); e.stopImmediatePropagation(); const id = peer, verb = WHEEL_VERBS[Number(n[1]) - 1]; hide(); if (id) onPick(verb, id); }
  };
  win.addEventListener('keydown', onKey, true);
  // a click outside the ring is the world's, but this wheel owns the pointer while it is up: it closes
  root.addEventListener('pointerdown', (e) => { if (e.target === root) hide(); });

  return {
    show({ peerId, name }) {
      if (!peerId || !canOpen()) return false;
      peer = peerId;
      nameNode.textContent = name || 'Someone';
      const sub = doc.createElement('small');
      sub.textContent = 'Choose a gesture';
      nameNode.append(sub);
      root.dataset.skin = isEnhanced() ? 'enhanced' : 'classic';
      const was = open;
      open = true;
      root.dataset.state = 'open';
      if (!was) onOpen?.();
      return true;
    },
    hide,
    isOpen: () => open,
    destroy() { hide(); win.removeEventListener('keydown', onKey, true); root.remove(); style.remove(); },
  };
}
