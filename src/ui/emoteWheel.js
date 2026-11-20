// @ts-check
// BUNNYFALL TOUCH: THE EMOTE WHEEL - eight gestures in a ring over a player, opened from the F-card's Emotes row. A click
// (or a number key 1-8, Escape to leave) picks one; the host does the rest (asks first when it touches).
import { WHEEL_VERBS, TOUCH_FX } from '../net/touchLaw.js';

const LABEL = { hug: 'Hug', pat: 'Pat', kiss: 'Kiss', highfive: 'High five', handshake: 'Handshake', comfort: 'Comfort', wave: 'Wave', bow: 'Bow' };
const CSS = `
.dfwheel { position: fixed; inset: 0; z-index: 7; display: none; pointer-events: none; font-family: inherit; color: #e9e4d9; }
.dfwheel[data-state="open"] { display: block; pointer-events: auto; }
.dfwheel-ring { position: absolute; left: 50%; top: 50%; width: 300px; height: 300px; margin: -150px 0 0 -150px; pointer-events: auto; }
.dfwheel-name { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); font-size: 15px; text-align: center; max-width: 110px; overflow-wrap: anywhere; background: rgba(14,16,19,.9); border: 1px solid #2b323b; border-radius: 50%; padding: 30px 10px; }
.dfwheel-slot { position: absolute; width: 74px; height: 74px; margin: -37px 0 0 -37px; border-radius: 50%; border: 1px solid #2b323b; background: rgba(14,16,19,.9); color: inherit; font: inherit; font-size: 11px; cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; transform: scale(.4); opacity: 0; transition: transform .16s ease-out, opacity .16s; }
.dfwheel[data-state="open"] .dfwheel-slot { transform: scale(1); opacity: 1; }
.dfwheel-slot:hover, .dfwheel-slot:focus { background: #c08a3e; color: #0e1013; outline: none; }
.dfwheel-slot b { font-size: 24px; font-weight: 400; line-height: 1; }
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
