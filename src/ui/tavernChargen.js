// @ts-check
// BUNNYFALL (2026-11-27, the owner: "Nyx sit behind a desk and tell the players the steps, tilting camera to the right to
// choose race, to the left to choose background and then a page gets slid on the desk and with a zoom in we look at the
// class creation"): THE TAVERN WIZARD, the enhanced character creation's face. Nyx keeps her desk in the magic tavern hall;
// the camera turns RIGHT to the patrons (homeland, then the one you chose stepping closer: sex, face and your own paperdoll),
// down to her DESK (how you find your class, then the page: the list, the questions or your own), LEFT to the windows
// (your history), down to the PAGE again (attributes, skills, reflexes) and to her LEDGER (your name and signature).
//
// A VIEW, like the wizard it dresses (ui/enhancedChargen.js): it reads ChargenFlow and speaks back through applyHit and
// input, so the wizard's laws stay in ui/chargen.js. Two of its stages are TAKEN EARLIER or LATER than the flow walks them,
// by the view alone: the FACE is picked with the sex (and handed to the flow when it reaches its face screen), and the NAME
// is written in the ledger (the flow's name screen is passed with a suggested name, and the ledger's name goes in as the
// summary's own name). `skipHidden` is that hand-off; it walks back through the two screens the same way.
//
// The hall is the user's painting (public/art/bunnyfall-tavern) moved by a CSS camera for now; the 3D hall takes its place
// behind the same stages later.
import { APP_ROOT } from '../platform/appRoot.js';
import { PIXEL_STACK } from './pixelifyFive.js';
import { t } from './textManager.js';
import { PLAYABLE_RACE_TEMPLATES } from '../characters/races.js';
import { raceDisplayName } from '../talk/talkSession.js';
import { facesFor } from '../characters/roxArgonians.js';
import { storedSession, serviceBase } from '../net/accountClient.js';
import { appStorage } from '../platform/appStorage.js';
import { mountSkinsPanel } from './skinsPanel.js';
import { AccountFlow } from './accountFlow.js';
import { accountCard } from './enhancedAccount.js';
import { creationAsks } from '../characters/chargenSession.js';
import { NAME_MAX_CHARACTERS } from './chargen.js';
import { cleanNamePart, fullName } from '../characters/names.js';

const art = (/** @type {string} */ f) => new URL(`art/${f}`, APP_ROOT).href;
const HEAD = `'Jacquard 12', ${PIXEL_STACK}`;

/** Where the camera looks for each of the flow's states. */
const CAMERA = Object.freeze({
  race: 'right', gender: 'close',
  classMethod: 'desk', class: 'page', classQuestions: 'page', customClass: 'page',
  bioMethod: 'left', biography: 'left',
  name: 'desk', face: 'desk',
  stats: 'page', skills: 'page', reflexes: 'page',
  summary: 'ledger',
});
/** The journey a player reads at the top: five words for fourteen screens. */
const JOURNEY = Object.freeze([
  { label: () => t('chargen.tavern.stepHome', 'Homeland'), states: ['race', 'gender'] },
  { label: () => t('chargen.tavern.stepClass', 'Class'), states: ['classMethod', 'class', 'classQuestions', 'customClass'] },
  { label: () => t('chargen.tavern.stepHistory', 'History'), states: ['bioMethod', 'biography', 'name', 'face'] },
  { label: () => t('chargen.tavern.stepSheet', 'Sheet'), states: ['stats', 'skills', 'reflexes'] },
  { label: () => t('chargen.tavern.stepSign', 'Signature'), states: ['summary'] },
]);
/** What Nyx says, by state. */
const NYX = Object.freeze({
  race: () => t('chargen.tavern.nyxRace', "Everyone at my bar came here from somewhere. Point at the one you most resemble, and I'll tell you what their people are known for."),
  raceConfirm: () => t('chargen.tavern.nyxRaceConfirm', "Here's what I know of them. Is that you?"),
  gender: () => t('chargen.tavern.nyxLook', 'Come into the light. Let me get a proper look at you.'),
  classMethod: () => t('chargen.tavern.nyxMethod', 'Now, what do you do for a living? Take whichever page suits you.'),
  class: () => t('chargen.tavern.nyxList', "My list. Pick what fits, and I'll read it out to you."),
  classQuestions: () => t('chargen.tavern.nyxQuiz', "Answer honestly. I'll know if you don't."),
  customClass: () => t('chargen.tavern.nyxCustom', 'Your own trade, then. Write it down carefully.'),
  bioMethod: () => t('chargen.tavern.nyxBio', "Tell me where you came from. Or I can guess, if you'd rather."),
  biography: () => t('chargen.tavern.nyxBioAsk', "Go on, I'm listening."),
  stats: () => t('chargen.tavern.nyxStats', "Let's see what you're made of."),
  skills: () => t('chargen.tavern.nyxSkills', "And what you're good at."),
  reflexes: () => t('chargen.tavern.nyxReflexes', 'How quick are you on your feet?'),
  summary: () => t('chargen.tavern.nyxSign', 'Read it over. Once you sign, the Bay knows your name.'),
});

/** The states the view hands to the flow on the player's behalf (see the head). */
const HIDDEN = Object.freeze(['name', 'face']);
const ORDER = ['race', 'gender', 'classMethod', 'classQuestions', 'class', 'customClass', 'bioMethod', 'biography', 'name', 'face', 'stats', 'skills', 'reflexes', 'summary', 'done'];

/** The view's own memory across repaints: the early face, the ledger's names and answers, the panel tabs. */
export function tavernMemory() {
  return { last: 'race', face: 0, faceFor: '', sex: null, lookTab: 'game', first: '', last_: '', leveling: null, legacy: null, account: null, faces: new Map() };
}

/**
 * THE HAND-OFF. Called before every paint: on a screen the view does not show, answer it for the player - forward with the
 * face picked early (and a suggested name the ledger replaces), or, when the player is walking BACK, keep walking back.
 * @returns {boolean} true when the flow moved and the caller should look again
 */
export function skipHidden(flow, mem) {
  const back = ORDER.indexOf(flow.state) < ORDER.indexOf(mem.last);
  if (!HIDDEN.includes(flow.state)) { mem.last = flow.state; return false; }
  if (back) { flow.input('back'); return true; }   // keep walking back: mem.last stays the later screen until a shown one is reached
  if (flow.state === 'name') {
    if (!flow.name) flow.applyHit({ randomName: true });
    if (!flow.name) flow.input('char:A');
    flow.input('confirm');
  } else {
    const n = facesFor(flow.race?.key) || 1;
    flow.facePick = Math.max(0, Math.min(n - 1, mem.face | 0));
    flow.input('confirm');
  }
  mem.last = flow.state;
  return true;
}

let styled = false;
function ensureStyle(doc) {
  if (styled && doc.getElementById('bf-tavern-chargen')) return;
  styled = true;
  const s = doc.createElement('style');
  s.id = 'bf-tavern-chargen';
  s.textContent = CSS;
  doc.head.append(s);
}

const el = (doc, tag, cls = '', text = null) => { const n = doc.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const btn = (doc, cls, text, onClick) => { const b = /** @type {HTMLButtonElement} */ (el(doc, 'button', cls, text)); b.type = 'button'; b.onclick = (e) => { if (e?.detail > 1) return; onClick(); }; return b; };

/** The hall, built once per wizard and kept across repaints so the camera can glide between shots. */
export function tavernBackdrop(doc, { in3d = false } = {}) {
  ensureStyle(doc);
  const root = el(doc, 'div', `tc-hall${in3d ? ' in3d' : ''}`);   // in3d: Nyx's 3D hall draws the room; the painting and its Nyx stand down, the desk stays
  root.setAttribute('aria-hidden', 'true');
  const img = /** @type {HTMLImageElement} */ (el(doc, 'img', 'tc-bg'));
  img.src = art('bunnyfall-tavern/tavern.webp'); img.alt = ''; img.draggable = false;
  const nyx = /** @type {HTMLImageElement} */ (el(doc, 'img', 'tc-nyx'));
  nyx.src = art('bunnyfall-npcs/nyx.png'); nyx.alt = ''; nyx.draggable = false;
  const desk = el(doc, 'div', 'tc-desk');
  for (const c of ['tc-candle', 'tc-flame', 'tc-book', 'tc-pages', 'tc-inkwell']) desk.append(el(doc, 'i', c));
  const quill = /** @type {HTMLImageElement} */ (el(doc, 'img', 'tc-quill'));
  quill.src = art('bunnyfall-decor/feather.png'); quill.alt = '';
  desk.append(quill);
  root.append(img, el(doc, 'div', 'tc-glow'), nyx, desk, el(doc, 'div', 'tc-wood'), el(doc, 'div', 'tc-shade'));
  // the svg filter that tears every parchment edge
  const defs = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  defs.setAttribute('width', '0'); defs.setAttribute('height', '0'); defs.setAttribute('style', 'position:absolute');
  defs.innerHTML = '<defs><filter id="tc-rough" x="-5%" y="-10%" width="110%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.05 0.07" numOctaves="3" seed="11" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="6" xChannelSelector="R" yChannelSelector="G"/></filter></defs>';
  root.append(defs);
  return root;
}

/** Point the camera for this state. */
export function aimCamera(hall, flow, ctx = null) {
  const cam = CAMERA[flow.state] ?? 'desk';
  hall.dataset.cam = cam;
  ctx?.hall?.aim?.(cam, { race: flow.race?.key });   // the 3D hall's camera, when there is one
}

/** The journey along the top, and Nyx's line. */
export function tavernChrome(doc, flow) {
  const frag = doc.createDocumentFragment();
  const nav = el(doc, 'nav', 'tc-journey');
  nav.setAttribute('aria-label', t('chargen.tavern.journey', 'Character creation steps'));
  const here = JOURNEY.findIndex((s) => s.states.includes(flow.state));
  JOURNEY.forEach((s, i) => {
    const w = el(doc, 'span', `tc-step${i === here ? ' on' : i < here ? ' done' : ''}`, s.label());
    if (i === here) w.setAttribute('aria-current', 'step');
    nav.append(w);
  });
  frag.append(nav);
  const say = flow.state === 'race' && flow.raceConfirm ? NYX.raceConfirm : NYX[flow.state];
  if (say) {
    const box = el(doc, 'section', `tc-say tc-say-${CAMERA[flow.state] ?? 'desk'}`);
    box.setAttribute('aria-label', t('chargen.tavern.nyxSpeaks', 'Nyx speaks'));
    box.append(el(doc, 'span', 'tc-who', 'Nyx'), el(doc, 'p', null, say()));
    frag.append(box);
  }
  return frag;
}

// ── THE STAGES THE TAVERN DRAWS ITSELF ─────────────────────────────

/** A face set, cached per race and sex: copies, since a canvas drawn in two places moves to the second. */
function faceSet(ctx, raceKey, sex) {
  const key = `${raceKey}|${sex}`;
  const m = ctx.mem.faces;
  if (!m.has(key) && ctx.loadFaces) {
    m.set(key, null);
    Promise.resolve(ctx.loadFaces(raceKey, sex)).then((set) => { m.set(key, set ?? []); ctx.paint(); }).catch(() => m.set(key, []));
  }
  return m.get(key) ?? null;
}
function copyCanvas(doc, c) {
  if (!c) return null;
  const n = /** @type {HTMLCanvasElement} */ (doc.createElement('canvas'));
  n.width = c.width; n.height = c.height;
  n.getContext('2d')?.drawImage(c, 0, 0);
  return n;
}

/** HOMELAND: the patrons, one per people. A press asks the flow (setRace) and the people's card answers. */
export function raceStage(ctx) {
  const { doc, flow } = ctx;
  const pane = el(doc, 'div', 'tc-stage tc-race');
  const row = el(doc, 'div', 'tc-patrons');
  row.setAttribute('role', 'group');
  row.setAttribute('aria-label', t('chargen.tavern.patrons', 'The patrons'));
  if (ctx.hall) row.classList.add('in3d');
  for (const race of PLAYABLE_RACE_TEMPLATES) {
    const on = flow.raceConfirm && flow.race?.key === race.key;
    const b = btn(doc, `tc-patron${on ? ' on' : ''}`, null, () => {
      flow.applyHit({ setRace: race.key, describe: flow.describeRace?.(race) ?? null });
      if (flow.state !== 'race') ctx.mem.last = flow.state;
      ctx.paint();
    });
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (ctx.hall) {
      // the patron stands in the hall: the people's own paperdoll, placed by the hall's frame where their spot projects
      b.classList.add('tc-in3d');
      b.dataset.race = race.key;
      const fig = ctx.hall.body(race.key, 'male', 0);
      b.append(fig ?? el(doc, 'span', 'tc-figwait'), el(doc, 'span', 'tc-plate', raceDisplayName(race.key)));
      b.style.visibility = 'hidden';
      row.append(b);
      continue;
    }
    const frame = el(doc, 'span', 'tc-portrait');
    const set = faceSet(ctx, race.key, 'male');
    const face = copyCanvas(doc, set?.[0]);
    if (face) frame.append(face); else frame.append(el(doc, 'span', 'tc-noface', raceDisplayName(race.key).slice(0, 1)));
    b.append(frame, el(doc, 'span', 'tc-plate', raceDisplayName(race.key)));
    row.append(b);
  }
  pane.append(row);
  if (flow.raceConfirm) {
    const card = el(doc, 'section', 'tc-panel tc-racecard');
    card.append(el(doc, 'h2', 'tc-h', raceDisplayName(flow.race.key)));
    const body = el(doc, 'div', 'tc-scroll');
    let para = [];
    const flush = () => { if (para.length) { body.append(el(doc, 'p', null, para.join(' '))); para = []; } };
    for (const line of flow.raceConfirm) { const x = (typeof line === 'string' ? line : line?.text) ?? ''; if (x.trim()) para.push(x.trim()); else flush(); }
    flush();
    card.append(body);
    const acts = el(doc, 'div', 'tc-acts');
    acts.append(
      btn(doc, 'tc-parch gold', t('chargen.tavern.thatsThem', 'I am one of them'), () => { flow.applyHit({ confirmRace: true }); ctx.mem.sex = null; ctx.paint(); }),
      btn(doc, 'tc-parch', t('chargen.tavern.chooseAgain', 'Choose again'), () => { flow.applyHit({ cancelRace: true }); ctx.paint(); }),
    );
    card.append(acts);
    pane.append(card);
  }
  return pane;
}

/** THE PATRON STEPS CLOSER: sex and face (both held by the view until "That's me"), or your own paperdoll. */
export function appearanceStage(ctx) {
  const { doc, flow, mem } = ctx;
  if (!mem.sex) mem.sex = flow.gender ?? 'male';
  const want = `${flow.race.key}|${mem.sex}`;
  if (mem.faceFor !== want) { mem.faceFor = want; mem.face = 0; }
  const count = facesFor(flow.race?.key) || 1;
  const set = faceSet(ctx, flow.race.key, mem.sex);
  const pane = el(doc, 'div', 'tc-stage tc-look');

  if (ctx.hall) {
    // the one you chose, close, in the hall: their paperdoll with this sex and face (placed by the hall's frame)
    const fig = el(doc, 'div', 'tc-in3d tc-chosen');
    fig.dataset.race = flow.race.key;
    fig.style.visibility = 'hidden';
    fig.append(ctx.hall.body(flow.race.key, mem.sex, mem.face) ?? el(doc, 'span', 'tc-figwait'));
    pane.append(fig);
    const small = el(doc, 'div', 'tc-faceframe');
    const face = copyCanvas(doc, set?.[mem.face]);
    if (face) { small.append(face); }
    pane.append(small);
  } else {
    const big = el(doc, 'div', 'tc-bigface');
    const face = copyCanvas(doc, set?.[mem.face]);
    if (face) big.append(face); else big.append(el(doc, 'span', 'tc-noface', raceDisplayName(flow.race.key)));
    pane.append(big);
  }

  const card = el(doc, 'section', 'tc-panel tc-lookcard');
  card.append(el(doc, 'h2', 'tc-h', raceDisplayName(flow.race.key)));
  const tabs = el(doc, 'div', 'tc-tabs');
  tabs.setAttribute('role', 'tablist');
  for (const [id, label] of [['game', t('chargen.tavern.tabGame', "The game's look")], ['own', t('chargen.tavern.tabOwn', 'My own paperdoll')]]) {
    const b = btn(doc, `tc-tab${mem.lookTab === id ? ' on' : ''}`, label, () => { mem.lookTab = id; ctx.paint(); });
    b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', mem.lookTab === id ? 'true' : 'false');
    tabs.append(b);
  }
  card.append(tabs);

  if (mem.lookTab === 'own') card.append(ownPaperdoll(ctx));
  else {
    card.append(el(doc, 'span', 'tc-lbl', t('chargen.tavern.sex', 'Sex')));
    const sexes = el(doc, 'div', 'tc-two');
    for (const [key, label] of [['male', t('chargen.tavern.male', 'Male')], ['female', t('chargen.tavern.female', 'Female')]]) {
      const b = btn(doc, `tc-parch${mem.sex === key ? ' gold' : ''}`, label, () => { mem.sex = key; ctx.paint(); });
      b.setAttribute('aria-pressed', mem.sex === key ? 'true' : 'false');
      sexes.append(b);
    }
    card.append(sexes, el(doc, 'span', 'tc-lbl', t('chargen.tavern.face', 'Face')));
    const pick = el(doc, 'div', 'tc-facepick');
    const step = (d) => () => { mem.face = (mem.face + d + count) % count; ctx.paint(); };
    const prev = btn(doc, 'tc-parch tc-sq', '‹', step(-1)); prev.setAttribute('aria-label', t('chargen.tavern.prevFace', 'Previous face'));
    const next = btn(doc, 'tc-parch tc-sq', '›', step(1)); next.setAttribute('aria-label', t('chargen.tavern.nextFace', 'Next face'));
    pick.append(prev, el(doc, 'span', 'tc-count', t('chargen.tavern.faceOf', 'Face {n} of {m}', { n: mem.face + 1, m: count })), next);
    card.append(pick);
  }
  card.append(btn(doc, 'tc-parch gold tc-wide', t('chargen.tavern.thatsMe', "That's me"), () => { flow.applyHit({ setGender: mem.sex }); ctx.paint(); }));
  pane.append(card);
  return pane;
}

/** The own-paperdoll tab: the skins page's own panel when signed in, else the way in. */
function ownPaperdoll(ctx) {
  const { doc, mem } = ctx;
  const box = el(doc, 'div', 'tc-own');
  const session = storedSession(appStorage());
  if (!session) {
    box.append(el(doc, 'p', 'tc-own-h', t('chargen.tavern.signInHead', 'Sign in to wear your own paperdoll')));
    box.append(el(doc, 'p', null, t('chargen.tavern.signInWhy', 'Custom paperdolls belong to your account, so other players can see them online. Sign in and you come straight back here, with everything you have chosen so far.')));
    const two = el(doc, 'div', 'tc-two');
    two.append(btn(doc, 'tc-parch gold', t('chargen.tavern.signIn', 'Sign in'), () => { mem.account = 'open'; ctx.paint(); }));
    box.append(two);
    box.append(el(doc, 'p', 'tc-note', t('chargen.tavern.later', "Or keep going with the game's look: you can upload one later from the main menu.")));
    return box;
  }
  box.append(el(doc, 'p', 'tc-note', t('chargen.tavern.ownWhy', 'Upload your own paperdoll and other players see it online once staff approve it. Until then you wear the look on the other tab.')));
  const panel = el(doc, 'div', 'tc-skins');
  const io = () => ({ fetch: (...a) => globalThis.fetch(.../** @type {[any, any]} */ (a)), base: serviceBase(appStorage()), secret: session.secret });
  mountSkinsPanel(panel, { io, manage: true });
  box.append(panel);
  return box;
}

/** The account window over the wizard, for the paperdoll tab's Sign in. Closing it comes back to the same screen. */
export function accountLayer(ctx) {
  const { doc, mem } = ctx;
  if (mem.account !== 'open') return null;
  const layer = el(doc, 'div', 'tc-acct');
  const win = el(doc, 'div', 'px-win px-acctwin');
  const flowA = AccountFlow({ io: { fetch: (...a) => globalThis.fetch(.../** @type {[any, any]} */ (a)), base: serviceBase(appStorage()) }, storage: appStorage(), onChange: () => card?.paint?.() });
  const close = () => { mem.account = null; ctx.paint(); };
  const card = accountCard(doc, flowA, { onClose: close });
  win.append(card.root);
  layer.append(win);
  layer.addEventListener('click', (e) => { if (e.target === layer) close(); });
  Promise.resolve(flowA.start()).catch(() => {});
  return layer;
}

/** HOW YOU FIND YOUR CLASS: three sheets slid across the desk. */
export function classMethodStage(ctx) {
  const { doc, flow } = ctx;
  const pane = el(doc, 'div', 'tc-stage tc-sheets');
  const sheet = (head, body, foot, act) => {
    const b = btn(doc, 'tc-sheet', null, act);
    b.append(el(doc, 'span', 'tc-sheet-h', head), el(doc, 'span', 'tc-sheet-p', body), el(doc, 'span', 'tc-sheet-f', foot));
    return b;
  };
  const custom = flow.careers.length + 1;
  pane.append(
    sheet(t('chargen.tavern.listHead', 'My list'), t('chargen.tavern.listBody', 'Choose from the classes I know: the eighteen of the Bay, and the Necromancer.'), t('chargen.tavern.listFoot', 'Pick from the list'),
      () => { flow.applyHit({ classMethod: 'list' }); ctx.paint(); }),
    sheet(t('chargen.tavern.quizHead', 'My questions'), t('chargen.tavern.quizBody', 'Answer ten questions honestly, and I will tell you what you are.'), t('chargen.tavern.quizFoot', 'Nyx asks, you answer'),
      () => { flow.applyHit({ classMethod: 'questions' }); ctx.paint(); }),
    sheet(t('chargen.tavern.ownHead', 'Your own'), t('chargen.tavern.ownBody', 'Write a class of your own: its skills, its gifts and its flaws.'), t('chargen.tavern.ownFoot', 'Make a custom class'),
      () => { flow.applyHit({ classMethod: 'list' }); const now = flow._now(); flow.clickClassRow(custom, now); flow.clickClassRow(custom, now + 1); ctx.paint(); }),
  );
  return pane;
}

/** HOW NYX LEARNS YOUR PAST: tell her, or let her write it. */
export function bioMethodStage(ctx) {
  const { doc, flow } = ctx;
  const pane = el(doc, 'div', 'tc-stage tc-biomethod');
  const card = el(doc, 'section', 'tc-panel');
  card.append(el(doc, 'h2', 'tc-h', t('chargen.tavern.bioHead', 'Your past')));
  card.append(el(doc, 'p', null, t('chargen.tavern.bioWhy', 'Your answers shape who knows you in the Bay, and what you carry.')));
  const two = el(doc, 'div', 'tc-two');
  two.append(
    btn(doc, 'tc-parch gold', t('chargen.tavern.bioTell', 'Tell Nyx yourself'), () => { flow.applyHit({ bioMethod: 'questions' }); ctx.paint(); }),
    btn(doc, 'tc-parch', t('chargen.tavern.bioGuess', 'Let Nyx write it'), () => { flow.applyHit({ bioMethod: 'generate' }); ctx.paint(); }),
  );
  card.append(two);
  pane.append(card);
  return pane;
}

/**
 * THE LEDGER: the summary as the flow draws it on the left page (its steppers and its face), and on the right the name,
 * Nyx's last two questions and the signature. Signing writes the name as the summary's own and asks the flow to close.
 * @param {any} ctx @param {HTMLElement} summaryPane the wizard's own summary stage
 */
export function ledgerStage(ctx, summaryPane) {
  const { doc, flow, mem } = ctx;
  const pane = el(doc, 'div', 'tc-stage tc-ledger');
  const left = el(doc, 'section', 'tc-leaf tc-leaf-l');
  const wiz = el(doc, 'div', 'wizard tc-wiz');
  const pn = el(doc, 'div', 'pane');
  pn.append(summaryPane);
  wiz.append(pn);
  left.append(el(doc, 'h2', 'tc-h', t('chargen.tavern.written', 'Nyx has written')), wiz);
  const right = el(doc, 'section', 'tc-leaf tc-leaf-r');
  const nameRow = el(doc, 'div', 'tc-names');
  const field = (id, label, value, set) => {
    const w = el(doc, 'div', 'tc-field');
    const l = el(doc, 'label', 'tc-lbl', label); l.setAttribute('for', id);
    const i = /** @type {HTMLInputElement} */ (el(doc, 'input', 'tc-ink'));
    i.id = id; i.type = 'text'; i.value = value; i.maxLength = 20; i.autocomplete = 'off'; i.spellcheck = false;
    i.oninput = () => { set(i.value); refresh(); };
    w.append(l, i);
    return w;
  };
  nameRow.append(
    field('tc-first', t('chargen.tavern.first', 'First name'), mem.first, (v) => { mem.first = v; }),
    field('tc-last', t('chargen.tavern.last', 'Last name'), mem.last_, (v) => { mem.last_ = v; }),
  );
  right.append(el(doc, 'span', 'tc-lbl', t('chargen.tavern.nameHead', 'Your name, as it goes in the ledger')), nameRow);
  right.append(btn(doc, 'tc-parch', t('chargen.tavern.suggest', 'Suggest one'), () => {
    const before = flow.name; flow.state = 'name'; flow.applyHit({ randomName: true }); const made = flow.name; flow.name = before; flow.state = 'summary';
    const parts = made.split(/\s+/); mem.first = parts[0] ?? ''; mem.last_ = parts.slice(1).join(' '); ctx.paint();
  }));

  const asks = creationAsks();
  const choice = (head, options, key) => {
    if (!options) return;
    right.append(el(doc, 'span', 'tc-lbl', head));
    const row = el(doc, 'div', 'tc-choices');
    for (const o of options) {
      if (mem[key] == null && !o.locked) mem[key] = o.id;
      const b = btn(doc, `tc-parch${mem[key] === o.id ? ' gold' : ''}`, o.title, () => { mem[key] = o.id; ctx.paint(); });
      b.disabled = !!o.locked;
      b.title = [...(o.lines ?? []), o.lockNote ?? ''].join(' ').trim();
      b.setAttribute('aria-pressed', mem[key] === o.id ? 'true' : 'false');
      row.append(b);
    }
    right.append(row);
    const picked = options.find((o) => o.id === mem[key]);
    if (picked) right.append(el(doc, 'p', 'tc-note', (picked.lines ?? []).join(' ')));
  };
  choice(t('chargen.tavern.grow', 'How will you grow?'), asks.leveling, 'leveling');
  choice(t('chargen.tavern.line', 'Will your line endure?'), asks.legacy, 'legacy');

  const left_ = (flow.sumStatPool ?? 0) + Object.values(flow.pools ?? {}).reduce((n, v) => n + v, 0);
  const sign = btn(doc, 'tc-parch gold tc-sign', '', () => {
    const name = fullName(mem.first, mem.last_).slice(0, NAME_MAX_CHARACTERS);
    if (!cleanNamePart(mem.first)) return;
    flow.sumName = name;
    flow.tavernAnswers = {
      firstName: cleanNamePart(mem.first), lastName: cleanNamePart(mem.last_),
      ...(asks.leveling && mem.leveling != null ? { levelingSystem: mem.leveling } : {}),
      ...(asks.legacy && mem.legacy != null ? { legacyModel: mem.legacy } : {}),
    };
    flow.confirmSummary();
    if (flow.done) ctx.onExit('done'); else ctx.paint();
  });
  const refresh = () => {
    const ok = !!cleanNamePart(mem.first);
    sign.disabled = !ok;
    sign.textContent = left_ > 0 ? t('chargen.tavern.left', '{n} points left to spend', { n: left_ }) : ok ? t('chargen.tavern.sign', 'Sign and begin your life') : t('chargen.tavern.needName', 'Write your name to sign');
  };
  refresh();
  right.append(el(doc, 'div', 'tc-sigline'), sign);
  pane.append(left, right);
  return pane;
}

const CSS = `
#enhanced-chargen { background: #140b06 !important; }
.tc-root { --tc-ink:#2e160b; --tc-soft:#43250f; --tc-wax:#7a1d12; --tc-gold:#e8b030; --tc-cream:#f0e0b4; --tc-edge:#5a2a12;
  position: absolute; inset: 0; overflow: hidden; color: var(--tc-ink); font-family: ${PIXEL_STACK}; font-size: 16px; line-height: 1.45; }
.tc-root *, .tc-root *::before, .tc-root *::after { box-sizing: border-box; }
.tc-hall { position: absolute; inset: 0; overflow: hidden; background: #140b06; }
.tc-bg { position: absolute; inset: -6%; width: 112%; height: 112%; object-fit: cover; image-rendering: pixelated; transition: transform 1.1s cubic-bezier(.4,.1,.2,1), filter .9s, object-position 1.1s cubic-bezier(.4,.1,.2,1); }
.tc-glow { position: absolute; inset: 0; background: radial-gradient(ellipse 60% 55% at 50% 48%, rgba(255,150,60,.14), rgba(0,0,0,0) 70%); }
.tc-shade { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 45%, rgba(0,0,0,.82) 100%); pointer-events: none; }
.tc-nyx { position: absolute; left: 50%; top: 16vh; height: 64vh; width: auto; transform: translateX(-50%); image-rendering: auto; filter: drop-shadow(0 0 28px rgba(140,77,214,.35)); transition: opacity .7s, transform 1.1s cubic-bezier(.4,.1,.2,1); }
.tc-desk { position: absolute; left: 0; right: 0; top: 64vh; bottom: 0; background: linear-gradient(180deg, #6a3e1c 0, #55301a 2.5vh, #3e2212 40%, #2a160a 100%); clip-path: polygon(10% 0, 90% 0, 100% 100%, 0 100%); box-shadow: inset 0 3px 0 rgba(255,214,150,.3); transition: transform 1.1s cubic-bezier(.4,.1,.2,1), opacity .7s; }
.tc-desk i { position: absolute; display: block; }
.tc-candle { left: 23%; top: -9vh; width: 1.6vw; height: 9vh; background: linear-gradient(90deg, #e9d8a8, #c9b47e); border-radius: 3px; }
.tc-flame { left: calc(23% - .15vw); top: -12vh; width: 1.9vw; height: 3.4vh; background: radial-gradient(ellipse at 50% 70%, #fff1b0, #ffb347 45%, rgba(255,120,40,0) 72%); border-radius: 50%; }
.tc-book { left: 33%; top: 1.5vh; width: 17vw; height: 5vh; background: linear-gradient(180deg, #7a1d12, #561208); border: 3px solid #2e0f06; transform: skewX(-8deg); }
.tc-pages { left: 54%; top: 2.5vh; width: 14vw; height: 3.4vh; background: #d8c28a; border: 2px solid #8a6a3a; transform: rotate(-3deg); }
.tc-inkwell { left: 73%; top: -2vh; width: 3.2vw; height: 4.5vh; background: #1d1410; border: 3px solid #0b0705; border-radius: 6px 6px 10px 10px; }
.tc-quill { position: absolute; left: 74.5%; top: -10vh; width: 4.4vw; height: auto; image-rendering: pixelated; transform: rotate(18deg); }
.tc-wood { position: absolute; inset: 0; opacity: 0; background: repeating-linear-gradient(90deg, #4a2a14 0, #3e2212 6px, #4a2a14 14px, #43250f 22px); transition: opacity .8s; }
/* IN 3D: the hall's canvas shows through; the desk in front of the camera stays */
#enhanced-chargen.in3d { background: transparent !important; }
.tc-hall.in3d { background: transparent; }
.tc-hall.in3d :is(.tc-bg, .tc-nyx, .tc-wood, .tc-glow) { display: none; }
.tc-hall.in3d .tc-shade { background: radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,.55) 100%); }
.tc-hall.in3d .tc-desk { display: none; }   /* the hall has its own bar in front of Nyx */
.tc-hall.in3d[data-cam="page"] { background: rgba(10,5,2,.55); }
.tc-in3d { position: fixed; transform: translateX(-50%); pointer-events: auto; display: flex; flex-direction: column; align-items: center; padding: 0; border: 0; background: none; cursor: pointer; width: auto; }
.tc-in3d > canvas { height: 100%; width: auto; image-rendering: pixelated; filter: drop-shadow(0 6px 6px rgba(0,0,0,.6)); }
.tc-in3d .tc-plate { position: absolute; top: 100%; margin-top: 4px; }
.tc-in3d:hover > canvas, .tc-in3d:focus-visible > canvas, .tc-patron.on.tc-in3d > canvas { filter: drop-shadow(0 0 6px #e8b030) drop-shadow(0 0 2px #ffd58f); }
.tc-patron.tc-in3d { width: auto; gap: 0; }
.tc-patrons.in3d { position: fixed; inset: 0; pointer-events: none; }
.tc-figwait { display: block; width: 40px; height: 100%; }
.tc-chosen { cursor: default; pointer-events: none; }
.tc-faceframe { position: absolute; left: 32px; top: 200px; width: 120px; aspect-ratio: 4 / 5; border: 3px solid #1c1108; box-shadow: 0 0 0 2px rgba(240,224,180,.3); overflow: hidden; background: #2a160a; }
.tc-faceframe:empty { display: none; }
.tc-faceframe canvas { width: 100%; height: 100%; image-rendering: pixelated; }
/* THE CAMERA */
.tc-hall[data-cam="desk"] .tc-bg { object-position: 42% 40%; filter: blur(1.5px) brightness(.6); transform: scale(1); }
.tc-hall[data-cam="right"] .tc-bg { object-position: 100% 45%; filter: blur(1.5px) brightness(.55); transform: scale(1.12) translateX(-3%); }
.tc-hall[data-cam="close"] .tc-bg { object-position: 100% 45%; filter: blur(4px) brightness(.42); transform: scale(1.3) translateX(-4%); }
.tc-hall[data-cam="left"] .tc-bg { object-position: 0% 45%; filter: blur(1.5px) brightness(.55); transform: scale(1.12) translateX(3%); }
.tc-hall[data-cam="page"] .tc-bg, .tc-hall[data-cam="ledger"] .tc-bg { object-position: 42% 40%; filter: blur(5px) brightness(.4); transform: scale(1.25) translateY(-10%); }
.tc-hall[data-cam="right"] .tc-nyx, .tc-hall[data-cam="close"] .tc-nyx { opacity: 0; transform: translateX(-160%); }
.tc-hall[data-cam="left"] .tc-nyx { opacity: 0; transform: translateX(60%); }
.tc-hall[data-cam="page"] .tc-nyx, .tc-hall[data-cam="ledger"] .tc-nyx { opacity: .35; transform: translateX(-50%) translateY(-30vh) scale(.8); }
.tc-hall[data-cam="right"] .tc-desk, .tc-hall[data-cam="close"] .tc-desk { transform: translateX(-70%); opacity: 0; }
.tc-hall[data-cam="left"] .tc-desk { transform: translateX(70%); opacity: 0; }
.tc-hall[data-cam="page"] .tc-desk, .tc-hall[data-cam="ledger"] .tc-desk { transform: translateY(-45vh) scale(1.4); }
.tc-hall[data-cam="page"] .tc-wood { opacity: .92; }
.tc-desk i, .tc-quill { transition: opacity .5s; }
.tc-hall:is([data-cam="page"], [data-cam="ledger"]) :is(.tc-desk i, .tc-quill) { opacity: 0; }
@media (prefers-reduced-motion: reduce) { .tc-bg, .tc-nyx, .tc-desk, .tc-wood { transition: none !important; } }
/* THE CHROME */
.tc-layer { position: absolute; inset: 0; z-index: 2; }
.tc-journey { position: absolute; left: 50%; top: 18px; transform: translateX(-50%); z-index: 3; display: flex; gap: 26px; }
.tc-step { font-size: 13px; letter-spacing: .14em; text-transform: uppercase; color: var(--tc-cream); text-shadow: 2px 2px 0 rgba(10,4,1,.85); padding: 6px 2px; border-bottom: 2px solid transparent; opacity: .75; }
.tc-step.done { opacity: 1; }
.tc-step.on { color: var(--tc-gold); border-bottom-color: var(--tc-gold); opacity: 1; }
.tc-say { position: absolute; z-index: 3; width: min(640px, 44vw); padding: 20px 26px 16px; background: rgba(196,170,112,.96); border: 3px solid var(--tc-edge); box-shadow: 0 0 0 2px rgba(200,170,110,.35), 6px 6px 0 rgba(10,4,1,.6); }
.tc-say p { margin: 4px 0 0; font-size: 17px; line-height: 1.5; }
.tc-who { position: absolute; left: 20px; top: -20px; padding: 3px 14px; background: #3b1a66; border: 2px solid #8a4dd6; font-family: ${HEAD}; font-size: 26px; line-height: 1; color: #e7d2ff; }
.tc-say-desk { left: 50%; top: 70px; transform: translateX(-50%); }
.tc-say-right, .tc-say-left { left: 32px; bottom: 96px; }
.tc-say-close { left: 32px; top: 70px; width: min(360px, 30vw); }
.tc-say-page, .tc-say-ledger { left: 32px; bottom: 22px; width: min(460px, 34vw); padding: 14px 20px 10px; }
.tc-say-page p, .tc-say-ledger p { font-size: 15px; }
.tc-main { position: absolute; inset: 64px 0 0 0; z-index: 2; display: flex; flex-direction: column; min-height: 0; }
.tc-main > .tc-stage, .tc-main > .tc-pagewrap { flex: 1; min-height: 0; }
.tc-root .actionbar { position: absolute; right: 28px; bottom: 22px; z-index: 4; display: flex; gap: 12px; background: none !important; border: 0 !important; padding: 0 !important; box-shadow: none !important; }
.tc-root .actionbar .act, .tc-parch { position: relative; isolation: isolate; display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: 10px 22px; border: 0 !important; background: none !important; cursor: pointer; font-family: ${PIXEL_STACK}; font-size: 15px; letter-spacing: .12em; text-transform: uppercase; color: var(--tc-ink) !important; text-decoration: none; box-shadow: none !important; }
.tc-root .actionbar .act::before, .tc-parch::before { content: ''; position: absolute; inset: 0; z-index: -1; background: radial-gradient(ellipse at 40% 35%, #d8c28a, #c8ac72 55%, #b4945a); box-shadow: inset 0 0 12px rgba(80,35,12,.6), 3px 4px 0 rgba(20,8,2,.55); filter: url(#tc-rough); }
.tc-root .actionbar .act:hover::before, .tc-parch:hover::before, .tc-root .actionbar .act:focus-visible::before, .tc-parch:focus-visible::before { background: radial-gradient(ellipse at 40% 35%, #e6d3a0, #d9c088 55%, #c6a66a); }
.tc-root .actionbar .act.primary::before, .tc-parch.gold::before { background: radial-gradient(ellipse at 40% 35%, #ecbc3c, #d9a226 55%, #b9801f); }
.tc-root .actionbar .act:focus-visible, .tc-parch:focus-visible { outline: 3px solid var(--tc-gold); outline-offset: 4px; }
.tc-root .actionbar .act[disabled], .tc-parch[disabled] { opacity: .55; cursor: default; }
.tc-panel { position: relative; background: rgba(184,158,100,.96); border: 3px solid var(--tc-edge); box-shadow: 0 0 0 2px rgba(200,170,110,.35), 5px 5px 0 rgba(10,4,1,.6); padding: 22px 24px; display: flex; flex-direction: column; gap: 12px; }
.tc-h { margin: 0; font-family: ${HEAD}; font-weight: 400; font-size: 46px; line-height: .95; color: var(--tc-wax); }
.tc-lbl { font-size: 13px; letter-spacing: .14em; text-transform: uppercase; color: var(--tc-soft); }
.tc-note { margin: 0; font-size: 14px; line-height: 1.45; color: var(--tc-soft); }
.tc-two { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.tc-acts { display: flex; flex-direction: column; gap: 12px; }
.tc-wide { width: 100%; }
.tc-scroll { max-height: 34vh; overflow: auto; padding-right: 6px; }
.tc-scroll p { margin: 0 0 8px; }
/* HOMELAND */
.tc-race { position: relative; }
.tc-patrons { position: absolute; left: 3vw; right: 30vw; top: 22vh; display: flex; flex-wrap: wrap; align-content: flex-start; gap: 14px 10px; }
.tc-race:not(:has(.tc-racecard)) .tc-patrons { right: 3vw; justify-content: center; }
.tc-patron { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 0; border: 0; background: none; cursor: pointer; width: 104px; }
.tc-portrait { width: 96px; height: 120px; display: flex; align-items: center; justify-content: center; background: #2a160a; border: 3px solid #1c1108; box-shadow: 0 0 0 2px rgba(240,224,180,.25), 4px 4px 0 rgba(10,4,1,.6); overflow: hidden; }
.tc-portrait canvas { width: 100%; height: 100%; object-fit: cover; image-rendering: pixelated; }
.tc-noface { font-family: ${HEAD}; font-size: 40px; color: var(--tc-cream); }
.tc-plate { font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: var(--tc-cream); text-shadow: 2px 2px 0 rgba(10,4,1,.9); text-align: center; }
.tc-patron:hover .tc-portrait, .tc-patron:focus-visible .tc-portrait, .tc-patron.on .tc-portrait { border-color: var(--tc-gold); box-shadow: 0 0 0 2px var(--tc-gold), 0 0 22px rgba(232,176,48,.5); }
.tc-patron:hover .tc-plate, .tc-patron.on .tc-plate { color: var(--tc-gold); }
.tc-patron:focus-visible { outline: none; }
.tc-racecard { position: absolute; right: 3vw; top: 10vh; width: min(420px, 27vw); }
/* THE PATRON CLOSER */
.tc-look { position: relative; }
.tc-bigface { position: absolute; left: 30vw; top: 10vh; width: min(360px, 26vw); aspect-ratio: 4 / 5; display: flex; align-items: center; justify-content: center; background: #2a160a; border: 4px solid #1c1108; box-shadow: 0 0 0 3px rgba(240,224,180,.3), 0 0 40px rgba(255,170,80,.3); }
.tc-bigface canvas { width: 100%; height: 100%; object-fit: cover; image-rendering: pixelated; }
.tc-lookcard { position: absolute; right: 3vw; top: 4vh; width: min(480px, 34vw); max-height: calc(100% - 4vh - 90px); overflow: auto; }
.tc-tabs { display: flex; gap: 6px; }
.tc-tab { flex: 1; min-height: 44px; padding: 8px 10px; background: none; border: 0; border-bottom: 3px solid rgba(90,42,18,.35); cursor: pointer; font-family: ${PIXEL_STACK}; font-size: 13px; letter-spacing: .1em; text-transform: uppercase; color: var(--tc-soft); }
.tc-tab.on { color: var(--tc-wax); border-bottom-color: var(--tc-wax); }
.tc-tab:focus-visible { outline: 3px solid var(--tc-wax); outline-offset: 2px; }
.tc-facepick { display: flex; align-items: center; gap: 12px; }
.tc-sq { width: 44px; padding: 0; font-size: 22px; }
.tc-count { flex: 1; text-align: center; }
.tc-own { display: flex; flex-direction: column; gap: 12px; }
.tc-own-h { margin: 0; font-family: ${HEAD}; font-size: 30px; line-height: 1.05; }
.tc-own p { margin: 0; }
.tc-skins .bf-sk { color: var(--tc-ink); }
.tc-skins .bf-sk h3 { color: var(--tc-wax); }
.tc-skins .bf-sk .card { background: rgba(236,220,174,.5); border-color: rgba(90,42,18,.5); }
.tc-skins .bf-sk .dim { color: var(--tc-soft); }
.tc-skins .bf-sk button, .tc-skins .bf-sk input { color: var(--tc-ink); background: rgba(236,220,174,.6); border-color: rgba(90,42,18,.6); min-height: 40px; }
.tc-acct { position: absolute; inset: 0; z-index: 10; display: flex; align-items: center; justify-content: center; background: rgba(10,4,1,.6); padding: 24px; overflow: auto; }
/* THE THREE SHEETS */
.tc-sheets { display: flex; justify-content: center; align-items: flex-end; gap: 3vw; padding-bottom: 14vh; }
.tc-sheet { position: relative; isolation: isolate; width: min(330px, 26vw); min-height: 250px; padding: 26px 26px 22px; border: 0; background: none; cursor: pointer; text-align: left; display: flex; flex-direction: column; gap: 10px; color: var(--tc-ink); font-family: ${PIXEL_STACK}; transition: transform .2s; }
.tc-sheet:nth-child(1) { transform: rotate(-4deg); } .tc-sheet:nth-child(2) { transform: rotate(1deg) translateY(-10px); } .tc-sheet:nth-child(3) { transform: rotate(5deg); }
.tc-sheet::before { content: ''; position: absolute; inset: 0; z-index: -1; background: radial-gradient(ellipse at 40% 35%, #e6d3a0, #d3bc84 60%, #bf9f63); box-shadow: inset 0 0 18px rgba(80,35,12,.55), 6px 8px 0 rgba(10,4,1,.55); filter: url(#tc-rough); }
.tc-sheet:hover, .tc-sheet:focus-visible { transform: translateY(-14px) rotate(0deg); outline: none; }
.tc-sheet:focus-visible::after { content: ''; position: absolute; inset: -8px; border: 3px solid var(--tc-gold); }
.tc-sheet-h { font-family: ${HEAD}; font-size: 40px; line-height: 1; color: var(--tc-wax); }
.tc-sheet-p { font-size: 16px; line-height: 1.45; }
.tc-sheet-f { margin-top: auto; font-size: 13px; letter-spacing: .12em; text-transform: uppercase; color: var(--tc-soft); }
/* HISTORY */
.tc-biomethod { display: flex; justify-content: flex-end; align-items: flex-start; padding: 8vh 6vw 0; }
.tc-biomethod .tc-panel { width: min(620px, 46vw); }
/* THE PAGE: the wizard's own stages, laid on a sheet of parchment */
.tc-pagewrap { position: relative; margin: 12px 4vw 84px; display: flex; flex-direction: column; min-height: 0; }
.tc-root .tc-wiz { flex: 1; min-height: 0; display: flex; flex-direction: column; background: rgba(20,12,5,.84) !important; border: 3px solid #1c1108; box-shadow: 0 0 0 2px rgba(240,224,180,.2), 8px 10px 0 rgba(10,4,1,.55); overflow: hidden; }
.tc-root .tc-wiz > .pane { flex: 1; min-height: 0; overflow: auto; }
.tc-root .tc-wiz { color: var(--bone, #e9e4d9); font-size: 15px; line-height: normal; }   /* the wizard's own stages letter themselves from the page's colour, not the tavern's ink */
.tc-leaf .tc-wiz { box-shadow: none; }
/* the Grimoire look letters the wizard's desk as wood, in cream: the few words it inks for its map backdrop follow */
:root[data-plus-dress="grimoire"] .tc-root .tc-wiz :is(.detail, .dcard, .choose, .question) :is(h1, h2, h3, h4) { color: #f0e0b4 !important; text-shadow: 0 2px 0 rgba(0,0,0,.6) !important; }
:root[data-plus-dress="grimoire"] .tc-root .tc-wiz .detail :is(.acts .act, .act) { color: #f0e0b4 !important; border-color: rgba(240,224,180,.45) !important; }
:root[data-plus-dress="grimoire"] body .tc-root .tc-wiz .detail :is(.dcard .acts, .acts, *) .act.primary.primary { color: #e8b030 !important; border-color: #e8b030 !important; }
.tc-main > .tc-pagewrap.tc-askwrap { flex: 0 1 auto; align-self: flex-end; width: min(780px, 52vw); margin: 12px 4vw 90px auto; max-height: calc(100% - 102px); }
.tc-askwrap .tc-wiz { flex: 0 1 auto; }
/* THE LEDGER */
.tc-ledger { display: grid; grid-template-columns: minmax(0, 1.8fr) minmax(0, 1fr); margin: 10px 3vw 80px; isolation: isolate; position: relative; border: 4px solid #2e0f06; background: linear-gradient(180deg, #7a1d12, #561208); padding: 12px; box-shadow: 10px 12px 0 rgba(10,4,1,.55); }
.tc-leaf { position: relative; isolation: isolate; min-height: 0; overflow: auto; padding: 22px 28px; display: flex; flex-direction: column; gap: 10px; }
.tc-leaf::before { content: ''; position: absolute; inset: 0; z-index: -1; background: radial-gradient(ellipse at 40% 30%, #ecdcae, #dcc58f 60%, #c6a86c); box-shadow: inset 0 0 30px rgba(80,35,12,.45); }
.tc-leaf-l::before { box-shadow: inset -18px 0 26px -14px rgba(80,35,12,.55), inset 0 0 30px rgba(80,35,12,.45); }
.tc-leaf-l .stagebody { background: transparent !important; padding: 0 !important; }
.tc-leaf-l .reviewid .namebox { display: none; }
.tc-leaf-l .tc-wiz .stagebody { display: flex !important; flex-direction: column !important; gap: 14px; padding: 14px !important; overflow: visible !important; }
.tc-leaf-l .tc-wiz .stagebody > * { width: 100% !important; max-width: none !important; flex: none !important; }
.tc-names { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.tc-field { display: flex; flex-direction: column; gap: 4px; }
.tc-ink { width: 100%; min-height: 52px; padding: 4px; border: 0; border-bottom: 2px solid var(--tc-ink); background: transparent; font-family: ${HEAD}; font-size: 36px; color: var(--tc-ink); }
.tc-ink:focus { outline: none; border-bottom-color: var(--tc-wax); background: rgba(122,58,28,.08); }
.tc-choices { display: flex; flex-wrap: wrap; gap: 10px; }
.tc-choices .tc-parch { flex: 1 1 140px; padding: 10px 8px; font-size: 13px; }
.tc-sigline { margin-top: auto; height: 34px; border-bottom: 2px dashed var(--tc-ink); }
.tc-sign { min-height: 58px; font-size: 17px; letter-spacing: .16em; }
@media (max-width: 900px) {
  .tc-patrons { right: 3vw; top: 14vh; justify-content: center; }
  .tc-racecard, .tc-lookcard { position: relative; right: auto; top: auto; width: auto; margin: 0 3vw; }
  .tc-bigface { display: none; }
  .tc-sheets { flex-direction: column; align-items: center; padding: 20px 0 100px; overflow: auto; }
  .tc-sheet { width: 86vw; transform: none !important; }
  .tc-ledger { grid-template-columns: 1fr; overflow: auto; }
  .tc-say { width: auto; right: 16px; left: 16px !important; transform: none !important; }
  .tc-journey { gap: 10px; }
}
`;

