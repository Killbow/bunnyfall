// @ts-check
import { registerOverlay } from './enhancedOverlays.js';
import { overlayAction } from './input.js';
import { injectEnhancedStyle, injectEnhancedFonts } from './enhancedStyle.js';
import { injectBrokerSkinStyle } from './brokerWindow.js';
import { t } from './textManager.js';
import { SKILL_NAMES, SKILL_COUNT } from '../characters/skills.js';
import { STAT_KEYS_ORDER } from '../characters/statMods.js';
import { loadCareers } from '../characters/chargenSession.js';
import { spellPointMultiplier } from '../characters/chargen.js';
import { necromancerCareer, NECROMANCER_NAME } from '../systems/necromancy/necroCareer.js';
import {
  HP_MIN,
  HP_MAX,
  DIFFICULTY_MIN,
  DIFFICULTY_MAX,
  difficultyPoints,
  advancementMultiplier,
  daggerFraction,
} from '../characters/customClass.js';
import {
  ADVANTAGE_KEYS,
  DISADVANTAGE_KEYS,
  MAX_ITEMS,
  secondaryListFor,
  labelFor,
  advDisAdjustment,
  cannotAdd,
  totalAdjust,
  classSpecials,
} from '../characters/specialAdvantages.js';
import {
  readPsijicSeals,
  spendPsijicSealNow,
  pendingRespecRidFor,
  rememberPendingRespecRid,
  clearPendingRespecRid,
} from '../net/psijicSealsClient.js';
import {
  RESPEC_CONFIRM_WORD,
  REVERT_CONFIRM_WORD,
  attributeBudgetOf,
  initialRespecStats,
  careerSkillTiers,
  defaultSkillSlotPlan,
  swapSkillSlotInPlan,
  buildRespecCustomCareer,
  validateRespecBuild,
  previewCharacterRespec,
  applyCharacterRespec,
  hasParkedRespec,
  parkedRespecSummary,
  revertCharacterRespec,
} from '../characters/characterRespec.js';

const STAT_LABELS = Object.freeze({
  strength: 'Strength',
  intelligence: 'Intelligence',
  willpower: 'Willpower',
  agility: 'Agility',
  endurance: 'Endurance',
  personality: 'Personality',
  speed: 'Speed',
  luck: 'Luck',
});

const RESPEC_CSS = `
#crespec.broker-shell { z-index: 39; }
#crespec .broker-win { width: min(980px, 95vw); max-height: 90vh; display: flex; flex-direction: column; overflow: hidden; }
#crespec .broker-head { flex: 0 0 auto; }
#crespec .cr-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden; padding: 14px 20px 18px; display: flex; flex-direction: column; gap: 12px; font-size: 14px; line-height: 1.45; }
#crespec .cr-foot { flex: 0 0 auto; position: relative; z-index: 1; display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 20px 14px; flex-wrap: wrap; }
#crespec .cr-steps { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 4px; font-size: 12px; letter-spacing: 0.05em; text-transform: uppercase; }
#crespec .cr-step { padding: 3px 8px; border: 1px solid rgba(212, 180, 108, 0.35); opacity: 0.72; color: #e8d8b5; }
#crespec .cr-step.active { opacity: 1; border-color: #f3cf86; background: rgba(224, 190, 114, 0.22); color: #fff4d2; font-weight: 600; }
#crespec .cr-cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(320px, 100%), 1fr)); gap: 14px; align-items: start; }
#crespec .cr-card { padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; }
#crespec .cr-card h3 { margin: 0; font-size: 15px; letter-spacing: 0.04em; }
#crespec .cr-list { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 6px; }
#crespec .cr-banner { padding: 9px 12px; font-size: 13.5px; }
#crespec .cr-confirm-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
#crespec input[type="text"], #crespec select { padding: 5px 9px; font-size: 13.5px; font-family: inherit; max-width: 100%; }
#crespec .cr-btn { display: inline-flex !important; align-items: center; justify-content: center; width: auto !important; min-width: 0; padding: 6px 13px; font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
#crespec .cr-btn:disabled, #crespec .cr-btn.is-disabled, #crespec .cr-btn[aria-disabled="true"] { opacity: 0.45; cursor: not-allowed; }
#crespec .cr-tabs { display: flex; gap: 8px; flex-wrap: wrap; }
#crespec .cr-class-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(128px, 100%), 1fr)); gap: 6px; }
#crespec .cr-class-btn { text-align: left; padding: 6px 10px; cursor: pointer; font-family: inherit; font-size: 13px; }
#crespec .cr-stat-row { display: grid; grid-template-columns: minmax(126px, 1fr) auto 40px auto; align-items: center; gap: 8px; padding: 4px 0; }
#crespec .cr-stat-val { text-align: center; font-weight: 700; font-size: 14px; }
#crespec .cr-stat-btns { display: flex; gap: 4px; }
#crespec .cr-btn.cr-mini { padding: 3px 8px; min-width: 30px; font-size: 12px; }
#crespec .cr-tier-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(220px, 100%), 1fr)); gap: 6px; }
#crespec .cr-slot { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 6px 10px; cursor: pointer; font-family: inherit; font-size: 13px; text-align: left; }
#crespec .cr-note { font-size: 12.5px; line-height: 1.4; }
#crespec .cr-chip { font-size: 12px; white-space: nowrap; }
#crespec .cr-master { display: inline-block; margin-left: 5px; padding: 1px 5px; font-size: 11px; font-weight: 600; }
#crespec .cr-gauge { height: 10px; position: relative; overflow: hidden; margin: 4px 0; }
#crespec .cr-gauge-fill { height: 100%; background: linear-gradient(90deg, #3e8a4f, #c4962c, #9e261b); }
#crespec .cr-kv { display: grid; grid-template-columns: minmax(120px, 152px) minmax(0, 1fr); gap: 5px 12px; font-size: 13px; }
#crespec .cr-kv b { font-weight: 600; }
#crespec .cr-taglist { display: flex; flex-wrap: wrap; gap: 6px; }
#crespec .cr-tag { display: inline-flex; align-items: center; gap: 6px; padding: 3px 8px; font-size: 12px; }

/* Dark Stone Dress: Enhanced Plus (Slate, Stone, Iron, Ember, Forest, Night), Classic UI, and Original GrimoireUI */
:root:not([data-plus-dress="grimoire"]) #crespec .cr-body { color: #efe8d6; }
:root:not([data-plus-dress="grimoire"]) #crespec .cr-foot { border-top: 2px solid #050608; background: rgba(0, 0, 0, 0.34); box-shadow: inset 0 1px 0 rgba(194, 183, 154, 0.22); }
:root:not([data-plus-dress="grimoire"]) #crespec .cr-card { background: rgba(8, 10, 14, 0.56); border: 2px solid; border-color: #7a7260 #25221b #1b1914 #5a5446; color: #efe8d6; box-shadow: 0 0 0 1px #050608; }
:root:not([data-plus-dress="grimoire"]) #crespec .cr-card h3 { color: #f3cf86; text-shadow: 1px 1px 0 #050608; }
:root:not([data-plus-dress="grimoire"]) #crespec .cr-list { color: #efe8d6; }
:root:not([data-plus-dress="grimoire"]) #crespec .cr-banner { background: rgba(12, 14, 18, 0.72); border: 1px solid rgba(243, 207, 134, 0.45); color: #f5ebd4; }
:root:not([data-plus-dress="grimoire"]) #crespec .cr-banner.bad { background: rgba(112, 22, 18, 0.68); border-color: #e67a6e; color: #ffe8e4; font-weight: 600; }
:root:not([data-plus-dress="grimoire"]) #crespec .cr-banner.good { background: rgba(24, 78, 40, 0.68); border-color: #78db92; color: #eaffef; font-weight: 600; }
:root:not([data-plus-dress="grimoire"]) #crespec input[type="text"],
:root:not([data-plus-dress="grimoire"]) #crespec select { background: rgba(6, 8, 12, 0.82); color: #f5efe0; border: 2px solid; border-color: #25221b #7a7260 #9a9079 #3a352a; border-radius: 0; }
:root:not([data-plus-dress="grimoire"]) #crespec select option { background: #14171e; color: #f5efe0; }
:root:not([data-plus-dress="grimoire"]) #crespec .cr-btn { border: 2px solid; border-color: #9a9079 #3a352a #25221b #7a7260; border-radius: 0; background: linear-gradient(180deg, #2a2f3a 0%, #1b1e26 100%); color: #efe8d6; text-shadow: 1px 1px 0 #050608; box-shadow: 0 0 0 1px #050608; }
:root:not([data-plus-dress="grimoire"]) #crespec .cr-btn:hover:not(:disabled):not(.is-disabled) { border-color: #f3cf86 #7a5424 #5c3f1a #c08a3e; background: linear-gradient(180deg, #363c4a 0%, #242934 100%); color: #fff4d2; }
:root:not([data-plus-dress="grimoire"]) #crespec .cr-btn.primary,
:root:not([data-plus-dress="grimoire"]) #crespec .cr-btn.cr-tab.on { border-color: #f3cf86 #7a5424 #3d2a12 #c08a3e; background: linear-gradient(180deg, #6b491f 0%, #442d11 100%); color: #fff6dc; }
:root:not([data-plus-dress="grimoire"]) #crespec .cr-btn.primary:hover:not(:disabled):not(.is-disabled) { background: linear-gradient(180deg, #7e5725 0%, #543815 100%); }
:root:not([data-plus-dress="grimoire"]) #crespec .cr-class-btn { border: 1px solid rgba(154, 144, 121, 0.45); background: rgba(10, 12, 16, 0.68); color: #efe8d6; border-radius: 0; }
:root:not([data-plus-dress="grimoire"]) #crespec .cr-class-btn:hover { background: rgba(192, 138, 62, 0.18); border-color: #f3cf86; color: #fff4d2; }
:root:not([data-plus-dress="grimoire"]) #crespec .cr-class-btn.on { border-color: #f3cf86; background: rgba(192, 138, 62, 0.34); color: #fff7df; font-weight: 600; }
:root:not([data-plus-dress="grimoire"]) #crespec .cr-stat-row { border-bottom: 1px solid rgba(154, 144, 121, 0.22); }
:root:not([data-plus-dress="grimoire"]) #crespec .cr-stat-val { color: #fff4d2; }
:root:not([data-plus-dress="grimoire"]) #crespec .cr-slot { border: 1px solid rgba(154, 144, 121, 0.45); background: rgba(10, 12, 16, 0.68); color: #efe8d6; border-radius: 0; }
:root:not([data-plus-dress="grimoire"]) #crespec .cr-slot:hover { border-color: #f3cf86; background: rgba(192, 138, 62, 0.16); }
:root:not([data-plus-dress="grimoire"]) #crespec .cr-slot.picked { border-color: #f3cf86; background: rgba(192, 138, 62, 0.34); box-shadow: 0 0 0 1px rgba(243, 207, 134, 0.45); color: #fff7df; font-weight: 600; }
:root:not([data-plus-dress="grimoire"]) #crespec .cr-note,
:root:not([data-plus-dress="grimoire"]) #crespec .cr-chip { color: #d8cfae; }
:root:not([data-plus-dress="grimoire"]) #crespec .cr-master { background: #8c261d; border: 1px solid #e68a7e; color: #fff4e8; }
:root:not([data-plus-dress="grimoire"]) #crespec .cr-gauge { background: rgba(0, 0, 0, 0.55); border: 1px solid rgba(154, 144, 121, 0.45); }
:root:not([data-plus-dress="grimoire"]) #crespec .cr-kv { color: #efe8d6; }
:root:not([data-plus-dress="grimoire"]) #crespec .cr-kv b { color: #f3cf86; }
:root:not([data-plus-dress="grimoire"]) #crespec .cr-tag { background: rgba(10, 12, 16, 0.72); border: 1px solid rgba(154, 144, 121, 0.45); color: #efe8d6; }

/* DFO Bunnyfall Grimoire Dress (Cream Page and Tan Scroll) */
:root[data-plus-dress="grimoire"] #crespec .cr-body { color: #241608; }
:root[data-plus-dress="grimoire"] #crespec .cr-foot { border-top: 1px solid rgba(84, 52, 22, 0.42); background: rgba(110, 76, 36, 0.14); }
:root[data-plus-dress="grimoire"] #crespec .cr-card { background: rgba(120, 84, 36, 0.11); border: 1px solid rgba(88, 56, 24, 0.4); border-radius: 3px; color: #241608; }
:root[data-plus-dress="grimoire"] #crespec .cr-card h3 { color: #5e140b; }
:root[data-plus-dress="grimoire"] #crespec .cr-list { color: #241608; }
:root[data-plus-dress="grimoire"] #crespec .cr-banner { border-radius: 3px; border: 1px solid rgba(104, 68, 28, 0.46); background: rgba(132, 92, 38, 0.15); color: #241608; }
:root[data-plus-dress="grimoire"] #crespec .cr-banner.bad { border-color: rgba(148, 30, 22, 0.72); background: rgba(164, 38, 28, 0.16); color: #4e0c07; font-weight: 600; }
:root[data-plus-dress="grimoire"] #crespec .cr-banner.good { border-color: rgba(38, 102, 50, 0.68); background: rgba(46, 118, 60, 0.17); color: #13381a; font-weight: 600; }
:root[data-plus-dress="grimoire"] #crespec input[type="text"],
:root[data-plus-dress="grimoire"] #crespec select { background: rgba(255, 250, 238, 0.92); color: #201306; border: 1px solid rgba(88, 56, 24, 0.6); border-radius: 3px; }
:root[data-plus-dress="grimoire"] #crespec .cr-btn { border-radius: 3px; border: 1px solid #6b4923; background: linear-gradient(180deg, #f3e4c3 0%, #dcc18e 100%); color: #281808; box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.55); }
:root[data-plus-dress="grimoire"] #crespec .cr-btn:hover:not(:disabled):not(.is-disabled) { border-color: #4d3112; background: linear-gradient(180deg, #fff1d4 0%, #e5cb98 100%); }
:root[data-plus-dress="grimoire"] #crespec .cr-btn.primary,
:root[data-plus-dress="grimoire"] #crespec .cr-btn.cr-tab.on { border-color: #6b1913; background: linear-gradient(180deg, #8f261d 0%, #681710 100%); color: #fff3db; box-shadow: inset 0 1px 0 rgba(255, 210, 180, 0.3); }
:root[data-plus-dress="grimoire"] #crespec .cr-btn.primary:hover:not(:disabled):not(.is-disabled) { background: linear-gradient(180deg, #a42d23 0%, #7a1c14 100%); }
:root[data-plus-dress="grimoire"] #crespec .cr-class-btn { border: 1px solid rgba(88, 56, 24, 0.45); background: rgba(255, 249, 235, 0.78); color: #241608; border-radius: 3px; }
:root[data-plus-dress="grimoire"] #crespec .cr-class-btn:hover { background: rgba(255, 252, 242, 0.96); border-color: #6e1d13; }
:root[data-plus-dress="grimoire"] #crespec .cr-class-btn.on { border-color: #6e1d13; background: #7b2017; color: #fff4dc; font-weight: 600; }
:root[data-plus-dress="grimoire"] #crespec .cr-stat-row { border-bottom: 1px solid rgba(88, 56, 24, 0.2); }
:root[data-plus-dress="grimoire"] #crespec .cr-stat-val { color: #201306; }
:root[data-plus-dress="grimoire"] #crespec .cr-slot { border-radius: 3px; border: 1px solid rgba(88, 56, 24, 0.45); background: rgba(255, 249, 235, 0.82); color: #201306; }
:root[data-plus-dress="grimoire"] #crespec .cr-slot:hover { border-color: #6e1d13; background: rgba(255, 252, 244, 0.96); }
:root[data-plus-dress="grimoire"] #crespec .cr-slot.picked { border-color: #7b2017; background: rgba(196, 134, 42, 0.3); box-shadow: 0 0 0 1px rgba(123, 32, 23, 0.5); font-weight: 600; }
:root[data-plus-dress="grimoire"] #crespec .cr-note,
:root[data-plus-dress="grimoire"] #crespec .cr-chip { color: #3d2610; }
:root[data-plus-dress="grimoire"] #crespec .cr-master { border-radius: 3px; background: #7b2017; color: #fff2d6; }
:root[data-plus-dress="grimoire"] #crespec .cr-gauge { border-radius: 5px; background: rgba(84, 58, 29, 0.22); border: 1px solid rgba(84, 58, 29, 0.4); }
:root[data-plus-dress="grimoire"] #crespec .cr-kv { color: #241608; }
:root[data-plus-dress="grimoire"] #crespec .cr-kv b { color: #54120a; }
:root[data-plus-dress="grimoire"] #crespec .cr-tag { border-radius: 3px; background: rgba(255, 249, 235, 0.84); border: 1px solid rgba(88, 56, 24, 0.42); color: #201306; }

@media (max-width: 640px) {
  #crespec .broker-win { width: 98vw; max-height: 94dvh; }
  #crespec .cr-body { padding: 10px 12px 14px; }
  #crespec .cr-foot { padding: 8px 12px 10px; }
  #crespec .cr-kv { grid-template-columns: 1fr; gap: 2px 0; }
  #crespec .cr-stat-row { grid-template-columns: minmax(96px, 1fr) auto 34px auto; gap: 5px; }
  #crespec .cr-chip { white-space: normal; }
}
@media (pointer: coarse) {
  #crespec .cr-btn, #crespec .cr-class-btn, #crespec .cr-slot, #crespec input[type="text"], #crespec select { min-height: 44px; }
  #crespec .cr-btn.cr-mini { min-width: 40px; padding: 6px 10px; }
}
`;

/** @param {string} tag @param {string|null} [cls] @param {string|null} [text] */
function el(tag, cls = null, text = null) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function makeRid() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `respec_${globalThis.crypto.randomUUID().replace(/-/g, '')}`;
  }
  return `respec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * @param {{ entity: any, mode?: 'respec' | 'revert', fetchBytes?: ((name: string) => Promise<Uint8Array>) | null,
 *   spellsByIndex?: (() => any) | any, saveSoon?: (() => void) | null, nowMinutes?: (() => number) | number,
 *   advanceMinutes?: ((n: number) => void) | null, onApplied?: ((res?: any) => void) | null, onClose?: (() => void) | null }} deps
 */
export function createCharacterRespecWindow(deps) {
  if (typeof document === 'undefined' || !deps?.entity) return null;
  injectEnhancedStyle();
  injectEnhancedFonts();
  injectBrokerSkinStyle();
  const st = document.getElementById('crespec-style') ?? Object.assign(document.createElement('style'), { id: 'crespec-style' });
  if (st.textContent !== RESPEC_CSS) st.textContent = RESPEC_CSS;
  if (!st.isConnected) document.head.append(st);

  const { entity } = deps;
  const allSkillIds = Array.from({ length: SKILL_COUNT }, (_, i) => i)
    .sort((a, b) => (SKILL_NAMES[a] ?? '').localeCompare(SKILL_NAMES[b] ?? ''));

  let fired = false;
  let viewMode = /** @type {'respec'|'revert'} */ (deps.mode === 'revert' ? 'revert' : 'respec');
  let step = 1;
  let confirmTyped = '';
  let revertTyped = '';
  /** @type {'replace' | 'keep' | null} */
  let bankDecision = hasParkedRespec(entity) ? null : 'replace';
  let sealsLoading = true;
  let sealsBalance = 0;
  let sealsOnline = false;
  let sealsError = '';
  let statusBanner = '';
  let statusKind = '';
  let cancelConfirm = false;
  let finalizing = false;
  let completedResult = /** @type {any} */ (null);
  let spendRid = pendingRespecRidFor(entity) ?? makeRid();

  /** @type {Array<{ label: string, careerIndex: number, career: any, isNecro?: boolean }>} */
  let premadeList = [];
  let stockCareers = /** @type {any[]} */ ([]);
  let classMode = /** @type {'premade'|'custom'} */ ('premade');
  let selectedPremade = 0;

  const oldTiers = careerSkillTiers(entity.career);
  const existingSpecs = classSpecials(entity.career);
  let customName = String(entity.career?.name || 'Adventurer').slice(0, 32);
  let customHp = Math.max(HP_MIN, Math.min(HP_MAX, Math.trunc(Number(entity.career?.hitPointsPerLevel) || 8)));
  let customPrimary = oldTiers.primary.length === 3 ? [...oldTiers.primary] : [0, 1, 2];
  let customMajor = oldTiers.major.length === 3 ? [...oldTiers.major] : [3, 4, 5];
  let customMinor = oldTiers.minor.length === 6 ? [...oldTiers.minor] : [6, 7, 8, 9, 10, 11];
  /** @type {Array<{ primary: string, secondary: string, difficulty: number }>} */
  let customAdv = existingSpecs
    .filter((s) => s.kind === 'advantage' && s.source === 'career')
    .slice(0, MAX_ITEMS)
    .map((s) => ({ primary: s.primary, secondary: s.secondary || '', difficulty: advDisAdjustment(s.primary, s.secondary || '') }));
  /** @type {Array<{ primary: string, secondary: string, difficulty: number }>} */
  let customDis = existingSpecs
    .filter((s) => s.kind === 'disadvantage' && s.source === 'career')
    .slice(0, MAX_ITEMS)
    .map((s) => ({ primary: s.primary, secondary: s.secondary || '', difficulty: advDisAdjustment(s.primary, s.secondary || '') }));
  let pickAdvPrimary = ADVANTAGE_KEYS[0];
  let pickAdvSecondary = secondaryListFor(ADVANTAGE_KEYS[0])?.[0] ?? '';
  let pickDisPrimary = DISADVANTAGE_KEYS[0];
  let pickDisSecondary = secondaryListFor(DISADVANTAGE_KEYS[0])?.[0] ?? '';

  let workingStats = initialRespecStats(entity);
  let skillPlan = defaultSkillSlotPlan(entity.career, entity.skills, entity.career);
  let swapSelectedSkill = /** @type {number|null} */ (null);
  let showAllOtherSkills = false;

  try { document.exitPointerLock?.(); } catch { /* ignore */ }
  const host = el('div');
  host.style.cssText = 'position:fixed;inset:0;z-index:39;background:transparent;display:flex;align-items:center;justify-content:center;padding:12px;';
  document.body.append(host);

  const shell = el('div', 'broker-shell');
  shell.id = 'crespec';
  shell.setAttribute('role', 'dialog');
  shell.setAttribute('aria-label', t('respec.title', 'Character Reset'));
  const win = el('div', 'broker-win');
  shell.append(win);

  const head = el('header', 'broker-head');
  const titleWrap = el('div', 'broker-title');
  const heading = el('h2', null, t('respec.title', 'Character Reset'));
  const sub = el('p', 'broker-sub', t('respec.subtitle', 'Master Celarus, The Bazaar Betwixt'));
  const stepStrip = el('div', 'cr-steps');
  titleWrap.append(heading, sub, stepStrip);
  const purse = el('span', 'broker-purse');
  const closeBtn = el('button', 'act broker-close', t('respec.close', 'Close'));
  closeBtn.setAttribute('type', 'button');
  head.append(titleWrap, purse, closeBtn);

  const body = el('div', 'cr-body');
  const foot = el('footer', 'cr-foot');
  win.append(head, body, foot);
  host.append(shell);

  function activeCareerResult() {
    if (classMode === 'premade') {
      const item = premadeList[selectedPremade] ?? null;
      if (!item) return { ok: false, error: t('respec.errLoadingClasses', 'Classes are still loading.'), career: null, careerIndex: -1 };
      return {
        ok: true,
        error: '',
        career: { ...item.career },
        careerIndex: item.isNecro ? -1 : item.careerIndex,
      };
    }
    const built = buildRespecCustomCareer({
      name: customName,
      hp: customHp,
      primarySkills: customPrimary,
      majorSkills: customMajor,
      minorSkills: customMinor,
      advantages: customAdv,
      disadvantages: customDis,
      stats: workingStats,
    });
    if (!built.ok) return { ok: false, error: built.error || '', career: null, careerIndex: -1 };
    return { ok: true, error: '', career: built.career, careerIndex: -1 };
  }

  function recomputeDefaultSkillPlan() {
    const res = activeCareerResult();
    if (res.ok && res.career) {
      skillPlan = defaultSkillSlotPlan(entity.career, entity.skills, res.career);
      swapSelectedSkill = null;
    }
  }

  function makeBtn(label, onClick, { disabled = false, refuseReason = '', extraClass = '' } = {}) {
    const softRefused = !disabled && Boolean(refuseReason);
    const b = el('button', `cr-btn${extraClass ? ` ${extraClass}` : ''}${softRefused ? ' is-disabled' : ''}`, label);
    b.setAttribute('type', 'button');
    if (disabled) {
      b.setAttribute('disabled', '');
    } else if (softRefused) {
      b.setAttribute('aria-disabled', 'true');
      b.setAttribute('title', refuseReason);
    }
    b.onclick = (e) => {
      e.stopPropagation();
      if (disabled) return;
      if (softRefused) {
        statusKind = 'bad';
        statusBanner = refuseReason;
        render();
        return;
      }
      onClick();
    };
    return b;
  }

  function stopKeys(node) {
    node.addEventListener('keydown', (e) => e.stopPropagation());
  }

  function setCustomSkillAt(group, idx, pickedId) {
    const all = [...customPrimary, ...customMajor, ...customMinor];
    const flatIdx = group === 'primary' ? idx : group === 'major' ? 3 + idx : 6 + idx;
    const prevId = all[flatIdx];
    const clashIdx = all.indexOf(pickedId);
    all[flatIdx] = pickedId;
    if (clashIdx >= 0 && clashIdx !== flatIdx) all[clashIdx] = prevId;
    customPrimary = all.slice(0, 3);
    customMajor = all.slice(3, 6);
    customMinor = all.slice(6, 12);
    recomputeDefaultSkillPlan();
    render();
  }

  function adjustStat(key, delta) {
    const { budget, floor, ceiling } = attributeBudgetOf(entity);
    const cur = workingStats[key] ?? 50;
    const otherSum = STAT_KEYS_ORDER.reduce((s, k) => s + (k === key ? 0 : (workingStats[k] ?? 0)), 0);
    if (delta > 0) {
      const rem = budget - (otherSum + cur);
      const add = Math.max(0, Math.min(delta, ceiling - cur, rem));
      if (add > 0) workingStats = { ...workingStats, [key]: cur + add };
    } else if (delta < 0) {
      const subAmt = Math.max(0, Math.min(-delta, cur - floor));
      if (subAmt > 0) workingStats = { ...workingStats, [key]: cur - subAmt };
    }
    render();
  }

  function renderBankChoiceCard(parkedInfo) {
    const card = el('div', 'cr-card');
    const curLevel = Math.max(1, Math.trunc(Number(entity.level) || 1));
    const curClass = String(entity.career?.name || 'Adventurer');
    if (!parkedInfo) {
      card.append(el('div', 'cr-note', t(
        'respec.bankAutoNote',
        'Master Celarus will bank your current Level {level} {className} build before this reset, giving you one optional revert later.',
        { level: curLevel, className: curClass },
      )));
      return card;
    }
    card.append(el('h3', null, t('respec.bankPromptHead', 'Existing Banked Build Found')));
    card.append(el('div', null, t(
      'respec.bankPromptBody',
      'Master Celarus already holds your Level {oldLevel} {oldClass} build. Choose whether this new Seal replaces that banked build or keeps it.',
      { oldLevel: parkedInfo.level, oldClass: parkedInfo.className },
    )));
    const row = el('div', 'cr-tabs');
    row.append(
      makeBtn(
        t('respec.bankReplaceBtn', 'Replace with Current Build (Level {level} {className})', { level: curLevel, className: curClass }),
        () => { bankDecision = 'replace'; render(); },
        { extraClass: `cr-tab${bankDecision === 'replace' ? ' on' : ''}` },
      ),
      makeBtn(
        t('respec.bankKeepBtn', 'Keep Existing Banked Build (Level {level} {className})', { level: parkedInfo.level, className: parkedInfo.className }),
        () => { bankDecision = 'keep'; render(); },
        { extraClass: `cr-tab${bankDecision === 'keep' ? ' on' : ''}` },
      ),
    );
    card.append(row);
    if (!bankDecision) {
      card.append(el('div', 'cr-note', t(
        'respec.bankNeedChoice',
        'Choose whether to replace or keep your banked build before continuing.',
      )));
    }
    return card;
  }

  function renderStepStrip() {
    stepStrip.replaceChildren();
    if (completedResult) {
      stepStrip.append(el('span', 'cr-step active', t('respec.stepDone', 'Complete')));
      return;
    }
    if (viewMode === 'revert') {
      stepStrip.append(el('span', 'cr-step active', t('respec.revertStep', 'Banked Build')));
      return;
    }
    const labels = [
      t('respec.step1', '1. Overview and Confirm'),
      t('respec.step2', '2. Class'),
      t('respec.step3', '3. Attributes and Skills'),
      t('respec.step4', '4. Review and Finalize'),
    ];
    labels.forEach((lbl, idx) => {
      stepStrip.append(el('span', `cr-step${step === idx + 1 ? ' active' : ''}`, lbl));
    });
  }

  function renderStep1() {
    const parkedInfo = parkedRespecSummary(entity);
    const note = el('div', 'cr-banner', t(
      'respec.safeNote',
      'Read this summary carefully before starting. Nothing changes and no Psijic Seal is spent until you confirm the final review step.',
    ));
    body.append(note);

    if (parkedInfo) {
      const quickBar = el('div', 'cr-confirm-row');
      quickBar.append(makeBtn(
        t('respec.openRevertBtn', 'Open Banked Build Revert (Level {level} {className})', {
          level: parkedInfo.level,
          className: parkedInfo.className,
        }),
        () => {
          statusBanner = '';
          cancelConfirm = false;
          viewMode = 'revert';
          render();
        },
      ));
      body.append(quickBar);
    }

    if (!sealsLoading && sealsBalance < 1) {
      body.append(el('div', 'cr-banner bad', sealsError
        ? t('respec.sealsUnavailable', 'Could not verify Psijic Seals ({why}). Sign in online or check your Wallet.', { why: sealsError })
        : t('respec.noSeals', 'You currently have 0 Psijic Seals in your Wallet. You need 1 Psijic Seal to complete a character reset.')));
    }

    const cols = el('div', 'cr-cols');
    const resetsCard = el('div', 'cr-card');
    resetsCard.append(el('h3', null, t('respec.whatResetsHead', 'What Resets')));
    const rList = el('ul', 'cr-list');
    [
      t('respec.resetClass', 'Character class: pick any premade class (including Necromancer) or build a custom class with new skills, traits, and HP per level.'),
      t('respec.resetSkills', 'Skill slots: earned skill scores move 1-to-1 within Primary, Major, Minor, and Other tiers. Unchanged Other skills keep their scores, and scores above 100 keep Mastery.'),
      t('respec.resetStats', 'Attributes and derived maximums: reallocate all of your earned attribute points (including chargen rolls, level-ups, and any +30 bonus from Hermaeus Mora\'s Oghma Infinium). Max HP and Max Magicka recalculate for your new class and attributes.'),
      t('respec.resetSpecs', 'Specializations: Arcane and Martial specializations clear so your new build can choose fresh paths, and unspent or non-overcap mastery slots open again.'),
      t('respec.resetCurses', 'Vampirism and Lycanthropy: active Vampirism or Lycanthropy curses and incubating blood infections reset to zero.'),
    ].forEach((line) => rList.append(el('li', null, line)));
    resetsCard.append(rList);

    const keepsCard = el('div', 'cr-card');
    keepsCard.append(el('h3', null, t('respec.whatPersistsHead', 'What Persists')));
    const kList = el('ul', 'cr-list');
    [
      t('respec.keepIdentity', 'Character level and identity: your character level, race, gender, face, and name stay unchanged.'),
      t('respec.keepItems', 'Inventory and personal belongings: all carried, wagon, and stored items stay yours. Any worn item forbidden by your new class moves safely into your pack.'),
      t('respec.keepCurrency', 'All currencies: gold, letters of credit, bank balances, Imperial Argents, Deadlands Embers, Welkynd Shards, and remaining Psijic Seals persist.'),
      t('respec.keepHoldings', 'Holdings: houses, furnishings, companies, horses, boats, and wagons remain yours.'),
      t('respec.keepFollowers', 'Companions, crew, and revenants: followers, ship crew, and bound revenants stay with you.'),
      t('respec.keepGuilds', 'Guilds and reputation: guild memberships, ranks, and faction reputations remain intact.'),
    ].forEach((line) => kList.append(el('li', null, line)));
    keepsCard.append(kList);

    cols.append(resetsCard, keepsCard);
    body.append(cols);

    body.append(renderBankChoiceCard(parkedInfo));

    const confirmCard = el('div', 'cr-card');
    confirmCard.append(el('h3', null, t('respec.confirmHead', 'Confirm Before Continuing')));
    confirmCard.append(el('div', null, t(
      'respec.confirmPrompt',
      'Type RESET below to confirm you understand what resets and what persists.',
    )));
    const row = el('div', 'cr-confirm-row');
    const inp = /** @type {HTMLInputElement} */ (el('input'));
    inp.type = 'text';
    inp.placeholder = RESPEC_CONFIRM_WORD;
    inp.value = confirmTyped;
    inp.autocomplete = 'off';
    inp.spellcheck = false;
    stopKeys(inp);
    inp.oninput = () => {
      confirmTyped = inp.value;
      updateFooterOnly();
    };
    row.append(inp, el('span', 'cr-chip', t('respec.sealCostHint', 'Cost at final step: 1 Psijic Seal')));
    confirmCard.append(row);
    body.append(confirmCard);
  }

  function renderCareerSummaryCard(career, titleText) {
    const card = el('div', 'cr-card');
    card.append(el('h3', null, titleText));
    if (!career) {
      card.append(el('div', null, t('respec.selectClassHint', 'Choose or configure a class to inspect its details.')));
      return card;
    }
    const mult = spellPointMultiplier(career.abilityFlagsAndSpellPointsBitfield ?? 0x1000);
    const kv = el('div', 'cr-kv');
    kv.append(
      el('b', null, t('respec.hpPerLevel', 'HP per Level')),
      el('span', null, String(career.hitPointsPerLevel ?? 8)),
      el('b', null, t('respec.spellPoints', 'Spell Point Pool')),
      el('span', null, `${mult}x Intelligence`),
      el('b', null, t('respec.primarySkills', 'Primary Skills (3)')),
      el('span', null, (career.primarySkills ?? []).map((id) => SKILL_NAMES[id]).join(', ')),
      el('b', null, t('respec.majorSkills', 'Major Skills (3)')),
      el('span', null, (career.majorSkills ?? []).map((id) => SKILL_NAMES[id]).join(', ')),
      el('b', null, t('respec.minorSkills', 'Minor Skills (6)')),
      el('span', null, (career.minorSkills ?? []).map((id) => SKILL_NAMES[id]).join(', ')),
    );
    card.append(kv);

    const specials = classSpecials(career);
    const advs = specials.filter((s) => s.kind === 'advantage');
    const diss = specials.filter((s) => s.kind === 'disadvantage');
    const spKv = el('div', 'cr-kv');
    spKv.append(
      el('b', null, t('respec.advantages', 'Advantages')),
      el('span', null, advs.length ? advs.map((s) => s.label).join(', ') : t('respec.none', 'None')),
      el('b', null, t('respec.disadvantages', 'Disadvantages')),
      el('span', null, diss.length ? diss.map((s) => s.label).join(', ') : t('respec.none', 'None')),
    );
    card.append(spKv);
    return card;
  }

  function renderStep2() {
    const tabs = el('div', 'cr-tabs');
    tabs.append(
      makeBtn(t('respec.tabPremade', 'Premade Classes'), () => {
        classMode = 'premade';
        recomputeDefaultSkillPlan();
        render();
      }, { extraClass: `cr-tab${classMode === 'premade' ? ' on' : ''}` }),
      makeBtn(t('respec.tabCustom', 'Custom Class Builder'), () => {
        classMode = 'custom';
        recomputeDefaultSkillPlan();
        render();
      }, { extraClass: `cr-tab${classMode === 'custom' ? ' on' : ''}` }),
    );
    body.append(tabs);

    if (classMode === 'premade') {
      const cols = el('div', 'cr-cols');
      const pickCard = el('div', 'cr-card');
      pickCard.append(el('h3', null, t('respec.choosePremade', 'Select a Class')));
      if (!premadeList.length) {
        pickCard.append(el('div', null, t('respec.loadingClasses', 'Loading class definitions...')));
      } else {
        const grid = el('div', 'cr-class-list');
        premadeList.forEach((item, idx) => {
          const b = el('button', `cr-class-btn${selectedPremade === idx ? ' on' : ''}`, item.label);
          b.setAttribute('type', 'button');
          b.onclick = (e) => {
            e.stopPropagation();
            selectedPremade = idx;
            recomputeDefaultSkillPlan();
            render();
          };
          grid.append(b);
        });
        pickCard.append(grid);
      }
      const chosen = premadeList[selectedPremade]?.career ?? null;
      const summary = renderCareerSummaryCard(
        chosen,
        chosen ? `${chosen.name}` : t('respec.classDetails', 'Class Details'),
      );
      cols.append(pickCard, summary);
      body.append(cols);
      return;
    }

    const topCols = el('div', 'cr-cols');
    const idCard = el('div', 'cr-card');
    idCard.append(el('h3', null, t('respec.customIdentity', 'Custom Class Settings')));

    const nameRow = el('div', 'cr-confirm-row');
    nameRow.append(el('b', null, t('respec.className', 'Class Name:')));
    const nameInp = /** @type {HTMLInputElement} */ (el('input'));
    nameInp.type = 'text';
    nameInp.maxLength = 32;
    nameInp.value = customName;
    stopKeys(nameInp);
    nameInp.oninput = () => {
      customName = nameInp.value;
      updateFooterOnly();
    };
    nameRow.append(nameInp);
    idCard.append(nameRow);

    const hpRow = el('div', 'cr-confirm-row');
    hpRow.append(
      el('b', null, t('respec.hpPerLevelLabel', 'HP per Level:')),
      makeBtn('-1', () => { customHp = Math.max(HP_MIN, customHp - 1); render(); }, { disabled: customHp <= HP_MIN, extraClass: 'cr-mini' }),
      el('span', null, `${customHp} (${HP_MIN} to ${HP_MAX})`),
      makeBtn('+1', () => { customHp = Math.min(HP_MAX, customHp + 1); render(); }, { disabled: customHp >= HP_MAX, extraClass: 'cr-mini' }),
    );
    idCard.append(hpRow);

    const pts = difficultyPoints(customHp, totalAdjust(customAdv), totalAdjust(customDis));
    const inRange = pts >= DIFFICULTY_MIN && pts <= DIFFICULTY_MAX;
    const mult = advancementMultiplier(Math.max(DIFFICULTY_MIN, Math.min(DIFFICULTY_MAX, pts)));
    const pct = Math.max(0, Math.min(100, Math.round(daggerFraction(Math.max(DIFFICULTY_MIN, Math.min(DIFFICULTY_MAX, pts))) * 100)));
    const gaugeWrap = el('div');
    gaugeWrap.append(el('div', 'cr-note', `Difficulty Points: ${pts} (allowed ${DIFFICULTY_MIN} to +${DIFFICULTY_MAX}) · Advancement Speed: ${mult.toFixed(2)}x`));
    const bar = el('div', 'cr-gauge');
    const fill = el('div', 'cr-gauge-fill');
    fill.style.width = `${pct}%`;
    bar.append(fill);
    gaugeWrap.append(bar);
    if (!inRange) {
      gaugeWrap.append(el('div', 'cr-banner bad', pts > DIFFICULTY_MAX
        ? t('respec.diffTooHigh', 'Difficulty is above +40. Lower HP per level or add a disadvantage.')
        : t('respec.diffTooLow', 'Difficulty is below -12. Raise HP per level or remove a disadvantage.')));
    }
    idCard.append(gaugeWrap);

    const skillsCard = el('div', 'cr-card');
    skillsCard.append(el('h3', null, t('respec.customSkillsHead', 'Class Skills (3 Primary, 3 Major, 6 Minor)')));
    /** @param {'primary'|'major'|'minor'} group @param {number[]} list @param {string} label */
    const renderSkillPickers = (group, list, label) => {
      skillsCard.append(el('b', null, label));
      const row = el('div', 'cr-confirm-row');
      list.forEach((curId, i) => {
        const sel = /** @type {HTMLSelectElement} */ (el('select'));
        stopKeys(sel);
        for (const sid of allSkillIds) {
          const opt = document.createElement('option');
          opt.value = String(sid);
          const inP = customPrimary.includes(sid), inM = customMajor.includes(sid), inN = customMinor.includes(sid);
          const tag = sid === curId ? '' : inP ? ' (Primary)' : inM ? ' (Major)' : inN ? ' (Minor)' : '';
          opt.textContent = `${SKILL_NAMES[sid]}${tag}`;
          if (sid === curId) opt.selected = true;
          sel.append(opt);
        }
        sel.onchange = () => setCustomSkillAt(group, i, Number(sel.value));
        row.append(sel);
      });
      skillsCard.append(row);
    };
    renderSkillPickers('primary', customPrimary, t('respec.primarySkills', 'Primary Skills (3)'));
    renderSkillPickers('major', customMajor, t('respec.majorSkills', 'Major Skills (3)'));
    renderSkillPickers('minor', customMinor, t('respec.minorSkills', 'Minor Skills (6)'));

    topCols.append(idCard, skillsCard);
    body.append(topCols);

    const specCols = el('div', 'cr-cols');
    /**
     * @param {string} headLabel @param {readonly string[]} keys
     * @param {Array<{ primary: string, secondary: string, difficulty: number }>} currentList
     * @param {string} curPri @param {string} curSec @param {(p: string, s: string) => void} setPick
     * @param {(next: Array<{ primary: string, secondary: string, difficulty: number }>) => void} setList
     */
    const renderSpecialBox = (headLabel, keys, currentList, curPri, curSec, setPick, setList) => {
      const box = el('div', 'cr-card');
      box.append(el('h3', null, `${headLabel} (${currentList.length}/${MAX_ITEMS})`));
      const controls = el('div', 'cr-confirm-row');
      const priSel = /** @type {HTMLSelectElement} */ (el('select'));
      stopKeys(priSel);
      for (const k of keys) {
        const o = document.createElement('option');
        o.value = k;
        o.textContent = labelFor(k);
        if (k === curPri) o.selected = true;
        priSel.append(o);
      }
      controls.append(priSel);
      const secOpts = secondaryListFor(curPri);
      const validSec = secOpts ? (secOpts.includes(curSec) ? curSec : secOpts[0]) : '';
      if (secOpts) {
        const secSel = /** @type {HTMLSelectElement} */ (el('select'));
        stopKeys(secSel);
        for (const sk of secOpts) {
          const o = document.createElement('option');
          o.value = sk;
          o.textContent = labelFor(sk);
          if (sk === validSec) o.selected = true;
          secSel.append(o);
        }
        secSel.onchange = () => { setPick(curPri, secSel.value); render(); };
        controls.append(secSel);
      }
      priSel.onchange = () => {
        const nextP = priSel.value;
        const nextS = secondaryListFor(nextP)?.[0] ?? '';
        setPick(nextP, nextS);
        render();
      };
      const candidate = {
        primary: curPri,
        secondary: validSec,
        difficulty: advDisAdjustment(curPri, validSec),
      };
      const allChosen = [...customAdv, ...customDis];
      const blocked = currentList.length >= MAX_ITEMS || cannotAdd(candidate, currentList, allChosen);
      controls.append(makeBtn(
        `Add (${candidate.difficulty >= 0 ? `+${candidate.difficulty}` : candidate.difficulty})`,
        () => {
          setList([...currentList, candidate]);
          render();
        },
        { disabled: blocked, extraClass: 'cr-mini' },
      ));
      box.append(controls);

      const tags = el('div', 'cr-taglist');
      if (!currentList.length) {
        tags.append(el('span', 'cr-chip', t('respec.noneSelected', 'None selected')));
      } else {
        currentList.forEach((entry, idx) => {
          const tg = el('span', 'cr-tag');
          const txt = entry.secondary
            ? `${labelFor(entry.primary)}: ${labelFor(entry.secondary)} (${entry.difficulty >= 0 ? `+${entry.difficulty}` : entry.difficulty})`
            : `${labelFor(entry.primary)} (${entry.difficulty >= 0 ? `+${entry.difficulty}` : entry.difficulty})`;
          tg.append(el('span', null, txt), makeBtn('x', () => {
            const copy = [...currentList];
            copy.splice(idx, 1);
            setList(copy);
            render();
          }, { extraClass: 'cr-mini' }));
          tags.append(tg);
        });
      }
      box.append(tags);
      return box;
    };

    specCols.append(
      renderSpecialBox(
        t('respec.specialAdvHead', 'Special Advantages'),
        ADVANTAGE_KEYS,
        customAdv,
        pickAdvPrimary,
        pickAdvSecondary,
        (p, s) => { pickAdvPrimary = p; pickAdvSecondary = s; },
        (next) => { customAdv = next; },
      ),
      renderSpecialBox(
        t('respec.specialDisHead', 'Special Disadvantages'),
        DISADVANTAGE_KEYS,
        customDis,
        pickDisPrimary,
        pickDisSecondary,
        (p, s) => { pickDisPrimary = p; pickDisSecondary = s; },
        (next) => { customDis = next; },
      ),
    );
    body.append(specCols);
  }

  function renderStep3() {
    const careerRes = activeCareerResult();
    if (!careerRes.ok || !careerRes.career) {
      body.append(el('div', 'cr-banner bad', careerRes.error || t('respec.finishStep2', 'Return to Step 2 and finish your class setup.')));
      return;
    }
    const newCareer = careerRes.career;
    const { budget, unspentOghma, floor, ceiling } = attributeBudgetOf(entity);
    const spent = STAT_KEYS_ORDER.reduce((s, k) => s + (workingStats[k] ?? 0), 0);
    const remaining = budget - spent;
    const preview = previewCharacterRespec(entity, newCareer, workingStats, skillPlan);

    const cols = el('div', 'cr-cols');
    const statCard = el('div', 'cr-card');
    statCard.append(el('h3', null, t(
      'respec.attrHead',
      'Attributes (Total Budget: {budget}, Remaining: {remaining})',
      { budget, remaining },
    )));
    statCard.append(el('div', 'cr-note', unspentOghma > 0
      ? t('respec.attrSubOghma', 'Includes your chargen rolls, level-ups, and +30 pending points from reading the Oghma Infinium.')
      : t('respec.attrSub', 'Includes all earned points from chargen rolls, level-ups, and Oghma Infinium bonuses.')));

    const quickRow = el('div', 'cr-confirm-row');
    quickRow.append(
      makeBtn(t('respec.keepCurrentStats', 'Keep Current Attributes'), () => {
        workingStats = initialRespecStats(entity);
        render();
      }, { extraClass: 'cr-mini' }),
      makeBtn(t('respec.lowerAllToFloor', 'Pool Points to Minimum'), () => {
        /** @type {Record<string, number>} */
        const minMap = {};
        for (const k of STAT_KEYS_ORDER) minMap[k] = floor;
        workingStats = minMap;
        render();
      }, { extraClass: 'cr-mini' }),
    );
    statCard.append(quickRow);

    for (const k of STAT_KEYS_ORDER) {
      const val = workingStats[k] ?? 50;
      const row = el('div', 'cr-stat-row');
      const downBtns = el('div', 'cr-stat-btns');
      downBtns.append(
        makeBtn('-5', () => adjustStat(k, -5), { disabled: val <= floor, extraClass: 'cr-mini' }),
        makeBtn('-1', () => adjustStat(k, -1), { disabled: val <= floor, extraClass: 'cr-mini' }),
      );
      const upBtns = el('div', 'cr-stat-btns');
      upBtns.append(
        makeBtn('+1', () => adjustStat(k, 1), { disabled: val >= ceiling || remaining <= 0, extraClass: 'cr-mini' }),
        makeBtn('+5', () => adjustStat(k, 5), { disabled: val >= ceiling || remaining <= 0, extraClass: 'cr-mini' }),
      );
      row.append(
        el('b', null, STAT_LABELS[k] ?? k),
        downBtns,
        el('span', 'cr-stat-val', String(val)),
        upBtns,
      );
      statCard.append(row);
    }

    const vitalsCard = el('div', 'cr-card');
    vitalsCard.append(el('h3', null, t('respec.derivedPreview', 'Recalculated Vitals Preview')));
    const vKv = el('div', 'cr-kv');
    vKv.append(
      el('b', null, t('respec.charLevel', 'Character Level')),
      el('span', null, String(preview.level)),
      el('b', null, t('respec.baseMaxHp', 'Base Max HP')),
      el('span', null, String(preview.rawMaxHp)),
      el('b', null, t('respec.baseMaxMp', 'Base Max Magicka')),
      el('span', null, String(preview.rawMaxMp)),
      el('b', null, t('respec.maxFatigue', 'Max Fatigue')),
      el('span', null, String(preview.maxFatigue)),
    );
    vitalsCard.append(vKv);
    vitalsCard.append(el('div', 'cr-note', t(
      'respec.slotSwapHelp',
      '1-to-1 Skill Slots: click one skill below, then click another skill in the same tier to swap which old score each skill receives. Any score above 100 carries its Mastery slot onto its new skill.',
    )));
    vitalsCard.append(makeBtn(t('respec.resetSkillSlots', 'Reset Skill Slots to Default Match'), () => {
      recomputeDefaultSkillPlan();
      render();
    }, { extraClass: 'cr-mini' }));

    cols.append(statCard, vitalsCard);
    body.append(cols);

    const newTiers = careerSkillTiers(newCareer);
    const planChanged = (/** @type {number} */ id) => skillPlan[id] !== id;
    /**
     * @param {'primary'|'major'|'minor'|'other'} tier
     * @param {string} titleLabel
     */
    const renderTierCard = (tier, titleLabel) => {
      const tCard = el('div', 'cr-card');
      const headRow = el('div', 'cr-confirm-row');
      headRow.append(el('h3', null, titleLabel));
      let ids = newTiers[tier];
      if (tier === 'other') {
        const displaced = ids.filter((id) => planChanged(id));
        headRow.append(makeBtn(
          showAllOtherSkills
            ? t('respec.hideUnchangedOther', 'Show Displaced Only')
            : t('respec.showAllOther', 'Show All 23 Other Skills'),
          () => { showAllOtherSkills = !showAllOtherSkills; render(); },
          { extraClass: 'cr-mini' },
        ));
        if (!showAllOtherSkills && displaced.length > 0) ids = displaced;
        else if (!showAllOtherSkills && displaced.length === 0) {
          tCard.append(headRow, el('div', 'cr-note', t(
            'respec.otherKeptNote',
            'All 23 Other skills matched their previous Other slots and kept their existing scores.',
          )));
          return tCard;
        }
      }
      tCard.append(headRow);
      const grid = el('div', 'cr-tier-grid');
      for (const targetId of ids) {
        const fromId = skillPlan[targetId];
        const score = Math.trunc(Number(entity.skills?.[fromId] ?? 0));
        const isPicked = swapSelectedSkill === targetId;
        const slotBtn = el('button', `cr-slot${isPicked ? ' picked' : ''}`);
        slotBtn.setAttribute('type', 'button');
        const left = el('span', null, SKILL_NAMES[targetId] ?? `Skill ${targetId}`);
        const right = el('span', 'cr-chip');
        right.textContent = fromId === targetId
          ? `${score} (kept)`
          : `${score} (from ${SKILL_NAMES[fromId]})`;
        if (score > 100 && tier !== 'other') {
          right.append(el('span', 'cr-master', t('respec.masteredBadge', 'Mastered')));
        }
        slotBtn.append(left, right);
        slotBtn.onclick = (e) => {
          e.stopPropagation();
          if (swapSelectedSkill == null) {
            swapSelectedSkill = targetId;
          } else if (swapSelectedSkill === targetId) {
            swapSelectedSkill = null;
          } else {
            const prevTier = newTiers.primary.includes(swapSelectedSkill) ? 'primary'
              : newTiers.major.includes(swapSelectedSkill) ? 'major'
                : newTiers.minor.includes(swapSelectedSkill) ? 'minor' : 'other';
            if (prevTier === tier) {
              skillPlan = swapSkillSlotInPlan(skillPlan, newCareer, swapSelectedSkill, targetId);
              swapSelectedSkill = null;
            } else {
              swapSelectedSkill = targetId;
            }
          }
          render();
        };
        grid.append(slotBtn);
      }
      tCard.append(grid);
      return tCard;
    };

    body.append(
      renderTierCard('primary', t('respec.tierPrimary', 'Primary Skills (3 slots)')),
      renderTierCard('major', t('respec.tierMajor', 'Major Skills (3 slots)')),
      renderTierCard('minor', t('respec.tierMinor', 'Minor Skills (6 slots)')),
      renderTierCard('other', t('respec.tierOther', 'Other Skills (23 slots)')),
    );
  }

  function renderStep4() {
    const careerRes = activeCareerResult();
    if (!careerRes.ok || !careerRes.career) {
      body.append(el('div', 'cr-banner bad', careerRes.error || t('respec.invalidClass', 'Invalid class configuration.')));
      return;
    }
    const newCareer = careerRes.career;
    const valid = validateRespecBuild(entity, {
      career: newCareer,
      careerIndex: careerRes.careerIndex,
      stats: workingStats,
      skillPlan,
    });
    if (!valid.ok) {
      body.append(el('div', 'cr-banner bad', valid.error || t('respec.invalidBuild', 'Build is incomplete.')));
      return;
    }

    const parkedInfo = parkedRespecSummary(entity);
    const preview = previewCharacterRespec(entity, newCareer, workingStats, skillPlan);
    body.append(el('div', 'cr-banner', t(
      'respec.finalBanner',
      'Review your new character build below. Clicking Finalize Character Reset spends 1 Psijic Seal from your Wallet (leaving {after}) and applies all changes.',
      { after: Math.max(0, sealsBalance - 1) },
    )));

    body.append(renderBankChoiceCard(parkedInfo));

    const cols = el('div', 'cr-cols');
    const summaryCard = el('div', 'cr-card');
    summaryCard.append(el('h3', null, t('respec.summaryHead', 'Build Summary')));
    const fmtSkillList = (/** @type {number[]} */ ids) => ids
      .map((id) => `${SKILL_NAMES[id]} (${Math.trunc(Number(entity.skills?.[skillPlan[id]] ?? 0))})`)
      .join(', ');
    const kv = el('div', 'cr-kv');
    kv.append(
      el('b', null, t('respec.summaryClass', 'Class')),
      el('span', null, `${entity.career?.name || 'Previous'} -> ${newCareer.name}`),
      el('b', null, t('respec.charLevel', 'Character Level')),
      el('span', null, `${preview.level} (unchanged)`),
      el('b', null, t('respec.baseMaxHp', 'Base Max HP')),
      el('span', null, `${entity.rawMaxHealth ?? entity.maxHealth} -> ${preview.rawMaxHp}`),
      el('b', null, t('respec.baseMaxMp', 'Base Max Magicka')),
      el('span', null, `${preview.rawMaxMp}`),
      el('b', null, t('respec.primarySkills', 'Primary Skills (3)')),
      el('span', null, fmtSkillList(newCareer.primarySkills)),
      el('b', null, t('respec.majorSkills', 'Major Skills (3)')),
      el('span', null, fmtSkillList(newCareer.majorSkills)),
      el('b', null, t('respec.minorSkills', 'Minor Skills (6)')),
      el('span', null, fmtSkillList(newCareer.minorSkills)),
    );
    summaryCard.append(kv);

    const effectsCard = el('div', 'cr-card');
    effectsCard.append(el('h3', null, t('respec.effectsHead', 'Equipment, Mastery, and Curse Changes')));
    const eList = el('ul', 'cr-list');
    eList.append(el('li', null, preview.unequipped.length
      ? t('respec.unequipList', 'Worn items moved safely into your pack: {items}.', { items: preview.unequipped.join(', ') })
      : t('respec.unequipNone', 'All currently worn equipment is allowed by your new class.')));
    eList.append(el('li', null, preview.masteryTransfers.length
      ? t(
        'respec.masteryMoved',
        'Overcap Mastery slots transferred: {items}.',
        { items: preview.masteryTransfers.map((m) => `${m.toName} (${m.score})`).join(', ') },
      )
      : t('respec.masteryCleared', 'All 3 Primary, 2 Major, and 1 Minor Mastery slots will be open for your new skills.')));
    const hasCurse = preview.curse.vampire || preview.curse.were || preview.curse.blood > 0 || preview.curse.pending;
    eList.append(el('li', null, hasCurse
      ? t('respec.curseWillClear', 'Active Vampirism, Lycanthropy, or blood infection status will be reset to zero.')
      : t('respec.curseNone', 'No active Vampirism or Lycanthropy status to clear.')));
    effectsCard.append(eList);

    cols.append(summaryCard, effectsCard);
    body.append(cols);
  }

  function renderRevertView() {
    const info = parkedRespecSummary(entity);
    if (!info) {
      body.append(el('div', 'cr-banner bad', t(
        'respec.revertNoneAvailable',
        'Master Celarus is not holding a banked build for this character.',
      )));
      return;
    }

    body.append(el('div', 'cr-banner', t(
      'respec.revertIntro',
      'Review your banked pre-reset build below. Restoring it consumes this banked save and neither spends nor refunds a Psijic Seal.',
    )));

    if (info.levelChanged || info.statBudgetChanged) {
      body.append(el('div', 'cr-banner bad', t(
        'respec.revertLevelWarn',
        'Your level or attribute total changed after that reset. Restoring returns your character sheet to Level {level} while keeping your pack, gold, and quests.',
        { level: info.level },
      )));
    }

    const cols = el('div', 'cr-cols');
    const targetCard = el('div', 'cr-card');
    targetCard.append(el('h3', null, t('respec.revertTargetHead', 'Banked Build to Restore')));
    const fmtBankSkills = (/** @type {number[]} */ ids) => ids
      .map((id) => `${SKILL_NAMES[id]} (${info.skills[id] ?? 0})`)
      .join(', ');
    const statSummary = STAT_KEYS_ORDER
      .map((k) => `${(STAT_LABELS[k] ?? k).slice(0, 3).toUpperCase()} ${info.stats[k]}`)
      .join(' · ');
    const kv = el('div', 'cr-kv');
    kv.append(
      el('b', null, t('respec.summaryClass', 'Class')),
      el('span', null, `${entity.career?.name || 'Current'} -> ${info.className}`),
      el('b', null, t('respec.charLevel', 'Character Level')),
      el('span', null, `${entity.level} -> ${info.level}`),
      el('b', null, t('respec.baseMaxHp', 'Base Max HP')),
      el('span', null, `${entity.rawMaxHealth ?? entity.maxHealth} -> ${info.rawMaxHealth}`),
      el('b', null, t('respec.baseMaxMp', 'Base Max Magicka')),
      el('span', null, String(info.rawMaxMagicka)),
      el('b', null, t('respec.primarySkills', 'Primary Skills (3)')),
      el('span', null, fmtBankSkills(info.career.primarySkills ?? [])),
      el('b', null, t('respec.majorSkills', 'Major Skills (3)')),
      el('span', null, fmtBankSkills(info.career.majorSkills ?? [])),
      el('b', null, t('respec.minorSkills', 'Minor Skills (6)')),
      el('span', null, fmtBankSkills(info.career.minorSkills ?? [])),
    );
    targetCard.append(kv, el('div', 'cr-note', statSummary));

    const keptCard = el('div', 'cr-card');
    keptCard.append(el('h3', null, t('respec.revertKeptHead', 'What Stays Intact')));
    const kList = el('ul', 'cr-list');
    kList.append(el('li', null, t(
      'respec.revertKeptItems',
      'Inventory, wagon, bank accounts, currencies, houses, ships, guild ranks, and quest progress remain as they are now.',
    )));
    kList.append(el('li', null, t(
      'respec.revertKeptOnce',
      'This banked build can be restored once. Afterward, your banked slot clears until you spend another Psijic Seal.',
    )));
    kList.append(el('li', null, t(
      'respec.revertGearCount',
      'Pre-reset worn items still in your pack ready to re-equip: {ready} of {total}.',
      { ready: info.reEquippableCount, total: info.wornSavedCount },
    )));
    const hasBankCurse = info.curse.vampire || info.curse.were || info.curse.blood > 0 || info.curse.pending;
    kList.append(el('li', null, hasBankCurse
      ? t('respec.revertCurseRestore', 'Banked Vampirism, Lycanthropy, or blood infection status will be restored in mortal form.')
      : t('respec.revertCurseClear', 'Your banked build has no active Vampirism or Lycanthropy curse.')));
    keptCard.append(kList);

    cols.append(targetCard, keptCard);
    body.append(cols);

    const confirmCard = el('div', 'cr-card');
    confirmCard.append(el('h3', null, t('respec.confirmHead', 'Confirm Before Continuing')));
    confirmCard.append(el('div', null, t(
      'respec.revertConfirmPrompt',
      'Type REVERT below to restore your banked build and consume this one-time revert.',
    )));
    const row = el('div', 'cr-confirm-row');
    const inp = /** @type {HTMLInputElement} */ (el('input'));
    inp.type = 'text';
    inp.placeholder = REVERT_CONFIRM_WORD;
    inp.value = revertTyped;
    inp.autocomplete = 'off';
    inp.spellcheck = false;
    stopKeys(inp);
    inp.oninput = () => {
      revertTyped = inp.value;
      updateFooterOnly();
    };
    row.append(inp);
    confirmCard.append(row);
    body.append(confirmCard);
  }

  function renderCompleted() {
    if (completedResult?.reverted) {
      body.append(el('div', 'cr-banner good', t(
        'respec.revertDoneBanner',
        'Your banked Level {level} {className} build has been restored, and your banked slot is now clear.',
        { level: entity.level, className: entity.career?.name ?? '' },
      )));
      const card = el('div', 'cr-card');
      card.append(el('h3', null, `${entity.name} · Level ${entity.level} ${entity.career?.name ?? ''}`));
      const list = el('ul', 'cr-list');
      list.append(el('li', null, `Max HP: ${entity.maxHealth} · Max Magicka: ${entity.maxMagicka}`));
      if (completedResult.reEquipped?.length) {
        list.append(el('li', null, t(
          'respec.revertEquippedList',
          'Re-equipped from your pack: {items}.',
          { items: completedResult.reEquipped.join(', ') },
        )));
      }
      card.append(list);
      body.append(card);
      return;
    }

    body.append(el('div', 'cr-banner good', t(
      'respec.doneBanner',
      'Your character reset is complete. 1 Psijic Seal was spent ({left} remaining in your Wallet).',
      { left: sealsBalance },
    )));
    const card = el('div', 'cr-card');
    card.append(el('h3', null, `${entity.name} · Level ${entity.level} ${entity.career?.name ?? ''}`));
    const list = el('ul', 'cr-list');
    list.append(el('li', null, `Max HP: ${entity.maxHealth} · Max Magicka: ${entity.maxMagicka}`));
    const bankedNow = parkedRespecSummary(entity);
    if (bankedNow) {
      list.append(el('li', null, completedResult?.bankPolicyUsed === 'keep'
        ? t('respec.bankKeptNote', 'Your existing Level {level} {className} banked build remains stored for one future revert.', {
          level: bankedNow.level,
          className: bankedNow.className,
        })
        : t('respec.bankSavedNote', 'Your previous Level {level} {className} build is now banked with Master Celarus for one optional revert.', {
          level: bankedNow.level,
          className: bankedNow.className,
        })));
    }
    if (completedResult?.unequipped?.length) {
      list.append(el('li', null, t('respec.unequipList', 'Worn items moved safely into your pack: {items}.', { items: completedResult.unequipped.join(', ') })));
    }
    if (completedResult?.grantedSpellbook) {
      list.append(el('li', null, t('respec.grantedBook', 'Added a Spellbook to your pack for your new spellcasting class.')));
    }
    card.append(list);
    body.append(card);
  }

  async function finalizeRespec() {
    if (finalizing || completedResult) return;
    const hadBank = hasParkedRespec(entity);
    if (hadBank && !bankDecision) {
      statusKind = 'bad';
      statusBanner = t('respec.bankNeedChoice', 'Choose whether to replace or keep your banked build before continuing.');
      render();
      return;
    }
    const careerRes = activeCareerResult();
    if (!careerRes.ok || !careerRes.career) {
      statusKind = 'bad';
      statusBanner = careerRes.error || t('respec.invalidClass', 'Invalid class configuration.');
      render();
      return;
    }
    const spec = {
      career: careerRes.career,
      careerIndex: careerRes.careerIndex,
      stockCareers,
      stats: workingStats,
      skillPlan,
      rid: spendRid,
      bankPolicy: hadBank && bankDecision === 'keep' ? /** @type {const} */ ('keep') : /** @type {const} */ ('replace'),
    };
    const check = validateRespecBuild(entity, spec);
    if (!check.ok) {
      statusKind = 'bad';
      statusBanner = check.error || t('respec.invalidBuild', 'Build is incomplete.');
      render();
      return;
    }

    finalizing = true;
    statusBanner = '';
    render();
    const usedRid = spendRid;
    rememberPendingRespecRid(entity, usedRid);
    const spent = await spendPsijicSealNow(entity, usedRid);
    if (!spent.ok) {
      finalizing = false;
      statusKind = 'bad';
      if (spent.error === 'seals-short') {
        sealsBalance = spent.balance;
        clearPendingRespecRid(entity, usedRid);
        statusBanner = t('respec.noSeals', 'You currently have 0 Psijic Seals in your Wallet. You need 1 Psijic Seal to complete a character reset.');
      } else {
        statusBanner = t('respec.spendFailed', 'Could not spend a Psijic Seal ({why}). Nothing on your character was changed.', { why: spent.error || 'offline' });
      }
      render();
      return;
    }

    sealsBalance = spent.balance;
    const sbi = typeof deps.spellsByIndex === 'function' ? deps.spellsByIndex() : deps.spellsByIndex;
    const nowMin = typeof deps.nowMinutes === 'function' ? deps.nowMinutes() : (Number(deps.nowMinutes) || 0);
    const applied = applyCharacterRespec(entity, spec, {
      spellsByIndex: sbi ?? null,
      nowMinutes: nowMin,
      advanceMinutes: null,
    });
    finalizing = false;
    if (!applied.ok) {
      statusKind = 'bad';
      statusBanner = ('error' in applied && applied.error) ? applied.error : t('respec.buildFailed', 'Build failed validation.');
      render();
      return;
    }
    if (!spent.online) clearPendingRespecRid(entity, usedRid);
    spendRid = makeRid();
    completedResult = applied;
    deps.onApplied?.(applied);
    deps.saveSoon?.();
    render();
  }

  function finalizeRevert() {
    if (finalizing || completedResult) return;
    if (revertTyped.trim().toUpperCase() !== REVERT_CONFIRM_WORD) return;
    const sbi = typeof deps.spellsByIndex === 'function' ? deps.spellsByIndex() : deps.spellsByIndex;
    const nowMin = typeof deps.nowMinutes === 'function' ? deps.nowMinutes() : (Number(deps.nowMinutes) || 0);
    const reverted = revertCharacterRespec(entity, {
      spellsByIndex: sbi ?? null,
      nowMinutes: nowMin,
    });
    if (!reverted.ok) {
      statusKind = 'bad';
      statusBanner = ('error' in reverted && reverted.error) ? reverted.error : t('respec.revertNoneAvailable', 'Master Celarus is not holding a banked build for this character.');
      render();
      return;
    }
    completedResult = reverted;
    deps.onApplied?.(reverted);
    deps.saveSoon?.();
    render();
  }

  function updateFooterOnly() {
    foot.replaceChildren();
    if (completedResult) {
      foot.append(
        el('span', 'cr-note', t('respec.savedNote', 'Your new build is active.')),
        makeBtn(t('respec.doneClose', 'Done'), () => closeNow(), { extraClass: 'primary' }),
      );
      return;
    }

    if (viewMode === 'revert') {
      const left = el('div', 'cr-confirm-row');
      left.append(
        makeBtn(t('respec.cancel', 'Cancel'), () => closeNow()),
        makeBtn(t('respec.revertBackToReset', 'Switch to New Character Reset'), () => {
          statusBanner = '';
          revertTyped = '';
          viewMode = 'respec';
          bankDecision = hasParkedRespec(entity) ? null : 'replace';
          render();
        }),
      );
      const right = el('div', 'cr-confirm-row');
      const hasBank = hasParkedRespec(entity);
      const okRevert = hasBank && revertTyped.trim().toUpperCase() === REVERT_CONFIRM_WORD;
      const revWhy = !hasBank
        ? t('respec.revertNoneAvailable', 'Master Celarus is not holding a banked build for this character.')
        : (!okRevert ? t('respec.revertConfirmPrompt', 'Type REVERT below to restore your banked build and consume this one-time revert.') : '');
      right.append(makeBtn(
        t('respec.revertActionBtn', 'Restore Banked Build'),
        () => finalizeRevert(),
        { disabled: finalizing, refuseReason: revWhy, extraClass: 'primary' },
      ));
      foot.append(left, right);
      return;
    }

    const left = el('div', 'cr-confirm-row');
    if (cancelConfirm) {
      left.append(
        el('span', 'cr-chip', t('respec.discardAsk', 'Discard this draft? No Psijic Seal will be spent.')),
        makeBtn(t('respec.discardYes', 'Discard and Close'), () => closeNow()),
        makeBtn(t('respec.discardNo', 'Keep Editing'), () => { cancelConfirm = false; updateFooterOnly(); }),
      );
    } else {
      left.append(makeBtn(t('respec.cancel', 'Cancel'), () => {
        if (step > 1) { cancelConfirm = true; updateFooterOnly(); }
        else closeNow();
      }));
    }

    const right = el('div', 'cr-confirm-row');
    if (step > 1) {
      right.append(makeBtn(t('respec.back', 'Back'), () => {
        statusBanner = '';
        cancelConfirm = false;
        step -= 1;
        render();
      }, { disabled: finalizing }));
    }
    const bankChoiceReady = !hasParkedRespec(entity) || bankDecision === 'replace' || bankDecision === 'keep';
    if (step === 1) {
      const okWord = confirmTyped.trim().toUpperCase() === RESPEC_CONFIRM_WORD;
      let step1Why = '';
      if (sealsLoading) step1Why = t('respec.sealsChecking', 'Psijic Seals: checking...');
      else if (sealsBalance < 1) step1Why = t('respec.noSeals', 'You currently have 0 Psijic Seals in your Wallet. You need 1 Psijic Seal to complete a character reset.');
      else if (!premadeList.length) step1Why = t('respec.errLoadingClasses', 'Classes are still loading.');
      else if (!bankChoiceReady) step1Why = t('respec.bankNeedChoice', 'Choose whether to replace or keep your banked build before continuing.');
      else if (!okWord) step1Why = t('respec.confirmPrompt', 'Type RESET below to confirm you understand what resets and what persists.');
      right.append(makeBtn(
        t('respec.continueToClass', 'Continue to Class Selection'),
        () => { statusBanner = ''; step = 2; render(); },
        { refuseReason: step1Why, extraClass: 'primary' },
      ));
    } else if (step === 2) {
      const cRes = activeCareerResult();
      const step2Why = cRes.ok ? '' : (cRes.error || t('respec.invalidClass', 'Invalid class configuration.'));
      right.append(makeBtn(
        t('respec.continueToStats', 'Continue to Attributes and Skills'),
        () => { statusBanner = ''; step = 3; render(); },
        { refuseReason: step2Why, extraClass: 'primary' },
      ));
    } else if (step === 3) {
      const cRes = activeCareerResult();
      const vRes = cRes.ok && cRes.career
        ? validateRespecBuild(entity, { career: cRes.career, careerIndex: cRes.careerIndex, stats: workingStats, skillPlan })
        : { ok: false, error: cRes.error };
      if (!vRes.ok && vRes.error) {
        right.append(el('span', 'cr-note', vRes.error));
      }
      const step3Why = vRes.ok ? '' : (vRes.error || t('respec.invalidBuild', 'Build is incomplete.'));
      right.append(makeBtn(
        t('respec.continueToReview', 'Review Final Build'),
        () => { statusBanner = ''; step = 4; render(); },
        { refuseReason: step3Why, extraClass: 'primary' },
      ));
    } else if (step === 4) {
      const step4Why = sealsBalance < 1
        ? t('respec.noSeals', 'You currently have 0 Psijic Seals in your Wallet. You need 1 Psijic Seal to complete a character reset.')
        : (!bankChoiceReady ? t('respec.bankNeedChoice', 'Choose whether to replace or keep your banked build before continuing.') : '');
      right.append(makeBtn(
        finalizing
          ? t('respec.finalizing', 'Applying Reset...')
          : t('respec.finalizeBtn', 'Finalize Character Reset (Spend 1 Psijic Seal)'),
        () => { void finalizeRespec(); },
        { disabled: finalizing, refuseReason: step4Why, extraClass: 'primary' },
      ));
    }
    foot.append(left, right);
  }

  function render() {
    if (fired) return;
    heading.textContent = viewMode === 'revert'
      ? t('respec.revertTitle', 'Restore Banked Build')
      : t('respec.title', 'Character Reset');
    purse.textContent = sealsLoading
      ? t('respec.sealsChecking', 'Psijic Seals: checking...')
      : t('respec.sealsCount', 'Psijic Seals: {n}', { n: sealsBalance });
    renderStepStrip();
    body.replaceChildren();
    if (statusBanner) {
      body.append(el('div', `cr-banner${statusKind ? ` ${statusKind}` : ''}`, statusBanner));
    }
    if (completedResult) renderCompleted();
    else if (viewMode === 'revert') renderRevertView();
    else if (step === 1) renderStep1();
    else if (step === 2) renderStep2();
    else if (step === 3) renderStep3();
    else renderStep4();
    updateFooterOnly();
  }

  function closeNow() {
    if (fired) return;
    fired = true;
    if (completedResult) deps.saveSoon?.();
    unregister();
    globalThis.removeEventListener('keydown', onKey, { capture: true });
    host.remove();
    deps.onClose?.();
  }

  closeBtn.onclick = (e) => {
    e.stopPropagation();
    if (!completedResult && viewMode === 'respec' && step > 1 && !cancelConfirm) {
      cancelConfirm = true;
      updateFooterOnly();
      return;
    }
    closeNow();
  };

  const onKey = (/** @type {KeyboardEvent} */ e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = /** @type {HTMLElement} */ (e.target)?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (!completedResult && viewMode === 'respec' && step > 1 && !cancelConfirm) { cancelConfirm = true; updateFooterOnly(); }
        else closeNow();
      }
      return;
    }
    if (overlayAction(e) === 'back') {
      e.preventDefault();
      e.stopPropagation();
      if (!completedResult && viewMode === 'respec' && step > 1 && !cancelConfirm) { cancelConfirm = true; updateFooterOnly(); }
      else closeNow();
    }
  };

  globalThis.addEventListener('keydown', onKey, { capture: true });
  const unregister = registerOverlay(closeNow);

  readPsijicSeals(entity).then((res) => {
    sealsLoading = false;
    sealsOnline = res.online;
    sealsBalance = res.balance;
    sealsError = res.ok ? '' : (res.error || '');
    render();
  }).catch(() => {
    sealsLoading = false;
    sealsError = 'offline';
    render();
  });

  const loadPromise = deps.fetchBytes ? loadCareers(deps.fetchBytes) : Promise.resolve([]);
  loadPromise.then((loaded) => {
    stockCareers = loaded;
    premadeList = loaded.map((entry, idx) => ({
      label: entry.name,
      careerIndex: idx,
      career: entry.career,
    }));
    const necro = necromancerCareer();
    premadeList.push({
      label: NECROMANCER_NAME,
      careerIndex: -1,
      career: necro,
      isNecro: true,
    });
    const matchIdx = premadeList.findIndex((p) => p.label.toLowerCase() === String(entity.career?.name ?? '').toLowerCase());
    selectedPremade = matchIdx >= 0 ? matchIdx : 0;
    if (matchIdx < 0 && entity.career) classMode = 'custom';
    recomputeDefaultSkillPlan();
    render();
  }).catch(() => {
    const necro = necromancerCareer();
    premadeList = [{ label: NECROMANCER_NAME, careerIndex: -1, career: necro, isNecro: true }];
    recomputeDefaultSkillPlan();
    render();
  });

  render();
  void sealsOnline;

  return {
    isChoiceWindow: true,
    get done() { return fired; },
    input() {},
    click() {},
    wheel() {},
    hover() {},
    tick() {},
    draw() {},
    dispose() { closeNow(); },
    repaint() { render(); },
  };
}
