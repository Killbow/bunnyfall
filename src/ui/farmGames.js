// BUNNYFALL FARM EXPANSION, PHASE 2 (docs/FARM-EXPANSION.md section 4.3): A FIELD GAME DRAWN WHERE IT IS PLAYED - a small
// gauge pinned over the bed (or the scarecrow) it is played on, never a window: the sowing hand swinging past its mark,
// the scythe's wind-up with its bright band, the weeds and the birds popping up to be clicked. The game itself is
// net/farm/farmGameLaw.js; this draws its state and turns the pointer and the keys into its input. Styled by the farming
// HUD's skin (classic or enhanced), as the tool belt is.
import { t } from '../systems/textManager.js';
import { SOW, SCYTHE, WEED, BIRDS, MILK } from '../net/farm/farmGameLaw.js';

const HINT = {
  sow: () => t('farm.game.sowHint', 'Space or click as the hand passes the mark'),
  scythe: () => t('farm.game.scytheHint', 'Hold Space or the mouse; let go in the bright band'),
  weed: () => t('farm.game.weedHint', 'Click the weeds. Leave the sprouts!'),
  birds: () => t('farm.game.birdsHint', 'Click the birds before they peck'),
  milk: () => t('farm.game.milkHint', 'A, D, A, D - in her rhythm, not too quick'),
};
const TITLE = {
  sow: () => t('farm.game.sow', 'Sowing'), scythe: () => t('farm.game.scythe', 'Scything'),
  weed: () => t('farm.game.weed', 'Weeding'), birds: () => t('farm.game.birds', 'Chasing the birds'), milk: () => t('farm.game.milk', 'Milking'),
};

/**
 * @param {HTMLElement} host the farming HUD's root
 * @param {ReturnType<typeof import('../net/farm/farmGameLaw.js').createFarmGame>} game
 */
export function createFarmGameWidget(host, game) {
  const s = game.state, kind = s.kind;
  const box = document.createElement('div'); box.className = 'wplaque on farm-game'; box.dataset.kind = kind;
  box.innerHTML = `<style>
.farm-game{position:absolute;transform:translate(-50%,-100%);min-width:0;width:230px;padding:8px 10px;box-sizing:border-box;text-align:center;pointer-events:auto;font-size:13px}
.farm-game h3{margin:0 0 4px;font-size:15px;font-weight:normal}.farm-game p{margin:4px 0 0;font-size:12px}
.farm-game .bar{position:relative;height:16px;border:2px solid currentColor;margin:6px 0}
.farm-game .mark{position:absolute;top:-4px;bottom:-4px;width:4px;left:calc(50% - 2px);background:currentColor;opacity:.8}
.farm-game .band{position:absolute;top:0;bottom:0;background:rgba(255,236,140,.55)}
.farm-game .hand,.farm-game .fill{position:absolute;top:1px;bottom:1px;background:#e8c060}
.farm-game .hand{width:10px;border-radius:5px}
.farm-game .cells{display:grid;gap:4px;margin:6px auto}
.farm-game .cell{height:34px;border:2px solid currentColor;background:rgba(0,0,0,.25);cursor:pointer;font:inherit;color:inherit;padding:0;font-size:20px;line-height:1}
.farm-game .cell.weed{background:#3f6b2a}.farm-game .cell.sprout{background:#a8d77a}.farm-game .cell.bird{background:#3a3a46}
@media(max-width:600px){.farm-game{width:200px}}
</style>`;
  const title = document.createElement('h3'); title.textContent = TITLE[kind]();
  const tally = document.createElement('p');
  const hint = document.createElement('p'); hint.textContent = HINT[kind]();
  box.append(title);
  /** @type {HTMLElement|null} */ let moving = null;
  /** @type {HTMLButtonElement[]} */ const cells = [];
  if (kind === 'milk') {
    const keys = document.createElement('div'); keys.className = 'cells'; keys.style.gridTemplateColumns = 'repeat(2, 1fr)';
    for (const k of ['a', 'd']) { const b = document.createElement('button'); b.type = 'button'; b.className = 'cell'; b.textContent = k.toUpperCase(); b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); game.input({ key: k }); }); keys.append(b); cells.push(b); }
    box.append(keys);
  } else if (kind === 'sow' || kind === 'scythe') {
    const bar = document.createElement('div'); bar.className = 'bar';
    if (kind === 'sow') { const mark = document.createElement('i'); mark.className = 'mark'; moving = document.createElement('i'); moving.className = 'hand'; bar.append(mark, moving); }
    else { const band = document.createElement('i'); band.className = 'band'; band.style.left = `${SCYTHE.band[0] * 100}%`; band.style.width = `${(SCYTHE.band[1] - SCYTHE.band[0]) * 100}%`; moving = document.createElement('i'); moving.className = 'fill'; moving.style.left = '0'; bar.append(band, moving); }
    box.append(bar);
  } else {
    const n = (kind === 'birds' ? BIRDS : WEED).cells, grid = document.createElement('div'); grid.className = 'cells';
    grid.style.gridTemplateColumns = `repeat(3, 1fr)`;
    for (let i = 0; i < n; i++) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'cell'; b.setAttribute('aria-label', String(i + 1));
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); game.input({ cell: i }); });
      grid.append(b); cells.push(b);
    }
    box.append(grid);
  }
  box.append(tally, hint);
  for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click']) box.addEventListener(type, (e) => e.stopPropagation());
  host.append(box);
  return {
    /** Redrawn from the game's state, pinned at `at` (screen px) when it is in front. */
    update(at) {
      box.hidden = !at?.front;
      if (at?.front) { box.style.left = `${at.x}px`; box.style.top = `${at.y}px`; }
      if (kind === 'milk') { cells.forEach((c, i) => c.classList.toggle('weed', s.lastKey === (i ? 'a' : 'd'))); tally.textContent = t('farm.game.strokes', 'Strokes: {n} of {all} · good: {hits}', { n: Math.max(0, s.swings - 1), all: MILK.strokes, hits: s.hits }); }
      else if (kind === 'sow') { moving.style.left = `calc(${s.hand * 100}% - 5px)`; tally.textContent = t('farm.game.throws', 'Throws: {n} of {all}', { n: s.marks.length, all: SOW.throws }); }
      else if (kind === 'scythe') { moving.style.width = `${Math.min(1, s.power) * 100}%`; tally.textContent = t('farm.game.swings', 'Swings: {n} of {all} · clean: {hits}', { n: s.swings, all: SCYTHE.swings, hits: s.hits }); }
      else {
        cells.forEach((c, i) => { const it = s.items.find((x) => x.cell === i); c.className = `cell${it ? (kind === 'birds' ? ' bird' : it.decoy ? ' sprout' : ' weed') : ''}`; c.textContent = it ? (kind === 'birds' ? '\u{1F426}' : it.decoy ? '\u{1F331}' : '☘') : ''; });
        tally.textContent = t('farm.game.caught', 'Got: {n}', { n: s.hits });
      }
    },
    dispose() { box.remove(); },
  };
}
