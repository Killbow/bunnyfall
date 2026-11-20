// BUNNYFALL FARM EXPANSION (2026-11-20, a player: "the ledger is annoying to click through multiple times just to cycle through the
// various things it can show you, I think it would be better if it just popped up a ui that gave a sort of overview of the farm"):
// THE ESTATE LEDGER, OPENED AT ONCE - one read-only page over the world, styled as the farming HUD is (classic or enhanced). It
// shows a model the farm's acts build (scenes/farm/farmsteadActs.js overview) and has NO controls but a close: the farm is still
// worked by clicking things on it, never from this page. Esc, the Close button or a click on the ground closes it.
import { t } from '../systems/textManager.js';

/**
 * @param {HTMLElement} host the farming HUD's root
 * @returns {{ readonly open: boolean, show: (model: any) => void, update: (model: any) => void, hide: () => void, dispose: () => void }}
 */
export function createFarmLedger(host) {
  const box = document.createElement('section');
  box.className = 'wplaque on farm-ledger'; box.hidden = true; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', t('farm.ledger.title', 'The estate ledger'));
  box.innerHTML = `<style>
.farming-hud .farm-ledger{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(620px,94vw);min-width:0;max-width:94vw;max-height:80vh;overflow:auto;pointer-events:auto;box-sizing:border-box;padding:14px 18px;text-align:left;font-size:14px;z-index:5}
.farm-ledger h2{margin:0 0 6px;font-size:20px;font-weight:normal}.farm-ledger h3{margin:12px 0 4px;font-size:15px;font-weight:normal;opacity:.85;border-bottom:1px solid currentColor}
.farm-ledger dl{margin:0;display:grid;grid-template-columns:minmax(90px,max-content) 1fr;gap:3px 12px}.farm-ledger dt{opacity:.8}.farm-ledger dd{margin:0}
.farm-ledger .note{font-size:12px;opacity:.75;margin:10px 0 0}.farm-ledger .close{float:right;pointer-events:auto;cursor:pointer;font:inherit;color:inherit;border:2px solid;padding:4px 10px;background:transparent}
.farm-ledger .ready{font-weight:bold}
@media(max-width:600px){.farming-hud .farm-ledger{font-size:13px;padding:10px 12px}.farm-ledger dl{grid-template-columns:1fr}}
</style>`;
  const body = document.createElement('div');
  box.append(body);
  for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'wheel']) box.addEventListener(type, (e) => e.stopPropagation());
  host.append(box);
  let signature = '';
  function render(model) {
    const sig = JSON.stringify(model);
    if (sig === signature) return;
    signature = sig;
    body.replaceChildren();
    const close = document.createElement('button'); close.type = 'button'; close.className = 'close'; close.textContent = t('farm.ledger.close', 'Close (Esc)');
    close.addEventListener('click', () => { box.hidden = true; });
    const h = document.createElement('h2'); h.textContent = model.title; body.append(close, h);
    for (const section of model.sections) {
      const s = document.createElement('h3'); s.textContent = section.title; body.append(s);
      const dl = document.createElement('dl');
      for (const row of section.rows) {
        const dt = document.createElement('dt'), dd = document.createElement('dd');
        dt.textContent = row.label; dd.textContent = row.text; if (row.ready) dd.className = 'ready';
        dl.append(dt, dd);
      }
      body.append(dl);
    }
    if (model.note) { const n = document.createElement('p'); n.className = 'note'; n.textContent = model.note; body.append(n); }
  }
  return {
    get open() { return !box.hidden; },
    show(model) { render(model); box.hidden = false; },
    /** Refreshed while open (the garden may change under it). */
    update(model) { if (!box.hidden) render(model); },
    hide() { box.hidden = true; },
    dispose() { box.remove(); },
  };
}
