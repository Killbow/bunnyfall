// BUNNYFALL: a tool belt over the world, never a modal menu. FARM EXPANSION PHASE 1: the belt is the hands alone - the
// seed is taken from the seed shelf, and orders and improvements live on the farm (docs/FARM-EXPANSION.md section 3).
import { t } from './textManager.js';
import { isEnhanced } from './uiSkin.js';
import { injectEnhancedStyle, injectEnhancedFonts } from './enhancedStyle.js';
import { PIXEL_STACK } from './pixelifyFive.js';

export const farmToolName = (tool) => ({
  hoe: t('farm.mode.hoe', 'Hoe'), plant: t('farm.mode.seeds', 'Seeds'),
  water: t('farm.mode.water', 'Water'), harvest: t('farm.mode.harvest', 'Harvest'),
})[tool];
export const farmCropName = (crop) => ({
  grain: t('farm.mode.grain', 'Grain'), mushroom: t('farm.mode.mushroom', 'Mushrooms'), herbs: t('farm.mode.herbs', 'Herbs'),
  corn: t('farm.mode.corn', 'Corn'), cabbage: t('farm.mode.cabbage', 'Cabbage'), tomato: t('farm.mode.tomato', 'Tomatoes'),
  sunflower: t('farm.mode.sunflower', 'Sunflowers'), berries: t('farm.mode.berries', 'Berries'), root: t('farm.mode.root', 'Desert root'),
  flax: t('farm.mode.flax', 'Flax'), gourd: t('farm.mode.gourd', 'Gourds'), grapes: t('farm.mode.grapes', 'Grapes'),
})[crop];
export function createFarmingHud({ tool, leave, careful }) {
  injectEnhancedStyle(); injectEnhancedFonts();
  const root = document.createElement('section'); root.className = 'farming-hud';
  root.innerHTML = `<style>
.farming-hud{position:fixed;inset:0;z-index:12;pointer-events:none;font-family:var(--dfo-text-font,${PIXEL_STACK});font-size:16px}
.farming-hud [hidden]{display:none!important}.farming-hud .wplaque{z-index:auto}
.farming-hud .farm-info{position:absolute;left:24px;top:65px;transform:none;max-width:min(370px,60vw);box-sizing:border-box}
.farming-hud h2{font-size:21px;font-weight:normal;margin:0 0 5px}.farming-hud p{margin:4px 0}
.farming-hud .farm-belt{position:absolute;bottom:24px;top:auto;left:50%;transform:translateX(-50%);display:flex;flex-wrap:wrap;justify-content:center;gap:7px;width:max-content;min-width:0;max-width:95vw;box-sizing:border-box;padding:9px}
.farming-hud button{pointer-events:auto;cursor:pointer;font:inherit;color:inherit;border:2px solid;padding:10px 14px;min-height:42px;border-radius:0}
.farming-hud .farm-message{font-size:13px}.farming-hud .farm-target{position:absolute;min-width:0;transform:translate(-50%,-110%);text-align:center;max-width:280px;padding:7px 10px;font-size:14px;box-sizing:border-box}
.farming-hud .farm-seed{align-self:center;padding:0 8px;font-size:14px}
.farming-hud .farm-help{position:absolute;left:auto;right:20px;top:70px;transform:none;font-size:12px;text-align:right;min-width:0;max-width:40vw}.farming-hud .farm-help button{margin-top:6px}
.farming-hud[data-skin=classic] .wplaque{font-family:${PIXEL_STACK};color:#f3ef2c;background:#28251c;border-color:#92866c #443d30 #302c24 #766d59;text-shadow:1px 1px #5d4d0c}
.farming-hud[data-skin=classic] button{background:#3b3528;border-color:#a3997c #4b4434 #29251c #867b61}.farming-hud[data-skin=classic] button.on{background:#5b4d2b;border-color:#f3ef2c}
:root[data-plus-dress=grimoire] .farming-hud[data-skin=enhanced]{font-family:'DFO Alagard',Georgia,serif}
@media(max-width:600px){.farming-hud .farm-info{left:12px;top:55px;max-width:65vw;min-width:0}.farming-hud h2{font-size:18px}.farming-hud .farm-message{font-size:12px}.farming-hud .farm-help{top:auto;bottom:165px;right:12px;max-width:65vw}.farming-hud .farm-belt{bottom:18px;gap:4px;width:95vw}.farming-hud button{padding:9px 10px;font-size:13px}}
</style>`;
  const head = document.createElement('header'); head.className = 'wplaque on farm-info';
  const title = document.createElement('h2'); title.textContent = t('farm.mode.title', 'Farming Mode');
  const name = document.createElement('p'), message = document.createElement('p'); message.className = 'farm-message'; message.setAttribute('role', 'status');
  head.append(title, name, message); root.append(head);
  const belt = document.createElement('footer'), buttons = []; belt.className = 'wplaque on farm-belt';
  ['hoe', 'plant', 'water', 'harvest'].forEach((key, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'farm-tool'; b.textContent = `${i + 1} · ${farmToolName(key)}`;
    b.addEventListener('click', () => tool(key)); belt.append(b); buttons.push(b);
  });
  const seeds = document.createElement('span'); seeds.className = 'farm-seed'; belt.append(seeds);
  // PHASE 2: Careful work - the field games (F)
  const care = document.createElement('button'); care.type = 'button'; care.className = 'farm-tool farm-careful'; care.textContent = t('farm.game.careful', 'F · Careful work'); care.addEventListener('click', () => careful?.());
  belt.append(care); root.append(belt);
  const help = document.createElement('aside'); help.className = 'wplaque on farm-help';
  const hint = document.createElement('p'); hint.textContent = t('farm.mode.controls2', 'WASD · Walk   Q/E · Orbit   Wheel · Zoom   F · Careful work');
  const exit = document.createElement('button'); exit.type = 'button'; exit.className = 'farm-tool'; exit.textContent = t('farm.mode.leave', 'Esc · Leave farming mode'); exit.addEventListener('click', leave);
  help.append(hint, exit); root.append(help);
  const target = document.createElement('div'); target.className = 'wplaque on farm-target'; target.hidden = true; root.append(target);
  for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click']) root.addEventListener(type, (e) => e.stopPropagation());
  document.body.append(root);
  return {
    update(farm, selected, crop, status, blocked, carefulOn = false) {
      care.setAttribute('aria-pressed', String(carefulOn)); care.classList.toggle('on', carefulOn);
      root.hidden = blocked; name.textContent = farm.name; message.textContent = status;
      root.dataset.skin = isEnhanced() ? 'enhanced' : 'classic';
      buttons.forEach((b, i) => { const on = ['hoe', 'plant', 'water', 'harvest'][i] === selected; b.setAttribute('aria-pressed', String(on)); b.classList.toggle('on', on); });
      seeds.textContent = t('farm.mode.seedHeld', 'Seed: {crop}', { crop: farmCropName(crop) ?? crop });   // a strain comes already named
    },
    target(text, at) { target.hidden = !at?.front; if (!at?.front) return; target.textContent = text; target.style.left = `${at.x}px`; target.style.top = `${at.y}px`; },
    dispose() { root.remove(); },
  };
}
