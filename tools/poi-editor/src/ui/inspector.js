// @ts-check

// The inspector: the fields of whatever is selected. One node shows its own fields, several show what they share.
// A field change is one editor step. Fields that are not built yet are not shown.

import { h, clear } from './dom.js';
import { find } from '../scene.js';
import { setNumber, isFigure } from '../transforms.js';
import { eulerOfQuat, quatOfEuler } from '../../../../src/poi/poiEdit.js';

/**
 * @param {{ host: HTMLElement, getDoc: () => any, docId: () => string | null, edit: any, getSel: () => string[] }} o
 */
export function createInspector({ host, getDoc, docId, edit, getSel }) {
  const run = (label, fn) => { const id = docId(); if (id) edit.edit(id, label, fn); };
  const num = (value, on, step = 0.01, min, max) => h('input', { type: 'number', value: Number(value.toFixed?.(3) ?? value), step, min, max, on: { change: (e) => { const v = Number(e.target.value); if (Number.isFinite(v)) on(v); } } });
  const vec = (label, v, on, step = 0.05) => h('div', { class: 'field' }, h('label', { text: label }), h('div', { class: 'vec' }, ...v.map((c, i) => num(c, (x) => on(i, x), step))));
  const text = (label, value, on, max = 64) => h('div', { class: 'field' }, h('label', { text: label }), h('input', { type: 'text', value, maxLength: max, on: { change: (e) => on(e.target.value) } }));
  const check = (label, value, on) => h('div', { class: 'field' }, h('label', { text: label }), h('input', { type: 'checkbox', checked: !!value, on: { change: (e) => on(e.target.checked) } }));

  function render() {
    clear(host);
    host.append(h('div', { class: 'head' }, 'Inspector'));
    const doc = getDoc();
    if (!doc) { host.append(h('div', { class: 'pane dim', text: 'No POI open.' })); return; }
    const sel = getSel();
    if (!sel.length) { poiFields(doc); return; }
    if (sel.length > 1) { host.append(h('div', { class: 'section', text: `${sel.length} selected` }), h('div', { class: 'pane dim', text: 'Use the toolbar to move, align, group or delete them together. Select one to edit its fields.' })); return; }
    const f = find(doc, sel[0]);
    if (!f) { host.append(h('div', { class: 'pane dim', text: 'Nothing selected.' })); return; }
    const row = f.row, id = sel[0];
    host.append(h('div', { class: 'section', text: f.kind }));
    host.append(text('Name', row.name ?? '', (v) => run('rename', (d) => { const r = find(d, id); if (r && v.trim()) r.row.name = v.trim(); })));
    if (f.kind === 'group') {
      host.append(check('Visible', row.visible !== false, (v) => run('visibility', (d) => { const r = find(d, id); if (r) r.row.visible = v; })), check('Locked', row.locked, (v) => run('lock', (d) => { const r = find(d, id); if (r) r.row.locked = v; })));
      return;
    }
    if (row.t) host.append(vec('Position (m)', row.t, (i, v) => run('position', (d) => setNumber(d, id, `t.${i}`, v))));
    if (f.kind === 'part') {
      const e = eulerOfQuat(row.r);
      host.append(vec('Turn (deg)', e, (i, v) => run('turn', (d) => { const r = find(d, id); if (!r) return; const n = [...eulerOfQuat(r.row.r)]; n[i] = v; r.row.r = quatOfEuler(n); }), 1));
      host.append(vec('Size', row.s, (i, v) => run('size', (d) => setNumber(d, id, `s.${i}`, Math.max(0.01, v))), 0.05));
      host.append(h('div', { class: 'field' }, h('label', { text: 'Model' }), h('span', { text: row.arch3d ? `Daggerfall model ${row.arch3d}` : 'Uploaded model' })));
      host.append(check('Casts shadow', row.shadow, (v) => run('shadow', (d) => { const r = find(d, id); if (r) r.row.shadow = v; })));
    } else if (f.kind === 'flat') {
      host.append(vec('Turn (deg)', row.rot, (i, v) => run('turn', (d) => setNumber(d, id, `rot.${i}`, v)), 1));
      host.append(h('div', { class: 'field' }, h('label', { text: 'Scale' }), isFigure(row) ? h('span', { class: 'dim', text: '1 (a person keeps their size)' }) : num(row.scale, (v) => run('size', (d) => setNumber(d, id, 'scale', Math.min(4, Math.max(0.25, v)))), 0.05, 0.25, 4)));
      host.append(h('div', { class: 'field' }, h('label', { text: 'Layer' }), num(row.layer, (v) => run('layer', (d) => setNumber(d, id, 'layer', Math.round(v))), 1, -100, 100)));
      host.append(check('Collides', row.collide, (v) => run('collide', (d) => { const r = find(d, id); if (r) r.row.collide = v; })));
      host.append(h('div', { class: 'field' }, h('label', { text: 'Kind' }), h('span', { text: row.kind })));
    } else if (f.kind === 'light') {
      host.append(h('div', { class: 'field' }, h('label', { text: 'Radius (m)' }), num(row.radius, (v) => run('radius', (d) => setNumber(d, id, 'radius', Math.max(1, Math.min(30, v)))), 0.5, 1, 30)));
      host.append(h('div', { class: 'field' }, h('label', { text: 'Intensity' }), num(row.intensity, (v) => run('intensity', (d) => setNumber(d, id, 'intensity', Math.max(0, Math.min(4, v)))), 0.1, 0, 4)));
      host.append(check('Flickers', row.flicker, (v) => run('flicker', (d) => { const r = find(d, id); if (r) r.row.flicker = v; })));
    } else if (f.kind === 'npc') {
      host.append(h('div', { class: 'field' }, h('label', { text: 'Height (m)' }), num(row.h, (v) => run('height', (d) => setNumber(d, id, 'h', Math.max(0.5, Math.min(4, v)))), 0.05, 0.5, 4)));
      host.append(h('div', { class: 'field' }, h('label', { text: 'Facing (deg)' }), num(row.yaw ?? 0, (v) => run('facing', (d) => setNumber(d, id, 'yaw', v)), 1)));
    }
    host.append(h('div', { class: 'field' }, h('label', { text: 'Group' }), h('span', { text: row.group ?? 'none' })));
  }

  function poiFields(doc) {
    host.append(h('div', { class: 'section', text: 'POI' }));
    host.append(text('Name', doc.name, (v) => run('name', (d) => { if (v.trim()) d.name = v.trim().slice(0, 64); })));
    host.append(h('div', { class: 'field' }, h('label', { text: 'About' }), h('textarea', { rows: 3, maxLength: 500, value: doc.about ?? '', on: { change: (e) => run('about', (d) => { d.about = e.target.value.slice(0, 500); }) } })));
    host.append(h('div', { class: 'field' }, h('label', { text: 'Map pixel' }), h('span', { text: `${doc.place.px}, ${doc.place.py}` })));
    host.append(vec('Offset (m)', [doc.place.x, doc.place.y, doc.place.z], (i, v) => run('place', (d) => { d.place[['x', 'y', 'z'][i]] = Math.round(v * 1000) / 1000; })));
    host.append(h('div', { class: 'field' }, h('label', { text: 'Id' }), h('span', { class: 'dim', text: doc.id })));
  }
  return { render };
}
