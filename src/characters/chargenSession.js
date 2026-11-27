import { giveNecromancerKit } from '../systems/necromancy/necromancy.js';
import { ClassFile } from '../formats/classFile.js';
import { TextRsc } from '../formats/textRsc.js';
import { parseQuestionLibrary } from './classQuestions.js';
import { ChargenFlow, handHeroGenderToGrammar } from '../ui/chargen.js';
import { applyCharacter, createCharacter, assignStartingSpells, CLASS_CAREERS } from './chargen.js';
import { levelUpSkillSum } from './advancement.js';
import { overlayAction } from '../ui/input.js';
import { isEnhanced } from '../ui/uiSkin.js';
import { assignStartingEquipment } from './startingGear.js';
import { giveBinderAtChargen } from '../cards/iliacItems.js';
import { NUMBER_BODY_PARTS } from '../items/armorMaterials.js';
import { standardSpellsByIndex } from '../magic/standardSpells.js';
import { parseBiog, biogFileName } from '../formats/biogFile.js';
import { applyBiographyEffects } from './biography.js';
import { customSpellSetIndex } from './customClass.js';
import { reviseStockCareer } from './stockClasses.js';
import { SOCIAL_GROUP_COUNT, FactionFile } from '../formats/factionFile.js';
import { attachFactionRep } from '../guilds/factionRep.js';
import { createRegionConditions } from '../world/regionConditions.js';
import { clearWorldDataVariants } from '../world/worldDataVariants.js';
import { bootstrapRegionPower } from '../guilds/regionPower.js';
import { LevelingChoiceScreen, levelingOptions } from '../ui/levelingChoice.js';
import { oblivionLevelingEnabled, initVirtueLeveling, LEVELING_CLASSIC, newCharacterLevelingSystem } from './oblivionLeveling.js';
import { isOnlinePage } from '../platform/onlineLane.js';
import { legacyOn } from '../systems/legacy/settings.js';
import { legacyModelScreen, legacyModelOptions } from '../ui/legacyModelChoice.js';
import { contentOn } from '../mods/contentOff.js';
import { isLegacyChoice } from '../systems/legacy/family.js';
import { setNames } from './names.js';

export async function loadSpellIndex(fetchBytes) {
  try {
    return standardSpellsByIndex(await fetchBytes('SPELLS.STD'));
  } catch (e) {
    console.warn('[chargen] SPELLS.STD unavailable; the starting spellbook stays empty', e);
    return null;
  }
}

export async function loadBiogs(fetchBytes) {
  const out = [];
  for (let i = 0; i < CLASS_CAREERS.length; i++) out.push(await loadBiog(fetchBytes, i));
  return out;
}

export async function loadBiog(fetchBytes, classIndex) {
  try {
    const bytes = await fetchBytes(biogFileName(classIndex));
    const text = new TextDecoder('latin1').decode(bytes);
    return parseBiog(text, classIndex);
  } catch (e) {
    console.warn(`[chargen] ${biogFileName(classIndex)} unavailable; the biography questions are skipped`, e);
    return null;
  }
}

export async function loadClassQuestionData(fetchBytes) {
  let questionLibrary = null, classesData = null;
  try {
    questionLibrary = parseQuestionLibrary(new TextRsc().load(await fetchBytes('TEXT.RSC')));
    if (!questionLibrary) console.warn('[chargen] TEXT.RSC has no record 9000; the class questions are skipped');
  } catch (e) { console.warn('[chargen] TEXT.RSC unavailable; the class questions are skipped', e); }
  try {
    classesData = await fetchBytes('CLASSES.DAT');
  } catch (e) { console.warn('[chargen] CLASSES.DAT unavailable; the class questions are skipped', e); }
  return { questionLibrary, classesData };
}

export async function loadCareers(fetchBytes) {
  const careers = [];
  for (let i = 0; i < CLASS_CAREERS.length; i++) {
    const cf = new ClassFile();
    cf.load(await fetchBytes(`CLASS${String(i).padStart(2, '0')}.CFG`));
    careers.push({ name: cf.career.name || CLASS_CAREERS[i], career: reviseStockCareer(i, cf.career) });
  }
  return careers;
}

export async function applyHeadlessChargen(playerEntity, classIndex, { fetchBytes, spellsByIndex = null } = {}) {
  const cf = new ClassFile();
  cf.load(await fetchBytes(`CLASS${String(classIndex).padStart(2, '0')}.CFG`));
  const career = reviseStockCareer(classIndex, cf.career);
  createCharacter(playerEntity, career, classIndex);
  playerEntity.spells = assignStartingSpells(classIndex, spellsByIndex, career);
  playerEntity.items = [];
  playerEntity.equip = null;
  playerEntity.armorValues = new Array(NUMBER_BODY_PARTS).fill(100);
  assignStartingEquipment(playerEntity, { classIndex });
  giveBinderAtChargen(playerEntity);
  attachFactionRep(playerEntity, await loadFactions(fetchBytes));
  playerEntity.regionConditions = createRegionConditions();
  clearWorldDataVariants();
  bootstrapRegionPower(playerEntity.factionRep, { regionConditions: playerEntity.regionConditions });
  initVirtueLeveling(playerEntity, newCharacterLevelingSystem(LEVELING_CLASSIC, { online: isOnlinePage() }));
  console.log(`[chargen] ${CLASS_CAREERS[classIndex]}: HP ${playerEntity.maxHealth}, spells ${playerEntity.spells.length}`);
  return playerEntity;
}

export function applyCreationExtras(playerEntity, result, spellsByIndex = null, { rolls = Math.random } = {}) {
  if (spellsByIndex) {
    const setIndex = result.isCustom ? customSpellSetIndex(result.career) : result.careerIndex;
    playerEntity.spells = setIndex == null ? [] : assignStartingSpells(setIndex, spellsByIndex, result.career);
  }
  playerEntity.items = [];
  playerEntity.equip = null;
  playerEntity.armorValues = new Array(NUMBER_BODY_PARTS).fill(100);
  if (result.customReps) {
    if (!playerEntity.sGroupReputations) playerEntity.sGroupReputations = new Array(SOCIAL_GROUP_COUNT).fill(0);
    for (let i = 0; i < result.customReps.length; i++) playerEntity.sGroupReputations[i] = result.customReps[i];
  }
  // The biography applies before the starting kit, as in DFU, so bag order and gold match.
  if (result.biographyEffects?.length) applyBiographyEffects(playerEntity, result.biographyEffects, { rolls });
  if (result.factionDict) attachFactionRep(playerEntity, result.factionDict);
  assignStartingEquipment(playerEntity, { classIndex: result.careerIndex, isCustom: result.isCustom ?? false, rolls });
  giveBinderAtChargen(playerEntity);
  giveNecromancerKit(playerEntity, result.career);
  playerEntity.regionConditions = createRegionConditions();
  clearWorldDataVariants();
  bootstrapRegionPower(playerEntity.factionRep, { regionConditions: playerEntity.regionConditions });
  return playerEntity;
}

export function finishChargen(playerEntity, result, spellsByIndex = null, { rolls = Math.random } = {}) { handHeroGenderToGrammar(playerEntity);
  applyCharacter(playerEntity, result.career, result.careerIndex, result);
  if (result.firstName) setNames(playerEntity, result.firstName, result.lastName ?? '');   // BUNNYFALL: the tavern ledger's first and last name (characters/names.js)
  if (result.reflexes != null) playerEntity.reflexes = result.reflexes;
  playerEntity.backStory = [...(result.backStory ?? [])];
  applyCreationExtras(playerEntity, result, spellsByIndex, { rolls });
  playerEntity.currentLevelUpSkillSum = levelUpSkillSum(playerEntity);
  playerEntity.startingLevelUpSkillSum = playerEntity.currentLevelUpSkillSum;
  initVirtueLeveling(playerEntity, newCharacterLevelingSystem(result.levelingSystem ?? LEVELING_CLASSIC, { online: isOnlinePage() }));
  if (isLegacyChoice(result.legacyModel)) playerEntity.legacyChoice = result.legacyModel;
  return playerEntity;
}

async function loadFactions(fetchBytes) {
  try {
    const ff = new FactionFile();
    ff.load(await fetchBytes('FACTION.TXT'));
    return ff.factionDict;
  } catch (e) {
    console.warn('[chargen] FACTION.TXT unavailable, faction reputation stays parked:', e.message);
    return null;
  }
}

export async function createChargenFlow(fetchBytes, { rolls = Math.random } = {}) {
  const [careers, spellsByIndex, biogs, questionData, factionDict] = await Promise.all([
    loadCareers(fetchBytes), loadSpellIndex(fetchBytes), loadBiogs(fetchBytes),
    loadClassQuestionData(fetchBytes),
    loadFactions(fetchBytes),
  ]);
  const flow = new ChargenFlow(careers, rolls);
  flow.biogFor = (i) => biogs[i] ?? null;
  flow.questionLibrary = questionData.questionLibrary;
  flow.classesData = questionData.classesData;
  flow.factionDict = factionDict;
  return { flow, careers, spellsByIndex, biogs, factionDict };
}

export function createChargenWindow(flow, { onDone, onCancel, hudScale = 2 } = {}) {
  return withLevelingChoice(flow, { onDone, onCancel, hudScale });
}

function chargenWizard(flow, { onDone, onCancel, hudScale = 2 } = {}) {
  if (isEnhanced() && typeof document !== 'undefined') {
    return enhancedChargenOverlay(flow, { onDone, onCancel, hudScale });
  }
  return classicChargenWindow(flow, { onDone, onCancel, hudScale });
}

/** BUNNYFALL (the tavern wizard): the two questions asked after the wizard, and the answers each offers - null when it is
 *  not asked. The tavern's ledger asks them itself (ui/tavernChargen.js); the result then carries the answer and the
 *  screen below is skipped. One gate for both, so the ledger and the screens cannot disagree about what is asked. */
export function creationAsks({ online = isOnlinePage() } = {}) {
  return {
    leveling: contentOn('oblivionLeveling') && (oblivionLevelingEnabled() || online) ? levelingOptions(null, { online }) : null,
    legacy: contentOn('permadeath') && legacyOn() ? legacyModelOptions({ online }) : null,
  };
}

function withLevelingChoice(flow, { onDone, onCancel, hudScale = 2 } = {}) {
  const online = isOnlinePage();
  const { leveling, legacy } = creationAsks({ online });
  const asks = [];
  if (leveling) asks.push({ key: 'levelingSystem', make: (answer) => new LevelingChoiceScreen((id) => answer({ levelingSystem: id }), { online }) });
  if (legacy) asks.push({ key: 'legacyModel', make: (answer) => legacyModelScreen((model) => answer({ legacyModel: model })) });
  const unasked = { levelingSystem: LEVELING_CLASSIC };
  if (!asks.length) {
    return chargenWizard(flow, {
      onCancel, hudScale, onDone: (r) => onDone?.({ ...unasked, ...r }),
    });
  }
  let fired = false;
  let prompt = null;
  let stage = 0;
  let answers = { ...unasked };
  let result = null;
  const next = () => {
    while (stage < asks.length && result?.[asks[stage].key] !== undefined) { answers = { ...answers, [asks[stage].key]: result[asks[stage].key] }; stage++; }   // the tavern's ledger asked it already
    if (stage >= asks.length) { prompt = null; fired = true; onDone?.({ ...result, ...answers }); return; }
    const i = stage++;
    prompt = asks[i].make((a) => { answers = { ...answers, ...a }; next(); });
  };
  const inner = chargenWizard(flow, {
    hudScale,
    onCancel: () => { fired = true; onCancel?.(); },
    onDone: (r) => {
      if (result || fired) return;
      result = r;
      next();
    },
  });
  return {
    get flow() { return flow; },
    get isChoiceWindow() { return prompt ? false : !!inner.isChoiceWindow; },
    get done() { return fired; },
    get levelingPrompt() { return prompt; },
    input(code, ev) { if (prompt) prompt.input(code, ev); else inner.input(code, ev); },
    click(vx, vy) { if (prompt) prompt.click(vx, vy); else inner.click?.(vx, vy); },
    hover(vx, vy, e = null) { if (prompt) prompt.hover(vx, vy); else inner.hover?.(vx, vy, e); },
    release() { if (!prompt) inner.release?.(); },
    wheel(dir) { if (!prompt) inner.wheel?.(dir); },
    tick(dt) { if (!prompt) inner.tick?.(dt); },
    draw(renderer, canvas, font, scale = hudScale) {
      if (prompt) prompt.draw(renderer, canvas, font, scale);
      else inner.draw?.(renderer, canvas, font, scale);
    },
    dispose() {
      while (prompt && !fired) prompt.answer(prompt.defaultId);
      inner.dispose?.();
    },
  };
}

function classicChargenWindow(flow, { onDone, onCancel, hudScale = 2 } = {}) {
  let _fired = false;
  return {
    flow,
    isChoiceWindow: true,
    get done() { return flow.done; },
    input(code, ev) {
      if (_fired) return;
      const kev = ev ?? { key: codeToKey(code) };
      const a = overlayAction(kev);
      if (a) flow.input(a, kev);
      if (flow.cancelled) { _fired = true; onCancel?.(); return; }
      if (flow.done) { _fired = true; onDone?.(flow.result()); }
    },
    click(vx, vy) {
      if (_fired) return;
      flow.clickNative(vx, vy);
      if (flow.cancelled) { _fired = true; onCancel?.(); return; }
      if (flow.done) { _fired = true; onDone?.(flow.result()); }
    },
    hover(vx, vy, e = null) { if (!_fired) flow.hover?.(vx, vy, e); },
    release() { if (!_fired) flow.releasePickBar?.(); },
    wheel(dir) { if (!_fired) flow.wheel?.(dir); },
    tick(dt) { flow.tick?.(dt); },
    draw(renderer, canvas, font, scale = hudScale) { flow.draw(renderer, canvas, font, scale); },
  };
}

function enhancedChargenOverlay(flow, { onDone, onCancel, hudScale = 2 } = {}) {
  let fired = false;
  let view = null;
  let fallback = null;
  const finish = (why) => {
    if (fired) return;
    fired = true;
    view?.unmount();
    view = null;
    if (why === 'cancel') onCancel?.();
    else onDone?.({ ...flow.result(), ...(flow.tavernAnswers ?? {}) });   // BUNNYFALL: the tavern ledger's names and answers ride the result
  };
  const host = document.createElement('div');
  host.id = 'enhanced-chargen';
  host.style.cssText = 'position:fixed;inset:0;z-index:14;background:#0e1013;overflow:hidden';
  document.body.append(host);
  import('../ui/enhancedChargen.js').then(async ({ mountEnhancedChargen, attachChargenText }) => {
    const deps = await chargenViewDeps();
    attachChargenText(flow, deps.textRsc);
    view = mountEnhancedChargen(host, { flow, ...deps, onExit: finish });
    view.unmount = ((inner) => () => { inner(); host.remove(); })(view.unmount);
  }).catch((e) => {
    console.warn('[chargen] the enhanced wizard would not mount - the classic wizard takes over', e);
    host.remove();
    fallback = classicChargenWindow(flow, {
      hudScale,
      onDone: (r) => { fired = true; onDone?.(r); },
      onCancel: () => { fired = true; onCancel?.(); },
    });
  });
  return {
    flow,
    isChoiceWindow: true,
    get done() { return fired; },
    input(code, ev) { fallback?.input(code, ev); },
    click(vx, vy) { fallback?.click(vx, vy); },
    hover(vx, vy, e = null) { fallback?.hover(vx, vy, e); },
    release() { fallback?.release(); },
    wheel(dir) { fallback?.wheel(dir); },
    tick(dt) { fallback?.tick(dt); },
    draw(renderer, canvas, font, scale) { fallback?.draw(renderer, canvas, font, scale); },
    dispose() { view?.unmount(); view = null; host.remove(); },
  };
}

async function chargenViewDeps() {
  const out = { picker: null, picture: null, palette: null, loadFaces: null, textRsc: null };
  const [{ ImgFile }, { DFPalette }, { TextRsc }, { loadFaceCanvases }] =
    await Promise.all([
      import('../formats/imgFile.js'), import('../formats/dfPalette.js'),
      import('../formats/textRsc.js'), import('../ui/facePortrait.js'),
    ]);
  const { getBytes } = await import('../scenes/dataSource.js');
  const img = async (name) => {
    const f = new ImgFile();
    f.load(await getBytes(name), name, new DFPalette());
    return f.getDFBitmap(0, 0);
  };
  try { out.textRsc = new TextRsc().load(await getBytes('TEXT.RSC')); }
  catch (e) { console.warn('[chargen] TEXT.RSC unavailable; descriptions stay empty', e); }
  try {
    const pal = new DFPalette();
    pal.load(await getBytes('ART_PAL.COL'), 'ART_PAL.COL');
    const rgb = (i) => { const c = pal.get(i); return [c.r, c.g, c.b]; };
    out.palette = rgb;
    out.picker = await img('TAMRIEL2.IMG');
    try { out.picture = await img('TMAP00I0.IMG'); }
    catch (e) { console.warn('[chargen] TMAP00I0 unavailable; the Imperial Province is absent', e); }
    out.loadFaces = (raceKey, gender) => loadFaceCanvases(raceKey, gender, { scale: 2 });
  } catch (e) {
    console.warn('[chargen] the map art is unavailable; the homelands fall to a list', e);
  }
  return out;
}

function codeToKey(code) {
  if (typeof code !== 'string') return '';
  if (code.startsWith('Key')) return code.slice(3).toLowerCase();
  if (code.startsWith('Digit')) return code.slice(5);
  return ({
    ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', Enter: 'Enter',
    Backspace: 'Backspace', Escape: 'Escape', Space: ' ',
    Equal: '=', Minus: '-', NumpadAdd: '+', NumpadSubtract: '-',
  })[code] ?? '';
}

export { handHeroGenderToGrammar };
