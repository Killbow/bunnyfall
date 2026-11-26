import assert from 'node:assert/strict';
import test from 'node:test';

// A small DOM: enough elements, events and hit-testing for the Abilities page and the hotbar's drop path.
function fakeDom() {
  const listeners = new Map();
  const matches = (n, sel) => {
    const m = /^\.([\w-]+)(?:\[data-(\w+)="([^"]*)"\])?$/.exec(sel);
    return !!m && n.className.split(/\s+/).includes(m[1]) && (!m[2] || n.dataset[m[2]] === m[3]);
  };
  const all = (n) => n.children.flatMap(c => [c, ...all(c)]);
  const node = (tagName) => {
    const n = {
      tagName: tagName.toUpperCase(), children: [], parentNode: null, className: '', textContent: '', hidden: false,
      attributes: {}, dataset: {}, style: { setProperty() {} }, events: {},
      setAttribute(k, v) { this.attributes[k] = String(v); },
      getAttribute(k) { return this.attributes[k] ?? null; },
      removeAttribute(k) { delete this.attributes[k]; },
      append(...kids) { for (const k of kids) { k.parentNode = this; this.children.push(k); } },
      prepend(...kids) { for (const k of kids) { k.parentNode = this; this.children.unshift(k); } },
      replaceChildren(...kids) { this.children = []; this.append(...kids); },
      remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(c => c !== this); },
      addEventListener(type, fn) { (this.events[type] ??= []).push(fn); },
      removeEventListener() {},
      contains(other) { for (let p = other; p; p = p.parentNode) if (p === this) return true; return false; },
      closest(sel) { for (let p = this; p && p.className != null; p = p.parentNode) if (matches(p, sel)) return p; return null; },
      querySelector(sel) { return all(this).find(c => matches(c, sel)) ?? null; },
      querySelectorAll(sel) { return all(this).filter(c => matches(c, sel)); },
      focus() { doc.activeElement = this; },
      scrollIntoView() { doc.scrolled.push(this); },
      getBoundingClientRect: () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }),
    };
    n.classList = {
      toggle(c, on) { const has = n.className.split(/\s+/).includes(c); if (on ?? !has) this.add(c); else this.remove(c); },
      add(c) { n.className = [...new Set([...n.className.split(/\s+/).filter(Boolean), c])].join(' '); },
      remove(c) { n.className = n.className.split(/\s+/).filter(x => x && x !== c).join(' '); },
      contains: (c) => n.className.split(/\s+/).includes(c),
    };
    return n;
  };
  const doc = {
    scrolled: [], activeElement: null, pointed: null,
    createElement: node,
    getElementById: () => ({}),
    elementFromPoint() { return doc.pointed; },
    addEventListener() {}, removeEventListener() {},
  };
  doc.head = node('head');
  doc.body = node('body');
  const win = {
    addEventListener(type, fn) { (listeners.get(type) ?? listeners.set(type, []).get(type)).push(fn); },
    removeEventListener(type, fn) { listeners.set(type, (listeners.get(type) ?? []).filter(f => f !== fn)); },
    fire(type, e) { for (const fn of [...(listeners.get(type) ?? [])]) fn(e); },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
  };
  return { doc, win, all };
}

const dom = fakeDom();
globalThis.document = dom.doc;
globalThis.requestAnimationFrame = (fn) => { fn(); return 0; };
globalThis.location = { search: '?abilities' };

const { SKILLS } = await import('../src/characters/skills.js');
const { restoreAbilityProgress, syncAbilityUnlocks } = await import('../src/combat/abilities/progress.js');
const { buildAbilityCodex, resetAbilityCodex } = await import('../src/ui/abilityCodex.js');
const { hotbarEntry, hotbarEntryForAbility, hotbarEntryForWeaponRank, clearHotbarSlot } = await import('../src/items/quickslots.js');
const hotbar = await import('../src/ui/enhancedHotbar.js');
const { setPref } = await import('../src/ui/uiPrefs.js');
// Set after the imports: a module that sees a window at load time reads browser-only bundler globals.
globalThis.window = dom.win;

function daggerUser() {
  const entity = { isPlayer: true, race: 'Breton', skills: [], items: [], health: 100, fatigue: 100,
    stats: { strength: 50, endurance: 50, agility: 50, luck: 50, speed: 50, willpower: 50 } };
  entity.skills[SKILLS.ShortBlade] = 30;
  restoreAbilityProgress(entity, null, true);
  syncAbilityUnlocks(entity);
  return entity;
}
const VEIL_CUT = 'weapon.dagger.veil-cut';
const rowOf = (panel, name) => dom.all(panel).find(n => n.className.includes('sb-arow')
  && n.children.some(c => c.textContent === name));
const buttonText = (panel, text) => dom.all(panel).find(n => n.tagName === 'BUTTON' && n.textContent.startsWith(text));

test('a row pointed at with a slot key binds what the binding buttons chose, as a tile click does', () => {
  resetAbilityCodex();
  const panel = buildAbilityCodex(daggerUser(), 10);
  const row = rowOf(panel, 'Veil Cut');
  row.onclick();
  assert.equal(row._hotbarEntry.type, hotbarEntryForWeaponRank(25).type);
  buttonText(panel, 'This ability').onclick();
  assert.deepEqual(row._hotbarEntry, hotbarEntryForAbility(VEIL_CUT));
  assert.equal(dom.doc.activeElement?.textContent, 'This ability', 'focus stays on the pressed button');
  dom.doc.pointed = row.children[1];
  assert.deepEqual(hotbar.hotbarPointedThing({ x: 1, y: 1 }), { kind: 'entry', entry: hotbarEntryForAbility(VEIL_CUT) });
  buttonText(panel, 'Follow active weapon').onclick();
});

test('a repaint keeps the rail where it was; only a fresh open shows the pick', () => {
  resetAbilityCodex();
  dom.doc.scrolled.length = 0;
  buildAbilityCodex(daggerUser(), 10);
  assert.equal(dom.doc.scrolled.length, 1);
  buildAbilityCodex(daggerUser(), 10);
  assert.equal(dom.doc.scrolled.length, 1, 'a repaint does not scroll the list');
});

test('a learned row drags onto the hotbar as an entry and the book repaints its tiles', () => {
  setPref(hotbar.HOTBAR_PREF, 'hotbar');
  const entity = daggerUser();
  let changed = 0;
  hotbar.setHotbarDropMode('book', true, entity);
  hotbar.setHotbarPick('book', { selected: () => null, changed: () => { changed++; } });
  try {
    assert.ok(hotbar.hotbarAcceptsDrops());
    clearHotbarSlot(3);
    resetAbilityCodex();
    const panel = buildAbilityCodex(entity, 10);
    const row = rowOf(panel, 'Veil Cut');
    buttonText(panel, 'This ability')?.onclick();
    row.onpointerdown({ pointerId: 7, button: 0, pointerType: 'mouse', clientX: 10, clientY: 10 });
    const slot = dom.all(dom.doc.body).find(n => n.dataset.slot === '3');
    assert.ok(slot, 'the bar is up');
    dom.doc.pointed = slot;
    dom.win.fire('pointermove', { pointerId: 7, clientX: 60, clientY: 60, preventDefault() {} });
    dom.win.fire('pointerup', { pointerId: 7, clientX: 60, clientY: 60, preventDefault() {} });
    assert.deepEqual(hotbarEntry(3), hotbarEntryForAbility(VEIL_CUT));
    assert.ok(changed > 0, 'the open window hears the slot changed');
    assert.ok(hotbar.takeHotbarDragClick(), 'the click the release raises is not a pick');
  } finally {
    clearHotbarSlot(3);
    hotbar.setHotbarDropMode('book', false);
  }
});

test("other races' racial abilities are not counted as unlocks and say whose they are", () => {
  resetAbilityCodex();
  const panel = buildAbilityCodex(daggerUser(), 10);
  const count = dom.all(panel).find(n => n.className === 'sb-rail-count').textContent;
  const [, total] = count.match(/\/ (\d+) learned/);
  const racialFold = dom.all(panel).find(n => n.tagName === 'SUMMARY' && n.children[0].textContent === 'Racial abilities');
  assert.equal(racialFold.children[1].textContent.split('/')[1], '1');
  const nord = dom.all(panel).find(n => n.className.includes('sb-arow') && n.children[2]?.textContent === 'Nord');
  nord.onclick();
  assert.ok(dom.all(panel).some(n => n.textContent === 'Only for Nord.'));
  assert.ok(Number(total) < 145);
});
