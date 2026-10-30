// @ts-check
// BUNNY-GUILDS (Phase 2a): THE BARDS' COLLEGE PERFORMANCE - a small timing game, drawn on the canvas as the other
// windows are (townTalk's overlay slot, so the world stands still under it).
//
// A marker sweeps a bar, back and forth; a bright band (the note) lies somewhere on it. Press Space, E, Enter or click
// while the marker is in the band to strike the note; anywhere else is a miss. Each press moves to the next note, at a
// new place. After NOTES notes the window says how it went, and `onDone(hits)` pays it; Escape stops it, nothing paid.

import { drawText } from './text.js';
import { t } from '../systems/textManager.js';

/** How many notes a performance has. */
export const NOTES = 6;
/** The note band's width, as a share of the bar. */
export const BAND = 0.16;
/** The marker's speed, in bars a second. */
export const SPEED = 1.1;

const PANEL = [0.05, 0.05, 0.09, 0.92];
const BAR = [0.18, 0.16, 0.12, 1];
const NOTE = [0.75, 0.55, 0.22, 1];
const MARK = [0.95, 0.92, 0.82, 1];
const TEXT = [0.86, 0.82, 0.68, 1];
const DIM = [0.55, 0.52, 0.45, 1];
const HIT = [0.45, 0.8, 0.4, 1];
const MISS = [0.85, 0.35, 0.3, 1];

const STRIKE = new Set(['Space', 'KeyE', 'Enter', 'confirm', 'char: ', 'char:e', 'char:E']);   // the overlay slot hands keys as actions (ui/input.js overlayAction)
const STOP = new Set(['Escape', 'back']);

export class BardPerformanceWindow {
  /**
   * @param {{ title: string, onDone: (hits: number) => string[], now?: () => number, rng?: () => number,
   *   words: { help: string, note: (n: number, of: number) => string, close: string } }} o `onDone` pays and answers the lines said after
   */
  constructor({ title, onDone, now = () => performance.now(), rng = Math.random, words }) {
    this.title = title;
    this.onDone = onDone;
    this.now = now;
    this.rng = rng;
    this.words = words;
    this.start = now();
    this.note = 0;
    /** @type {boolean[]} */
    this.results = [];
    this.band = this._place();
    /** @type {string[] | null} the closing lines, once played */
    this.after = null;
    this.done = false;
  }

  _place() { return 0.05 + this.rng() * (0.9 - BAND); }

  /** Where the marker is, 0..1, bouncing. */
  marker() {
    const t = ((this.now() - this.start) / 1000) * SPEED;
    const f = t % 2;
    return f < 1 ? f : 2 - f;
  }

  strike() {
    if (this.after) { this.done = true; return; }
    const m = this.marker();
    this.results.push(m >= this.band && m <= this.band + BAND);
    this.note++;
    if (this.note >= NOTES) {
      const hits = this.results.filter(Boolean).length;
      this.after = this.onDone(hits);
      return;
    }
    this.band = this._place();
  }

  input(/** @type {string} */ code) {
    if (this.done) return;
    if (this.after) { this.done = true; return; }
    if (STOP.has(code)) { this.done = true; return; }
    if (STRIKE.has(code)) this.strike();
  }

  click() { if (!this.done) this.strike(); return true; }
  hover() {}

  draw(/** @type {any} */ renderer, /** @type {any} */ canvas, /** @type {any} */ font, /** @type {number} */ s) {
    const w = 300 * s, h = 110 * s;
    const x = (canvas.width - w) / 2, y = (canvas.height - h) / 2;
    renderer.drawScreenQuad(null, { x, y, w, h }, undefined, PANEL);
    drawText(renderer, font, this.title, x + 12 * s, y + 10 * s, s, TEXT);
    if (this.after) {
      this.after.forEach((l, i) => drawText(renderer, font, l, x + 12 * s, y + (30 + i * 12) * s, s, TEXT));
      drawText(renderer, font, this.words.close, x + 12 * s, y + h - 16 * s, s, DIM);
      return;
    }
    drawText(renderer, font, this.words.note(this.note + 1, NOTES), x + 12 * s, y + 24 * s, s, DIM);
    const bx = x + 12 * s, by = y + 46 * s, bw = w - 24 * s, bh = 14 * s;
    renderer.drawScreenQuad(null, { x: bx, y: by, w: bw, h: bh }, undefined, BAR);
    renderer.drawScreenQuad(null, { x: bx + this.band * bw, y: by, w: BAND * bw, h: bh }, undefined, NOTE);
    renderer.drawScreenQuad(null, { x: bx + this.marker() * bw - s, y: by - 3 * s, w: 2 * s, h: bh + 6 * s }, undefined, MARK);
    this.results.forEach((ok, i) => renderer.drawScreenQuad(null, { x: bx + i * 10 * s, y: by + bh + 8 * s, w: 7 * s, h: 7 * s }, undefined, ok ? HIT : MISS));
    drawText(renderer, font, this.words.help, x + 12 * s, y + h - 16 * s, s, DIM);
  }
}

/** The window's title and words, in the player's language. */
export const bardPerformanceTitle = () => t('bguild.bards.title', 'Playing for the house');
export const bardPerformanceWords = () => ({
  help: t('bguild.bards.help', 'Space, E or click when the marker is on the note. Esc stops.'),
  note: (n, of) => t('bguild.bards.note', 'Note {n} of {of}', { n, of }),
  close: t('bguild.bards.close', 'Press any key to finish.'),
});
