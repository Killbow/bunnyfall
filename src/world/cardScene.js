// @ts-check
import { CARD_W, CARD_L, CARD_T, DEAL_LIFT, DEAL_STAGGER, dealMotion, flipMotion, flipShift, chipDiscs, pushAt, hashSeed, PUSH_S, SCOOP_LIFT, RIFFLE_S, riffleAt, GATHER_S, gatherMotion, DECK_PLATES, DECK_CARDS } from './cardMotion.js';
import { SEAT_OUT } from '../player/seatPose.js';

export const HOLE_IN = 0.12;
export const BET_IN = 0.26;
export const STACK_IN = 0.06;
export const STACK_SIDE = 0.13;
export const BOARD_SLOTS = 5;
export const BOARD_GAP = CARD_W * 1.25;
export const POT_ACROSS = 0.13;
export const CHIP_CLEAR = 0.07;
export const PLACE_FIT_MIN = 0.35;
export const TURN_DELAY = 0.12;
export const POT_BEAT = 0.35;

const SEC = (ms) => ms / 1000;

/**
 * @param {{centre: number[], axisYaw: number}} frame
 * @param {{feet: number[], yaw: number}[]} seats
 * @param {number[]} seatOf
 */
export function tablePlaces(frame, seats, seatOf) {
  const top = frame.centre[1];
  const a = [Math.sin(frame.axisYaw), Math.cos(frame.axisYaw)];
  const p = [Math.cos(frame.axisYaw), 0 - Math.sin(frame.axisYaw)];
  const at = (u, v) => [frame.centre[0] + a[0] * u + p[0] * v, top, frame.centre[2] + a[1] * u + p[1] * v];
  const seatPlace = (s) => {
    const f = [Math.sin(s.yaw), Math.cos(s.yaw)], r = [Math.cos(s.yaw), 0 - Math.sin(s.yaw)];
    const room = (frame.centre[0] - s.feet[0]) * f[0] + (frame.centre[2] - s.feet[2]) * f[1] - SEAT_OUT;
    const alongBoard = Math.abs(f[0] * a[0] + f[1] * a[1]) > Math.SQRT1_2;
    const clear = alongBoard ? (BOARD_SLOTS / 2 + 1) * BOARD_GAP + CARD_L / 2 + CHIP_CLEAR : POT_ACROSS + CHIP_CLEAR;
    const fit = Math.max(PLACE_FIT_MIN, Math.min(1, (room - clear) / BET_IN));
    const inward = (d, side = 0) => [s.feet[0] + f[0] * (SEAT_OUT + d * fit) + r[0] * side, top, s.feet[2] + f[1] * (SEAT_OUT + d * fit) + r[1] * side];
    return {
      yaw: s.yaw,
      holes: [inward(HOLE_IN, -CARD_W * 0.56), inward(HOLE_IN, CARD_W * 0.56)],
      bet: inward(BET_IN), stack: inward(STACK_IN, STACK_SIDE),
      deal: [...inward(0).slice(0, 1), top + DEAL_LIFT, inward(0)[2]],
      deck: inward(BET_IN * 0.7, -CARD_W * 2.2),
    };
  };
  return {
    seats: seatOf.map((k) => seatPlace(seats[k])),
    board: Array.from({ length: BOARD_SLOTS }, (_, i) => at((i - (BOARD_SLOTS - 1) / 2) * BOARD_GAP, 0)),
    boardYaw: frame.axisYaw + Math.PI / 2,
    burn: at(-(BOARD_SLOTS / 2 + 1) * BOARD_GAP, 0),
    muck: at(0, POT_ACROSS),
    pot: at(0, -POT_ACROSS),
    table: frame,
  };
}

export class CardScene {
  /** @param {{places: ReturnType<typeof tablePlaces>, playerSeat: number, tableSeed?: number}} p */
  constructor({ places, playerSeat, tableSeed = 0 }) {
    this.places = places;
    this.playerSeat = playerSeat;
    this.tableSeed = tableSeed;
    /** @type {{id: string, card: number, seat: number, motions: any[]}[]} */
    this.cards = [];
    this.handNo = 0;
    this.board = 0;
    this.dealer = 0;
    this.pushes = [];
    this.lastBets = new Map();
    this.busyUntil = 0;
    this.riffle = null;
    this.deck = null;
  }

  _poseOf(c, t) {
    let m = c.motions[0];
    for (const x of c.motions) if (t >= x.t0) m = x;
    return m.at(t);
  }

  _rest(p, layer = 0) { return [p[0], p[1] + CARD_T * (0.5 + layer), p[2]]; }

  _restOf(c) { const m = c.motions[c.motions.length - 1]; return m.at(Infinity); }

  /**
   * @param {any} e
   * @param {(seat: number, r: number) => number} holeOf
   */
  onEvent(e, holeOf) {
    const t = SEC(e.at);
    if (e.t === 'hand') {
      const deckAt = this.places.seats[e.button].deck, deckYaw = this.places.seats[e.button].yaw;
      const left = this.cards.filter((c) => c.seat !== -4);
      const pile = this._pileShown(t) ? this._deckPile(t) : [];
      this.cards = [
        ...pile.map((p, k) => ({ card: -1, id: `p${e.hand}:${k}`, seat: -4, motions: [gatherMotion({ from: p, to: this._rest(deckAt, k), yaw: deckYaw, t0: t })] })),
        ...left.map((c, i) => ({ ...c, id: `g${e.hand}:${i}`, seat: -4, motions: [...c.motions, gatherMotion({ from: this._poseOf(c, t), to: this._rest(deckAt, DECK_PLATES + i * 0.1), yaw: deckYaw, t0: t })] })),
      ];
      const gather = this.cards.length ? GATHER_S : 0;
      this.pushes = [];
      this.lastBets.clear();
      this.busyUntil = t;
      this.handNo = e.hand;
      // The relay's `hand` event carries the table seed, so every client in the room draws the same throws.
      if (Number.isInteger(e.seed)) this.tableSeed = e.seed >>> 0;
      this.board = 0;
      this.dealer = e.button;
      const n = e.seats.length, btn = e.seats.indexOf(e.button);
      const from = this.places.seats[e.button].deal;
      this.riffle = { t0: t + gather, at: deckAt, yaw: deckYaw };
      const dealAt = t + gather + RIFFLE_S;
      this.deck = { at: deckAt, yaw: deckYaw, from: t + gather, upTo: dealAt };
      let order = 0;
      for (let r = 0; r < 2; r++) for (let k = 1; k <= n; k++) {
        const seat = e.seats[(btn + k) % n];
        const place = this.places.seats[seat];
        const mine = seat === this.playerSeat;
        const m = dealMotion({ from, to: this._rest(place.holes[r], r), yaw: place.yaw, roll: Math.PI, t0: dealAt + DEAL_STAGGER * order++, seed: hashSeed(this.tableSeed, this.handNo, seat, r) });
        const motions = /** @type {any[]} */ ([m]);
        if (mine) motions.push(flipMotion({ pos: m.rest, yaw: m.at(Infinity).yaw, fromRoll: Math.PI, t0: m.t1 + TURN_DELAY, pivot: 'middle' }));
        this.cards.push({ id: `h${this.handNo}:${seat}:${r}`, card: mine ? holeOf(seat, r) : -1, seat, motions });
        this.busyUntil = Math.max(this.busyUntil, motions[motions.length - 1].t1);
      }
      return;
    }
    // The call that closes a street arrives in the same drain as the `street` event, so its bet is recorded from
    // the `act` event as well as from the view.
    if (e.t === 'act' && e.paid > 0) this.lastBets.set(e.seat, (this.lastBets.get(e.seat) ?? 0) + e.paid);
    if (e.t === 'street') {
      this._pushBets(t);
      // An all-in run-out delivers several streets in one drain, so each street starts after `busyUntil`.
      const t0 = Math.max(t, this.busyUntil);
      const from = this.places.seats[this.dealer].deal;
      let order = 0;
      const burn = dealMotion({ from, to: this._rest(this.places.burn, this.cards.filter((c) => c.seat === -2).length), yaw: this.places.boardYaw, roll: Math.PI, t0, seed: hashSeed(this.tableSeed, this.handNo, 90 + this.board) });
      this.cards.push({ id: `b${this.handNo}:${this.board}`, card: -1, seat: -2, motions: [burn] });
      order++;
      for (let i = this.board; i < e.board.length; i++) {
        // Each card lands a width short so the edge flip lays it on its slot, and alternate slots sit one layer
        // higher so neighbors never share a plane.
        const m = dealMotion({ from, to: flipShift(this._rest(this.places.board[i], i & 1), this.places.boardYaw), yaw: this.places.boardYaw, roll: Math.PI, t0: t0 + DEAL_STAGGER * order++, seed: hashSeed(this.tableSeed, this.handNo, 100 + i) });
        const flip = flipMotion({ pos: m.rest, yaw: m.at(Infinity).yaw, fromRoll: Math.PI, t0: m.t1 + TURN_DELAY, acrossYaw: this.places.boardYaw });
        this.cards.push({ id: `c${this.handNo}:${i}`, card: e.board[i], seat: -1, motions: [m, flip] });
        this.busyUntil = Math.max(this.busyUntil, flip.t1);
      }
      this.board = e.board.length;
      return;
    }
    if (e.t === 'act' && e.type === 'fold') {
      let layer = this.cards.filter((c) => c.seat === -3).length;
      for (const c of this.cards.filter((x) => x.seat === e.seat)) {
        const at = this._poseOf(c, t);
        c.motions.push(dealMotion({ from: at.pos, to: this._rest(this.places.muck, layer++), yaw: this.places.boardYaw, roll: Math.PI, t0: t, seed: hashSeed(this.tableSeed, this.handNo, 200 + layer), fromYaw: at.yaw, fromRoll: at.roll }));
        c.seat = -3;
      }
      return;
    }
    if (e.t === 'showdown') {
      this._pushBets(t);
      const t0 = Math.max(t, this.busyUntil);
      if (e.result.shown) {
        let order = 0;
        e.seats.forEach((seat, k) => {
          if (!e.holes[k]) return;
          for (const c of this.cards.filter((x) => x.seat === seat)) {
            const at = this._restOf(c);
            if (Math.cos(at.roll) > 0) continue;
            c.card = e.holes[k][Number(c.id.split(':')[2])];
            const flip = flipMotion({ pos: at.pos, yaw: at.yaw, fromRoll: at.roll, t0: t0 + DEAL_STAGGER * order++, pivot: 'middle' });
            c.motions.push(flip);
            this.busyUntil = Math.max(this.busyUntil, flip.t1);
          }
        });
      }
      const pot = e.result.pots.reduce((a, p) => a + p.amount, 0);
      const winners = e.result.payouts.map((p, k) => (p > 0 ? e.seats[k] : -1)).filter((s) => s >= 0);
      const at = Math.max(t0, this.busyUntil, t + PUSH_S) + POT_BEAT;
      winners.forEach((w, n) => this.pushes.push({ amount: e.result.payouts[e.seats.indexOf(w)], from: this.places.pot, to: this.places.seats[w].stack, t0: at + n * PUSH_S * 0.5, yaw: this.places.seats[w].yaw, toSeat: w, potShare: pot }));
    }
  }

  _pileShown(t) { return !!this.deck && t >= this.deck.from && !(t >= this.riffle?.t0 && t < this.deck.upTo); }
  _deckPile(t) {
    const thrown = this.cards.filter((c) => c.seat !== -4 && t > c.motions[0].t0).length;
    const n = Math.max(1, Math.ceil((DECK_PLATES * (DECK_CARDS - thrown)) / DECK_CARDS));
    return Array.from({ length: n }, (_, k) => ({ card: -1, pos: this._rest(this.deck.at, k), yaw: this.deck.yaw, roll: Math.PI, id: `d${this.handNo}:${k}`, seat: -5, settled: true }));
  }

  settledAt() {
    return this.pushes.reduce((a, p) => Math.max(a, p.t0 + PUSH_S), this.busyUntil);
  }

  _pushBets(t) {
    for (const [seat, amount] of this.lastBets) if (amount > 0) this.pushes.push({ amount, from: this.places.seats[seat].bet, to: this.places.pot, t0: t, yaw: this.places.seats[seat].yaw });
    this.lastBets.clear();
  }

  /**
   * @param {number} t
   * @param {any} view
   * @param {{seat: number, amount: number}|null} [carried]
   */
  poses(t, view, carried = null) {
    const cards = [];
    for (const c of this.cards) {
      if (c.seat === -4 && t >= c.motions[c.motions.length - 1].t1) continue;
      const p = this._poseOf(c, t);
      if (p.held) continue;
      cards.push({ card: c.card, pos: p.pos, yaw: p.yaw, roll: p.roll, id: c.id, seat: c.seat, settled: t >= c.motions[c.motions.length - 1].t1 });
    }
    if (this.riffle) cards.push(...riffleAt(t, this.riffle.t0, this.riffle.at, this.riffle.yaw));
    if (this._pileShown(t)) cards.push(...this._deckPile(t));
    const chips = [];
    const live = this.pushes.filter((p) => t < p.t0 + PUSH_S);
    for (const p of live) if (t >= p.t0 || !p.potShare) chips.push(...chipDiscs(p.amount, pushAt(p.from, p.to, p.t0, Math.max(t, p.t0), p.potShare ? SCOOP_LIFT : 0), p.yaw, p.toSeat != null));
    if (view) {
      const hand = view.hand;
      let pot = 0;
      view.seats.forEach((s, i) => {
        const place = this.places.seats[i];
        if (!place || s.gone) return;
        const k = view.handSeats.indexOf(i);
        const h = hand && k >= 0 ? hand.seats[k] : null;
        const coming = live.filter((p) => p.toSeat === i && t < p.t0 + PUSH_S).reduce((a, p) => a + p.amount, 0);
        const stack = (h ? h.stack : s.stack) - coming - (carried?.seat === i ? carried.amount : 0), bet = h ? h.bet : 0;
        if (h) { this.lastBets.set(i, bet); pot += h.total - h.bet; }
        chips.push(...chipDiscs(stack, place.stack, place.yaw, true));
        if (bet > 0) chips.push(...chipDiscs(bet, place.bet, place.yaw));
      });
      const sliding = live.filter((p) => p.to === this.places.pot).reduce((a, p) => a + p.amount, 0);
      const shares = live.filter((p) => p.potShare);
      const waiting = shares.length ? shares.filter((p) => t < p.t0).reduce((a, p) => a + p.amount, 0) - sliding : pot - sliding;
      if (waiting > 0) chips.push(...chipDiscs(waiting, this.places.pot, this.places.boardYaw));
    }
    return { cards, chips };
  }
}
