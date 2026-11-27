// @ts-check
import { egTimes, egPhase, egCountText, EG_TEXT } from '../../net/eliteGates/egLaw.js';
import { createPortalGates } from '../../travel/portalGates.js';
import { portalPlace, PORTAL_OPEN_MS } from '../../travel/portalStone.js';
import { level } from '../../arena/arenaSound.js';

export const EG_HORN_KEY = 'eg:horn';
export const EG_HORN_RATE = 22050;
export const EG_HORN_SECONDS = 2.4;
export const EG_HORN_RMS = 0.09;
export const EG_HORN_NOTES = Object.freeze([196, 261.63]);
export const EG_HORN_STEP_S = 0.7;
const HORN_PARTIALS = Object.freeze([1, 0.62, 0.48, 0.3, 0.22, 0.14, 0.09]);
const HORN_VIBRATO = Object.freeze({ hz: 5.2, depth: 0.006 });

export function buildEgHorn({ rate = EG_HORN_RATE, seconds = EG_HORN_SECONDS } = {}) {
  const n = Math.round(rate * seconds), out = new Float32Array(n);
  // Phase is integrated in turns because the frequency glides; computing it from `f * t` would jump at the note
  // change.
  let cycles = 0;
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const glide = Math.min(1, Math.max(0, (t - EG_HORN_STEP_S) / 0.06));
    const f = (EG_HORN_NOTES[0] + (EG_HORN_NOTES[1] - EG_HORN_NOTES[0]) * glide) * (1 + HORN_VIBRATO.depth * Math.sin(2 * Math.PI * HORN_VIBRATO.hz * t));
    cycles += f / rate;
    let v = 0;
    const angle = cycles * 2 * Math.PI;
    for (let k = 0; k < HORN_PARTIALS.length; k++) v += HORN_PARTIALS[k] * Math.sin((k + 1) * angle);
    const attack = Math.min(1, t / 0.12), release = Math.min(1, (seconds - t) / 0.5);
    const breath = t < EG_HORN_STEP_S ? 0.8 : 1;
    out[i] = v * attack * release * breath;
  }
  return level(out, EG_HORN_RMS);
}
const _hornMade = new WeakSet();
export function soundEgHorn(audio) {
  try {
    if (!audio?.registerSamples || !audio?.playOneShot) return false;
    if (!_hornMade.has(audio)) { if (!audio.registerSamples(EG_HORN_KEY, buildEgHorn(), EG_HORN_RATE)) return false; _hornMade.add(audio); }
    audio.playOneShot(EG_HORN_KEY, 1);
    return true;
  } catch { return false; }
}

/**
 * @param {{ call: any, me: string|null, now: number, inSpire?: boolean, answered?: boolean, exterior?: boolean, windowUp?: boolean, wk?: number }} o
 * @returns {{ text: string, answerable: boolean, left: number } | null}
 */
export function egCallPromptModel({ call, me, now, inSpire = false, answered = false, exterior = true, windowUp = false, wk = 0 }) {
  if (!call || !me || !call.co?.some?.((r) => r[0] === me) || inSpire || answered || windowUp) return null;
  const T = egTimes({ openedAt: call.op }), phase = egPhase({ openedAt: call.op, wokeAt: wk }, now);
  if (phase === 'rising' || phase === 'sealed') return { text: EG_TEXT.sealed(egCountText(T.openAt - now)), answerable: false, left: T.openAt - now };
  if (phase !== 'open') return null;
  const left = T.admitUntil - now;
  return exterior ? { text: EG_TEXT.answer(egCountText(left)), answerable: true, left } : { text: EG_TEXT.indoors, answerable: false, left };
}
// Gamepad buttons arrive as Unity key names, so `JoystickButton0` is the A button.
export const EG_CALL_KEYS = Object.freeze(['Enter', 'NumpadEnter', 'JoystickButton0']);

export const EG_CALL_PROMPT_STYLE_ID = 'dagger-eg-call-style';
export const EG_CALL_PROMPT_CSS = `
.dfegcall { position: fixed; left: 50%; transform: translateX(-50%); top: calc(8px + env(safe-area-inset-top, 0px));
  z-index: 8; display: none; align-items: center; gap: 10px; padding: 8px 12px; pointer-events: none;
  background: rgba(20, 18, 12, .94); border: 1px solid #b8913a; border-radius: 6px; color: #f1e7cf;
  font-family: inherit; max-width: calc(100vw - 24px); box-sizing: border-box; }
.dfegcall[data-up="1"] { display: flex; }
.dfegcall-line { font-size: 14px; line-height: 1.3; overflow-wrap: anywhere; }
.dfegcall-btn { pointer-events: auto; min-height: 32px; padding: 4px 12px; border-radius: 3px; border: 1px solid #b8913a;
  background: #3a3020; color: #f1e7cf; font: inherit; font-size: 13px; cursor: pointer; }
.dfegcall-btn[hidden] { display: none; }
.dfegcall-btn:hover { background: #d8b04a; color: #0e1013; }
.dfegcall.touch .dfegcall-btn { min-height: 44px; padding: 8px 12px; }
`;
/** @param {{ onAnswer: () => void, doc?: Document, touch?: boolean }} o */
export function createEgCallPrompt({ onAnswer, doc = globalThis.document, touch = false }) {
  if (!doc?.createElement) return { draw() {}, destroy() {}, root: null };
  if (doc.getElementById && !doc.getElementById(EG_CALL_PROMPT_STYLE_ID)) {
    const st = doc.createElement('style');
    st.id = EG_CALL_PROMPT_STYLE_ID;
    st.textContent = EG_CALL_PROMPT_CSS;
    (doc.head ?? doc.body)?.append(st);
  }
  const el = (tag, cls, text) => { const n = doc.createElement(tag); n.className = cls; if (text != null) n.textContent = text; return n; };
  const root = el('div', `dfegcall${touch ? ' touch' : ''}`);
  root.dataset.up = '0';
  const line = el('div', 'dfegcall-line');
  const btn = el('button', 'dfegcall-btn', 'Answer'); /** @type {any} */ (btn).type = 'button';
  root.append(line, btn);
  doc.body?.append(root);
  // Stop propagation so a press on the strip never reaches the game as an attack.
  const swallow = (e) => e.stopPropagation();
  for (const t of ['pointerdown', 'mousedown', 'click', 'touchstart', 'wheel', 'contextmenu']) root.addEventListener(t, swallow);
  btn.addEventListener('click', () => { try { onAnswer(); } catch { } });
  let alive = true;
  return {
    root,
    /** @param {{ text: string, answerable: boolean, button?: string } | null} m */
    draw(m) {
      if (!alive) return;
      const up = !!m;
      if (root.dataset.up !== (up ? '1' : '0')) root.dataset.up = up ? '1' : '0';
      if (!up) return;
      if (line.textContent !== m.text) line.textContent = m.text;
      if (btn.hidden !== !m.answerable) btn.hidden = !m.answerable;
      const word = m.button ?? 'Answer';
      if (btn.textContent !== word) btn.textContent = word;
    },
    destroy() { if (!alive) return; alive = false; root.remove?.(); },
  };
}

// A placeholder destination for the portal pool; it is never sent on the wire.
export const EG_CALL_DEST = Object.freeze({ pixel: Object.freeze({ x: 0, y: 0 }), name: 'the Spire' });
/** @param {{ renderer?: any, audio?: any, now?: () => number, toScene?: (p: number[]) => number[], toWire?: (p: number[]) => number[], groundAt?: ((p: number[]) => number|null)|null, onEnter?: () => void, onRefused?: (hold: string) => void, hold?: () => (string|null) }} deps */
export function createEgCallPortal({ renderer = null, audio = null, now = () => performance.now(), toScene = (p) => p, toWire = (p) => p, groundAt = null, onEnter = () => {}, onRefused = () => {}, hold = () => null } = {}) {
  // `eventGround: false` lets this portal open on an event ground, since it is the way into the breach.
  const pool = createPortalGates({ renderer, audio, now, toScene, toWire, groundAt, onEnter: () => onEnter(), onRefused: (hold) => onRefused(hold), eventGround: false });
  return {
    open(feet, yaw, probes = {}) {
      const p = portalPlace(feet, yaw, probes);
      if (!p.at) return { refused: p.refused };
      pool.open(p.at, EG_CALL_DEST);
      return { at: p.at };
    },
    standing: () => !!pool.mine(),
    tick: (feet) => pool.tick(feet, { hold }),
    batches: () => pool.batches(),
    clear: () => pool.clear(),
    get gates() { return pool.gates; },
    life: PORTAL_OPEN_MS,
  };
}
