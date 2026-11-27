// Classic spellcasting hands, ported from DFU FPSSpellCasting.cs and WeaponBasics.GetMagicAnimFilename.
// The animation is one singleton because up to four hosts and cast engines share one pair of hands.
import { CifRciFile } from '../formats/cifRciFile.js';
import { frameToColor32 } from './fpsWeapon.js';
import { weaponOffsetHeight } from '../ui/hudLarge.js';
import { validCastRate } from '../magic/castSpeed.js';

// The hands lay out against a 300-wide surface, not 320, so they sit further in from the edges than a weapon.
export const NATIVE_SPELL_W = 300;
export const NATIVE_SPELL_H = 200;

export const RELEASE_FRAME = 5;

// Frames 0 and 5 (and fire's frame 4) are narrower drawings, pushed in by this share of the screen.
export const SMALL_FRAME_ADJUST = 0.134;

export const ANIM_SPEED = 0.04;

export const CAST_FRAME_PERIOD = 0.04;

// The next cast waits this long from the click (over the cast rate), so quick hands do not raise the repeat rate.
export const CAST_RECOVER_S = 0.7;

// Ceiling for a release held for the Morrowind arm's key: a clip with no release key still casts, just late.
export const HELD_RELEASE_MAX_S = 1.5;

// The Morrowind arm paces its release to this moment, so both looks release a spell at the same time.
export const castReleaseS = (rate = 1) => (RELEASE_FRAME * CAST_FRAME_PERIOD) / validCastRate(rate);

export const FRAME_INDICES = Object.freeze([0, 1, 2, 3, 4, 5, 0]);

// The game's element indices, as in spellcast.js ELEMENTS; DFU's ElementTypes bit field is not used.
export const ELEMENT_TYPES = Object.freeze({ Fire: 0, Cold: 1, Poison: 2, Shock: 3, Magic: 4 });

export const MAGIC_ANIM_FILE = Object.freeze([
  'FIRE00C6.CIF',
  'FRST00C6.CIF',
  'POIS00C6.CIF',
  'SHOK00C6.CIF',
  'MJIC00C6.CIF',
]);

// DFU throws for an unsupported element; this returns null so the caller plays no animation instead of failing.
export function magicAnimFilename(element) {
  return MAGIC_ANIM_FILE[element] ?? null;
}

// The loose-file CIF override (TextureReplacement.TryImportCifRci) is not consulted, as for weapon CIFs.
/** @returns {Promise<{element:number, records:{width:number,height:number,tex:*}[]}>} */
export async function loadSpellCastArt(getBytes, palette, renderer, element) {
  const fileName = magicAnimFilename(element);
  if (!fileName) return null;
  const cif = new CifRciFile();
  if (!cif.load(await getBytes(fileName), fileName, palette)) {
    throw new Error(`Could not load spell anims file ${fileName}`);
  }
  const records = [];
  for (let r = 0; r < cif.recordCount; r++) {
    const size = cif.getSize(r);
    const c32 = frameToColor32(cif.getDFBitmap(r, 0), palette, null);
    records.push({
      width: size.width,
      height: size.height,
      tex: renderer.uploadTexture('img', `fpsc:${fileName}:${r}`, c32, { clamp: true }),
    });
  }
  return { element, records };
}

// The step accumulator resets at playOneShot, where DFU's coroutine runs free; that is the one deviation.
export class SpellCastAnim {
  constructor() {
    this.element = null;
    this.currentFrame = -1;
    this._acc = 0;
    this._onRelease = null;
    this._hold = null;
    this._heldAge = 0;
    this._period = CAST_FRAME_PERIOD;
    this._recover = 0;
  }

  get recovering() { return this._recover > 0; }

  get releaseHeld() { return !!this._hold; }

  get isPlayingAnim() { return this.currentFrame >= 0; }

  get frameIndex() { return this.currentFrame < 0 ? -1 : FRAME_INDICES[this.currentFrame]; }

  // The release handler binds per cast, not once, so the cast engine that started the hands receives the release.
  // A refused cast leaves the current handler untouched.
  /**
   * @param {?Function} onRelease
   * @param {{hold?: ?Function, rate?: number}} [opts]
   */
  playOneShot(element, onRelease = null, { hold = null, rate = 1 } = {}) {
    if (this.isPlayingAnim || this._hold || this._recover > 0) return false;
    if (!magicAnimFilename(element)) return false;
    this.element = element;
    this.currentFrame = 0;
    this._acc = 0;
    this._onRelease = onRelease;
    // With the Morrowind arm casting, the release waits for its "<type> release" key, as OpenMW casts there.
    this._hold = typeof hold === 'function' ? hold : null;
    this._heldAge = 0;
    this._period = CAST_FRAME_PERIOD / validCastRate(rate);
    this._recover = CAST_RECOVER_S / validCastRate(rate);
    return true;
  }

  // The handler is cleared before it runs, so one cast raises exactly one release.
  _raiseRelease() {
    const h = this._onRelease;
    this._onRelease = null;
    if (h) h();
  }

  tick(dt) {
    let released = false;
    if (this._recover > 0) this._recover = Math.max(0, this._recover - (Number.isFinite(dt) && dt > 0 ? dt : 0));
    if (this._hold) {
      this._heldAge += dt;
      if (this._hold() || this._heldAge >= HELD_RELEASE_MAX_S) { this._hold = null; released = true; this._raiseRelease(); }
    }
    if (!this.isPlayingAnim) { this._acc = 0; return released; }
    this._acc += dt;
    while (this._acc >= this._period && this.currentFrame >= 0) {
      this._acc -= this._period;
      this.currentFrame++;
      // The release fires on the step, before the end-of-frames wrap, as in DFU.
      if (this.currentFrame === RELEASE_FRAME && !this._hold) { released = true; this._raiseRelease(); }
      if (this.currentFrame >= FRAME_INDICES.length) this.currentFrame = -1;
    }
    return released;
  }
}

export const fpsSpellCasting = new SpellCastAnim();

// DFU's 1.01 non-point filter scale is left out because every image texture binds NEAREST.
export function spellHandRects(canvas, rec, { frameIndex, element, offsetHeight = 0 }) {
  const handScaleX = canvas.width / NATIVE_SPELL_W;
  const handScaleY = canvas.height / NATIVE_SPELL_H;
  const offsetWidth = (frameIndex === 0 || frameIndex === 5
    || (element === ELEMENT_TYPES.Fire && frameIndex === 4)) ? SMALL_FRAME_ADJUST : 0;
  const w = rec.width * handScaleX;
  const h = rec.height * handScaleY;
  const y = canvas.height - h - offsetHeight;
  return {
    left: { x: canvas.width * offsetWidth, y, w, h },
    right: { x: canvas.width * (1 - offsetWidth) - w, y, w, h },
  };
}

export const RIGHT_HAND_UV = Object.freeze({ u0: 1, v0: 0, u1: 0, v1: 1 });

export function drawSpellCastHands(renderer, canvas, art, frameIndex, {
  offsetHeight = weaponOffsetHeight(),
  tint = null,
  opacity = 1,
} = {}) {
  if (!art || frameIndex < 0) return false;
  const rec = art.records[frameIndex];
  if (!rec || !rec.width || !rec.height) return false;
  const { left, right } = spellHandRects(canvas, rec, { frameIndex, element: art.element, offsetHeight });
  const color = opacity === 1 ? tint ?? undefined : [tint?.[0] ?? 1, tint?.[1] ?? 1, tint?.[2] ?? 1, opacity];
  const opts = opacity === 1 ? undefined : { blend: true };
  renderer.drawScreenQuad(rec.tex, left, undefined, color, opts);
  renderer.drawScreenQuad(rec.tex, right, RIGHT_HAND_UV, color, opts);
  return true;
}

// Readied Spellcasting Hands shows frame 0 of the readied spell while no cast plays, except for caster-only spells.
export const READIED_HANDS_FRAME = 0;
export function readiedHandsFrame(spell, castPlaying) {
  if (!spell || castPlaying) return -1;
  // Range type 0 is caster-only: it casts the moment it is readied.
  if (spell.rangeType === 0) return -1;
  if (!magicAnimFilename(spell.element)) return -1;
  return READIED_HANDS_FRAME;
}
