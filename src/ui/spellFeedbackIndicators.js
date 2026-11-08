// ═══════════════════════════════════════════════════════════════════
// SF1: SPELL / COMBAT FEEDBACK INDICATORS (foundation for the foe-side
// readouts). The damage numbers hitNumbers.js draws are MY blows'
// outcome; this one draws what a FOE's body TELLS me about a blow that
// landed on it - and, caster-only, what my spell DID to it. Two agents
// build on top of this module (B: the status words over a foe; C: the
// spell damage numbers), so they do NOT create their own UI here.
//
// WHAT IT DRAWS. All DOM, all on hitNumbers' SAME layer (#enhanced-hitnums)
// and its same "one node per glyph, removed when its animation ends" law:
//   showFoeWord(kind, word, opts)  - a foe's resistance/immunity/spell-save
//     or melee-shield verdict over its head. kinds: 'immune' (resist /
//     immunity), 'saved' (spell save beat it), 'shielded' (a melee blow a
//     Shield absorbed), 'broken' (that Shield busted under the blow). Plus
//     the shared 'word'. Bright, shadowed - they must read over a sprite.
//   showFoeDamage(amount, kind)    - MY spell's damage to a foe: health red,
//     fatigue green, magicka blue. Only when amount > 0 (task 3).
//
// WHERE IT SITS. Reticle-centered by default, exactly like hitNumbers'
// numbers rise from the point the player struck. If opts.position is a
// scene [x,y,z] it instead projects over that foe's head - but the module
// owns NO camera: hostMagic.js / exteriorFoes.js wire setFoeProjector once
// with the frame's own lens, and a missing projector falls back to the
// reticle. The layer is created by mountSpellFeedback (reuses #enhanced-hitnums;
// it does not make a second one) and torn down by unmountSpellFeedback.
//
// VISIBLE TO ALL PLAYERS needs a peer broadcast. This module exposes only
// the seam: registerFoeFeedbackSender(fn) hands in the wire sender, and
// broadcastFoeIndicator / broadcastFoeDamage call it when one is set. For
// offline/single-player the sender stays null and every indicator shows
// locally anyway, via direct calls to showFoeWord / showFoeDamage.
// ═══════════════════════════════════════════════════════════════════
const RISE_MS = 950;
let layer = null;
let seq = 0;

/** A foe-projector, set once by the host with its own frame lens: a scene
 *  [x,y,z] to CSS pixels on the layer, or null when off-screen/behind. */
let _projector = null;
/** @param {(pos: number[] | null) => { x: number, y: number } | null} fn */
export function setFoeProjector(fn) { _projector = typeof fn === 'function' ? fn : null; }

/** The verdict words over a foe's head - effect key to the word it says.
 *  Kept to TRUE STATUS effects (silence, paralysis); agent B extends it with
 *  save outcomes too: */
export const STATUS_WORDS = Object.freeze({
  silenced: 'Silenced!',
  paralyze: 'Paralyzed!',
  pacify: 'Pacified!',   // SF1/B (agent B extends): a Pacify/Charm that stops the foe fighting reads as a status word over its head
  saved: 'Saved!',        // SF1/B2: a direct-damage effect whose saving throw rolled to 0% - nothing landed
  blending: 'Blending!',  // BLENDING: a foe's own Chameleon self-cast now hides it; the player never hears "You are blending." (suppressed), so this word over its head is the only sign
});

/** The spell-damage kinds a caster-only number may show. */
export const SPELL_DMG_KINDS = Object.freeze(['health', 'fatigue', 'magicka']);

// ── the layer, shared with hitNumbers ───────────────────────────────
function ensureSpellLayer() {
  if (layer && layer.isConnected) return layer;
  if (typeof document === 'undefined') return null;
  // REUSE: the numbers' own layer already exists on the enhanced overlay.
  const existing = document.getElementById('enhanced-hitnums');
  if (existing) { layer = existing; return layer; }
  layer = document.createElement('div');
  layer.id = 'enhanced-hitnums';
  layer.setAttribute('aria-hidden', 'true');
  document.body.append(layer);
  return layer;
}

/** The CSS pixels a foe-head point lands at, or null (off-screen) - the
 *  host's projector where one is set, else the reticle. */
function placeAt(position) {
  if (position && typeof _projector === 'function') {
    const p = _projector(position);
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) return p;
  }
  return null;   // reticle-centered fallback: the CSS leaves/top do the work
}

/** One foe glyph on the layer, removed when its animation ends. Pure of
 *  host - only ever touches DOM + the shared layer. */
function showGlyph(kind, text, position) {
  const host = ensureSpellLayer();
  if (!host || !text) return null;
  const node = document.createElement('span');
  node.className = `hitnum hitnum-${kind}`;
  node.textContent = String(text);
  const at = placeAt(position);
  if (at) {
    // Anchor on the projected head point: left/top here, horizontal centering
    // and the rise left to the shared hitnum animation (an inline transform
    // would fight it). The glyph grows up off the foe's skull.
    node.style.left = `${at.x}px`;
    node.style.top = `${at.y}px`;
  }
  node.style.setProperty('--rise', `${RISE_MS}ms`);
  node.dataset.seq = String(++seq);
  host.append(node);
  const gone = () => { if (node.isConnected) node.remove(); };
  node.addEventListener('animationend', gone, { once: true });
  setTimeout(gone, RISE_MS + 250);   // a background tab runs no animation
  return node;
}

/** A foe's verdict over its head. `opts.position` the foe's scene point (its
 *  head) to project over, omitted for reticle-centered fallback. */
export function showFoeWord(kind, word, opts = {}) {
  if (!word) return null;
  return showGlyph(kind === 'word' ? 'word' : kind, word, opts.position ?? null);
}

/** A caster-only spell damage number over the foe: health red, fatigue green,
 *  magicka blue. Only when amount > 0. */
export function showFoeDamage(amount, kind) {
  const n = Number(amount);
  if (!(n > 0) || SPELL_DMG_KINDS.indexOf(kind) < 0) return null;
  return showGlyph(kind, `+${Math.round(n)}`, null);
}

// ── the peer broadcast seam (agent C/B wire a real sender here) ───────
/** @type {((event: any) => void) | null} */
let _sender = null;
export function registerFoeFeedbackSender(fn) { _sender = typeof fn === 'function' ? fn : null; }

/** A foe indicator to show on every player's screen. No sender - a no-op; the
 *  caster shows it locally via showFoeWord anyway. */
export function broadcastFoeIndicator(foeId, kind, word, position) {
  if (!_sender || !foeId) return;
  try { _sender({ type: 'foeIndicator', foeId, kind, word, position }); } catch { /* never let a send crash the frame */ }
}

/** A foe's spell damage to show on every player's screen. No sender - no-op. */
export function broadcastFoeDamage(foeId, amount, kind) {
  if (!_sender || !foeId || !(Number(amount) > 0)) return;
  try { _sender({ type: 'foeDamage', foeId, amount, kind }); } catch { /* never let a send crash the frame */ }
}

// ── mount / unmount (alongside hitNumbers in enhancedHud.js) ──────────
export function mountSpellFeedback() { ensureSpellLayer(); }
/** For tests and the classic skin's guarantee: drop the layer if we made it. */
export function unmountSpellFeedback() {
  if (layer && !layer.isConnected) { layer.remove(); }
  layer = null;
}
