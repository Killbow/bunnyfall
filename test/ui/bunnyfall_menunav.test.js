// BUNNYFALL ACCESSIBILITY: the keyboard in the windows (ui/menuNav.js), and E and the click on every gathering act.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fieldKeeps, spatialNext, NAV_ROOTS } from '../../src/ui/menuNav.js';

const box = (name, left, top, width = 80, height = 30) => ({
  name, contains: (o) => o === box, getBoundingClientRect: () => ({ left, top, width, height, right: left + width, bottom: top + height }),
});

test('BUNNYFALL MENU-NAV: the arrows step to the nearest control ahead, edge to edge, never one behind or beside', () => {
  const tab = box('tab', 20, 20, 60, 30);
  const tab2 = box('tab2', 90, 20, 60, 30);
  const wide = box('wide row', 20, 70, 600, 40);   // a row far wider than the tab above it is still below it
  const offside = box('off to the side', 700, 60, 80, 30);
  const list = [tab, tab2, wide, offside];
  assert.equal(spatialNext(tab, [0, 1], list)?.name, 'wide row');
  assert.equal(spatialNext(tab, [1, 0], list)?.name, 'tab2');
  assert.equal(spatialNext(tab, [0, -1], list), null, 'nothing above: the focus stays');
  assert.equal(spatialNext(wide, [0, -1], list)?.name, 'tab', 'back up to the nearer tab');
  assert.equal(spatialNext(tab, [-1, 0], list), null);
});

test('BUNNYFALL MENU-NAV: a field keeps its own keys - typing, the caret, a slider - and Tab always walks on', () => {
  const input = (type) => ({ tagName: 'INPUT', type });
  assert.equal(fieldKeeps(input('text'), 'ArrowLeft'), true, 'the caret');
  assert.equal(fieldKeeps(input('text'), 'ArrowDown'), false, 'a line of text has no up and down');
  assert.equal(fieldKeeps(input('text'), 'Tab'), false);
  assert.equal(fieldKeeps(input('range'), 'ArrowRight'), true);
  assert.equal(fieldKeeps({ tagName: 'TEXTAREA' }, 'ArrowDown'), true);
  assert.equal(fieldKeeps({ tagName: 'SELECT' }, 'ArrowDown'), true);
  assert.equal(fieldKeeps({ tagName: 'BUTTON' }, 'ArrowDown'), false);
  assert.equal(fieldKeeps({ tagName: 'DIV', isContentEditable: true }, 'Enter'), true);
});

test('BUNNYFALL MENU-NAV: wired at boot over every window, the HUD aside', () => {
  const main = readFileSync(new URL('../../src/main.js', import.meta.url), 'utf8');
  assert.match(main, /\n {2}import\('\.\/ui\/menuNav\.js'\)\.then\(\(m\) => m\.installMenuNav\(\), \(\) => \{\}\);/);
  for (const sel of ['.px-home', '.pack-win', '.cw', '[class*="-shell"]']) assert.ok(NAV_ROOTS.includes(sel), sel);
});

test('BUNNYFALL USE-KEYS: every gathering act takes E and the click alike - held, struck, and a node clicked with no plaque', () => {
  const w = readFileSync(new URL('../../src/scenes/world.js', import.meta.url), 'utf8');
  assert.match(w, /input: \(\) => \(\{ held: held\(keys, 'Interact'\) \|\| held\(keys, 'ActivateCenterObject'\), attack: pressed\(latch\.edge, keys, 'SwingWeapon'\) \|\| pressed\(latch\.edge, keys, 'ActivateCenterObject'\), use: pressed\(latch\.edge, keys, 'Interact'\),/);
  assert.match(w, /return !worldPlaqueOn\(\) \? \(gatherHost\?\.press\(\) \?\? false\) :/);
  const g = readFileSync(new URL('../../src/scenes/gatherHost.js', import.meta.url), 'utf8');
  assert.match(g, /const attack = input\.attack \|\| \(input\.use === true && act === ticked\) \|\|/, 'E strikes, but never with the press that started the act');
  assert.match(g, /deps\.keyLabel\('Interact'\), deps\.keyLabel\('ActivateCenterObject'\)/, 'the words name both');
});
