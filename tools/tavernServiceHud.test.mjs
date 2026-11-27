import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTavernServiceHud } from '../src/ui/tavernServiceHud.js';
import { createTavernShift } from '../src/net/tavernServiceLaw.js';

function documentFixture() {
  const created = [], body = { children: [], append(n) { this.children.push(n); } };
  const document = {
    body,
    getElementById: () => ({}),
    createElement(tagName) {
      const n = { tagName, children: [], className: '', hidden: false, textContent: '',
        setAttribute(key, value) { this[key] = value; }, append(child) { this.children.push(child); },
        replaceChildren() { this.children = []; }, remove() { body.children = body.children.filter((x) => x !== this); } };
      n.classList = { add(c) { n.className = [...new Set([...n.className.split(' '), c])].join(' '); },
        remove(c) { n.className = n.className.split(' ').filter((x) => x !== c).join(' '); } };
      created.push(n); return n;
    },
  };
  return { document, created, body };
}
const stateOf = () => {
  const state = createTavernShift({ where: '17:42', keeper: 'keeper', patrons: ['guest'], nowS: 100, seed: 1 });
  state.orders[0].recipe = 'dibella'; state.mix.cream = 1; return state;
};

test('service follows the active skin without injecting a separate palette/font or duplicating its DOM', () => {
  const f = documentFixture(); let enhanced = true;
  const hud = createTavernServiceHud({ document: f.document, enhanced: () => enhanced });
  const state = stateOf(); hud.frame(state, () => 'Traveller', false);
  assert.equal(f.body.children.length, 1);
  const node = f.body.children[0];
  assert.match(node.className, /wplaque/); assert.match(node.className, /on/);
  assert.ok(node.children.every((c) => ['wplaque-title', 'wplaque-sub'].includes(c.className)));
  const text = node.children.map((c) => c.textContent).join('\n');
  assert.match(text, /Dibella's Veil/); assert.match(text, /Cream 1/); assert.match(text, /Earned: 0 gold/);
  assert.equal(f.created.some((n) => n.tagName === 'style'), false);
  const count = f.created.length; hud.frame(state, () => 'Traveller', false); assert.equal(f.created.length, count);
  enhanced = false; hud.frame(state, () => 'Traveller', false);
  assert.equal(node.hidden, true); assert.ok(!node.className.split(' ').includes('on'));
  let glyphs = 0, cup = 0;
  hud.draw({ drawScreenQuad(texture) { if (texture === 'font') glyphs++; else cup++; } }, { width: 960, height: 600 },
    { tex: 'font', fnt: { fixedHeight: 8, fixedWidth: 5, glyphWidth: () => 4 } });
  assert.ok(glyphs > 0, 'Classic must draw using the native bitmap-font renderer.'); assert.ok(cup > 0);
  enhanced = true; hud.frame(state, () => 'Traveller', false);
  assert.equal(node.hidden, false); assert.equal(f.body.children.length, 1);
  hud.dispose(); assert.equal(f.body.children.length, 0);
});
test('hidden and completed service renders neither native text nor a carried cup', () => {
  const hud = createTavernServiceHud({ enhanced: () => false }); let draws = 0;
  const renderer = { drawScreenQuad() { draws++; } }, canvas = { width: 320, height: 200 };
  const state = stateOf(); hud.frame(state, () => 'Traveller', false); hud.hide(); hud.draw(renderer, canvas, null);
  assert.equal(draws, 0);
  hud.frame({ ...state, phase: 'done' }, () => 'Traveller', false); hud.draw(renderer, canvas, null);
  assert.equal(draws, 0); hud.dispose();
});
test('the cup animates a pour, the hand-off and a reward float from state changes, then settles', () => {
  let now = 10;
  const hud = createTavernServiceHud({ enhanced: () => false, now: () => now });
  const quads = []; const renderer = { drawScreenQuad(texture, rect, _uv, color) { quads.push({ texture, rect, color }); } };
  const canvas = { width: 320, height: 200 }, font = { tex: 'font', fnt: { fixedHeight: 8, fixedWidth: 5, glyphWidth: () => 4 } };
  const draw = () => { quads.length = 0; hud.draw(renderer, canvas, null); return quads.slice(); };
  const state = stateOf(); hud.frame(state, () => 'Traveller', false);
  const settled = draw().length;
  const poured = structuredClone(state); poured.mix.wine = 1; hud.frame(poured, () => 'Traveller', false);
  now += 0.1; assert.equal(draw().length, settled + 1, 'pour stream');
  now += 1; assert.equal(draw().length, settled, 'the stream ends');
  const served = structuredClone(poured); served.index = 1; served.mix = { wine: 0, cream: 0, beer: 0 }; served.orderAt = 200;
  hud.frame(served, () => 'Traveller', false);
  now += 0.2; const leaving = draw().filter((q) => q.texture !== 'font');
  now += 2; const back = draw().filter((q) => q.texture !== 'font');
  assert.ok(leaving[0].rect.x < back[0].rect.x, 'the handed-over cup moves toward the customer');
  hud.hide(); hud.reward(36, 1);
  quads.length = 0; hud.draw(renderer, canvas, font); assert.ok(quads.some((q) => q.texture === 'font'));
  now += 2; quads.length = 0; hud.draw(renderer, canvas, font); assert.equal(quads.length, 0);
  hud.dispose();
});
