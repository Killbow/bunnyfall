// @ts-check
// BUNNY-GUILDS (Phase 2a), reworked 2026-11-02: THE BARDS' COLLEGE PERFORMANCE - a rhythm game over a real tune.
//
// The bard picks a MIDI file from their own computer (or takes the house jig). The tune is read on their machine
// (net/bardTune.js tuneFromMidi), played at once on the game's audio bus, and sent to everyone in the tavern (the relay
// counts it note by note; each other game plays it - scenes/bardStage.js). While it plays, the bard's notes fall down four
// lanes toward a line; D, F, J and K (or a click on a lane) strike them as they arrive. Perfect and good strikes score; a
// miss breaks the run. At the end the window says how it went, and `onDone(hits)` pays it, `hits` being the accuracy
// scaled to the NOTES the College has always paid by. Escape stops the tune and pays nothing.
//
// Drawn on the canvas as the other windows are (townTalk's overlay slot, so the world stands still under it).

import { drawText, measureText } from './text.js';
import { t } from '../systems/textManager.js';
import { tuneFromMidi, houseTune, chartOf, LANES, MIDI_FILE_MAX } from '../net/bardTune.js';

/** What a performance pays by: the College's notes (systems/guild/bunnyServices.js BARD_NOTE_GOLD). */
export const NOTES = 6;
/** How long a note takes to fall from the top to the line, ms. */
export const APPROACH_MS = 1700;
/** The windows around the line, ms: a perfect strike and a good one. */
export const PERFECT_MS = 70, GOOD_MS = 140;
/** The silence before the tune, ms: the first notes are already falling. */
export const LEAD_MS = 1700;

const PANEL = [0.05, 0.04, 0.07, 0.95];
const EDGE = [0.62, 0.48, 0.2, 1];
const WELL = [0.1, 0.085, 0.13, 1];
const LANE_RULE = [0.2, 0.17, 0.24, 1];
const LINE = [0.95, 0.85, 0.5, 1];
const TEXT = [0.9, 0.85, 0.7, 1];
const DIM = [0.58, 0.54, 0.46, 1];
const GOOD = [0.62, 0.85, 0.45, 1];
const PERFECT = [1, 0.9, 0.45, 1];
const MISS = [0.9, 0.38, 0.32, 1];
const LANE_COLORS = [[0.82, 0.38, 0.35, 1], [0.86, 0.7, 0.3, 1], [0.42, 0.72, 0.5, 1], [0.42, 0.6, 0.86, 1]];
const KEYS = ['D', 'F', 'J', 'K'];
const LANE_W = 34;   // native pixels
const LANE_OF = new Map(KEYS.flatMap((k, i) => [[`char:${k}`, i], [`char:${k.toLowerCase()}`, i]]));
const STOP = new Set(['Escape', 'back']);

/** Ask the player's computer for a MIDI file: { name, bytes }, null for none, { error } for one we will not read. */
export function pickMidiFile() {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') { resolve(null); return; }
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.mid,.midi,audio/midi,audio/x-midi'; input.style.display = 'none';
    const done = (/** @type {any} */ v) => { input.remove(); resolve(v); };
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) { done(null); return; }
      if (f.size > MIDI_FILE_MAX) { done({ error: 'big' }); return; }
      try { done({ name: f.name.replace(/\.midi?$/i, ''), bytes: new Uint8Array(await f.arrayBuffer()) }); } catch { done({ error: 'read' }); }
    };
    input.oncancel = () => done(null);
    document.body.append(input);
    input.click();
  });
}

export class BardPerformanceWindow {
  /**
   * @param {{ title: string, onDone: (hits: number) => string[], words?: any, performer?: string,
   *   stage?: { play: (tune: any) => boolean, stop: () => void } | null,
   *   keepAlive?: () => void, onCancel?: () => void, now?: () => number, pick?: () => Promise<any> }} o
   *   `onDone` pays and answers the lines said after; `stage` plays and sends the tune; `keepAlive` says "still playing" to the tavern
   */
  constructor({ title, onDone, performer = '', stage = null, keepAlive = () => {}, onCancel = () => {}, now = () => performance.now(), pick = pickMidiFile }) {
    this.title = title; this.onDone = onDone; this.performer = performer; this.stage = stage; this.keepAlive = keepAlive; this.onCancel = onCancel;
    this.now = now; this.pick = pick;
    /** @type {'pick'|'ready'|'play'|'after'} */ this.phase = 'pick';
    /** @type {any} */ this.tune = null;
    /** @type {{ t: number, lane: number, hit?: number }[]} */ this.chart = [];
    this.note = 0;   // the first chart note not yet settled
    this.leadAt = 0; this.sounded = false;
    this.perfect = 0; this.good = 0; this.miss = 0; this.combo = 0; this.best = 0; this.score = 0;
    /** @type {{ text: string, color: number[], at: number } | null} */ this.judged = null;
    /** @type {number[]} */ this.flash = [0, 0, 0, 0];
    /** @type {string | null} */ this.notice = null;
    this.loading = false;
    /** @type {string[] | null} */ this.after = null;
    this.keepAt = 0;
    this.accuracy = 0;
    this.done = false;
  }

  _load(/** @type {any} */ tune) {
    this.tune = tune;
    this.chart = chartOf(tune).map((c) => ({ ...c }));
    if (this.chart.length < 8) { this.tune = null; this.chart = []; this.notice = t('bguild.bards.tooShort', 'That tune has too few notes to play.'); return; }
    this.phase = 'ready'; this.notice = null;
  }

  async _choose() {
    if (this.loading) return;
    this.loading = true; this.notice = t('bguild.bards.choosing', 'Choose a MIDI file...');
    let got = null;
    try { got = await this.pick(); } catch { got = null; }
    this.loading = false;
    if (!got) { this.notice = null; return; }
    if (got.error) { this.notice = got.error === 'big' ? t('bguild.bards.tooBig', 'That file is too big for a tavern tune.') : t('bguild.bards.unreadable', 'That file could not be read.'); return; }
    const tune = tuneFromMidi(got.bytes, got.name);
    if (!tune) { this.notice = t('bguild.bards.notMidi', 'That is not a MIDI tune the College can play.'); return; }
    this._load(tune);
  }

  _begin() {
    this.phase = 'play'; this.leadAt = this.now(); this.sounded = false; this.keepAt = this.leadAt;
    this.keepAlive();
  }

  /** The tune's own clock, ms: negative through the lead-in. */
  songMs() { return this.now() - this.leadAt - LEAD_MS; }

  _stop() { this.stage?.stop(); if (this.phase !== 'after') this.onCancel(); this.done = true; }

  _strike(/** @type {number} */ lane) {
    if (this.phase !== 'play') return;
    this.flash[lane] = this.now();
    const at = this.songMs();
    let best = -1, bestD = Infinity;
    for (let i = this.note; i < this.chart.length; i++) {
      const c = this.chart[i];
      if (c.t - at > GOOD_MS) break;
      if (c.lane !== lane || c.hit !== undefined) continue;
      const d = Math.abs(c.t - at);
      if (d <= GOOD_MS && d < bestD) { best = i; bestD = d; }
    }
    if (best < 0) return;   // a press with no note is nothing, not a miss: a drummer's habit costs no run
    const perfect = bestD <= PERFECT_MS;
    this.chart[best].hit = perfect ? 2 : 1;
    if (perfect) this.perfect++; else this.good++;
    this.combo++; this.best = Math.max(this.best, this.combo);
    this.score += (perfect ? 100 : 60) * (1 + Math.min(this.combo, 40) / 20);
    this.judged = { text: perfect ? t('bguild.bards.perfect', 'Perfect') : t('bguild.bards.good', 'Good'), color: perfect ? PERFECT : GOOD, at: this.now() };
  }

  /** Called every frame: the notes that went past unstruck are misses; the tune's end ends the night. */
  _step() {
    if (this.phase !== 'play') return;
    const at = this.songMs();
    if (!this.sounded && at >= -150) { this.sounded = true; this.stage?.play(this.tune); }
    while (this.note < this.chart.length && (this.chart[this.note].hit !== undefined || this.chart[this.note].t < at - GOOD_MS)) {
      const c = this.chart[this.note++];
      if (c.hit === undefined) { c.hit = 0; this.miss++; this.combo = 0; this.judged = { text: t('bguild.bards.miss', 'Miss'), color: MISS, at: this.now() }; }
    }
    if (this.now() - this.keepAt > 20000) { this.keepAt = this.now(); this.keepAlive(); }
    if (this.note >= this.chart.length && at > this.chart[this.chart.length - 1].t + 1200) this._finish();
  }

  _finish() {
    this.phase = 'after';
    const total = this.chart.length || 1;
    const accuracy = (this.perfect + 0.6 * this.good) / total;
    const hits = Math.max(0, Math.min(NOTES, Math.round(accuracy * NOTES)));
    this.accuracy = accuracy;
    this.after = [
      t('bguild.bards.summary', '"{title}": {perfect} perfect, {good} good, {miss} missed.', { title: this.tune?.title ?? '', perfect: this.perfect, good: this.good, miss: this.miss }),
      ...this.onDone(hits),
    ];
  }

  input(/** @type {string} */ code) {
    if (this.done) return;
    if (STOP.has(code)) { this._stop(); return; }
    if (this.phase === 'after') { this.done = true; return; }
    if (this.phase === 'pick') {
      if (code === 'char:f' || code === 'char:F' || code === 'confirm') void this._choose();
      else if (code === 'char:h' || code === 'char:H') this._load(houseTune());
      return;
    }
    if (this.phase === 'ready') {
      if (code === 'confirm' || code === 'char: ') this._begin();
      else if (code === 'char:f' || code === 'char:F') { this.phase = 'pick'; void this._choose(); }
      return;
    }
    const lane = LANE_OF.get(code);
    if (lane !== undefined) this._strike(lane);
  }

  click(/** @type {number} */ x) {
    if (this.done) return true;
    if (this.phase === 'ready') { this._begin(); return true; }
    if (this.phase === 'after') { this.done = true; return true; }
    if (this.phase === 'pick') { void this._choose(); return true; }
    if (this.phase === 'play') {   // x is native (320 wide): the highway sits in the panel's middle
      const lane = Math.floor((x - (320 - LANES * LANE_W) / 2) / LANE_W);
      if (lane >= 0 && lane < LANES) this._strike(lane);
    }
    return true;
  }

  hover() {}

  draw(/** @type {any} */ renderer, /** @type {any} */ canvas, /** @type {any} */ font, /** @type {number} */ s) {
    this._step();
    const w = 250 * s, h = 178 * s, x = (canvas.width - w) / 2, y = (canvas.height - h) / 2;
    const rect = (/** @type {number} */ rx, /** @type {number} */ ry, /** @type {number} */ rw, /** @type {number} */ rh, /** @type {number[]} */ c) => renderer.drawScreenQuad(null, { x: rx, y: ry, w: rw, h: rh }, undefined, c);
    const text = (/** @type {string} */ str, /** @type {number} */ tx, /** @type {number} */ ty, /** @type {number[]} */ c = TEXT) => drawText(renderer, font, str, tx, ty, s, c);
    const centred = (/** @type {string} */ str, /** @type {number} */ ty, /** @type {number[]} */ c = TEXT) => text(str, x + (w - measureText(font.fnt, str) * s) / 2, ty, c);
    rect(x - 2 * s, y - 2 * s, w + 4 * s, h + 4 * s, EDGE);
    rect(x, y, w, h, PANEL);
    centred(this.title, y + 8 * s);
    if (this.phase === 'pick' || this.phase === 'ready') {
      const lines = this.phase === 'pick'
        ? [t('bguild.bards.pickHelp1', 'F - choose a MIDI file from your computer'), t('bguild.bards.pickHelp2', 'H - play the house jig'), t('bguild.bards.pickHelp3', 'Everyone in the tavern will hear it. Esc cancels.')]
        : [this.tune.title, t('bguild.bards.ready', '{n} notes to strike. D F J K, or click the lanes.', { n: this.chart.length }), t('bguild.bards.begin', 'Enter or click to begin. F picks another tune.')];
      lines.forEach((l, i) => centred(l, y + (48 + i * 16) * s, i === 0 && this.phase === 'ready' ? PERFECT : i === 2 ? DIM : TEXT));
      if (this.notice) centred(this.notice, y + 120 * s, MISS);
      return;
    }
    if (this.phase === 'after') {
      (this.after ?? []).forEach((l, i) => centred(l, y + (34 + i * 14) * s));
      centred(t('bguild.bards.close', 'Press any key to finish.'), y + h - 18 * s, DIM);
      return;
    }
    // the highway
    const lw = LANE_W * s, hx = x + (w - lw * LANES) / 2, top = y + 24 * s, hh = 112 * s, line = top + hh - 12 * s;
    rect(hx - 2 * s, top - 2 * s, lw * LANES + 4 * s, hh + 4 * s, EDGE);
    rect(hx, top, lw * LANES, hh, WELL);
    for (let i = 1; i < LANES; i++) rect(hx + i * lw - 0.5 * s, top, s, hh, LANE_RULE);
    const at = this.songMs(), now = this.now();
    for (let i = Math.max(0, this.note - 1); i < this.chart.length; i++) {
      const c = this.chart[i], ahead = c.t - at;
      if (ahead > APPROACH_MS) break;
      if (c.hit) continue;   // struck: gone
      const ny = line - (ahead / APPROACH_MS) * (line - top) - 3 * s;
      if (ny < top - 6 * s || ny > top + hh) continue;
      const col = LANE_COLORS[c.lane];
      rect(hx + c.lane * lw + 3 * s, ny, lw - 6 * s, 6 * s, c.hit === 0 ? [0.3, 0.25, 0.25, 1] : col);
      rect(hx + c.lane * lw + 3 * s, ny, lw - 6 * s, s, [1, 1, 1, 0.35]);
    }
    rect(hx, line, lw * LANES, 2 * s, LINE);
    for (let i = 0; i < LANES; i++) {
      const lit = Math.max(0, 1 - (now - this.flash[i]) / 160);
      if (lit > 0) rect(hx + i * lw, line - 14 * s, lw, 16 * s, [LANE_COLORS[i][0], LANE_COLORS[i][1], LANE_COLORS[i][2], 0.45 * lit]);
      text(KEYS[i], hx + i * lw + (lw - measureText(font.fnt, KEYS[i]) * s) / 2, line + 5 * s, lit > 0 ? LINE : DIM);
    }
    // the sides: score and combo left, the judgement and progress right
    text(String(Math.round(this.score)), x + 10 * s, top, PERFECT);
    text(t('bguild.bards.score', 'Score'), x + 10 * s, top + 12 * s, DIM);
    if (this.combo > 1) { text(`x${this.combo}`, x + 10 * s, top + 34 * s, TEXT); text(t('bguild.bards.combo', 'Run'), x + 10 * s, top + 46 * s, DIM); }
    if (this.judged && now - this.judged.at < 700) text(this.judged.text, x + w - 10 * s - measureText(font.fnt, this.judged.text) * s, top + 40 * s, this.judged.color);
    const last = this.chart[this.chart.length - 1]?.t ?? 1, prog = Math.max(0, Math.min(1, at / last));
    rect(hx, y + h - 20 * s, lw * LANES, 4 * s, LANE_RULE);
    rect(hx, y + h - 20 * s, lw * LANES * prog, 4 * s, EDGE);
    centred(at < 0 ? t('bguild.bards.getReady', 'Get ready...') : t('bguild.bards.playing', 'Playing: {title}', { title: this.tune.title }), y + h - 13 * s, DIM);
  }
}

/** The window's title in the player's language. */
export const bardPerformanceTitle = () => t('bguild.bards.title', 'Playing for the house');
export const bardPerformanceWords = () => ({});
