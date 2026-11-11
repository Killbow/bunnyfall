// @ts-check

// The top toolbar: menus, the transform and snap controls, the view controls, the environment, the sign-in and the
// state badge. Each control calls an action; an action that cannot run yet is disabled and says why.

import { h, clear } from './dom.js';
import { ENVIRONMENTS } from '../api.js';

/**
 * @param {{ host: HTMLElement, actions: Record<string, (...a: any[]) => any>, getState: () => any }} o
 */
export function createToolbar({ host, actions, getState }) {
  const menus = [];
  const closeAll = () => { for (const m of menus) m.classList.remove('open'); };
  document.addEventListener('pointerdown', (e) => { if (!(/** @type {HTMLElement} */ (e.target)).closest?.('.menu')) closeAll(); });

  const menu = (title, items) => {
    const el = h('div', { class: 'menu' }, h('button', { text: title, on: { click: () => { const was = el.classList.contains('open'); closeAll(); if (!was) el.classList.add('open'); } } }), h('div', { class: 'items' }, ...items.map((it) => it.note ? h('div', { class: 'note', text: it.note }) : h('button', { text: it.label, title: it.why ?? '', disabled: !!it.why, on: { click: () => { closeAll(); actions.run(it.run); } } }))));
    menus.push(el);
    return el;
  };
  const btn = (label, run, title = '') => h('button', { text: label, title, 'data-run': run, on: { click: () => actions.run(run) } });
  const bar = h('div', { style: { display: 'contents' } });
  host.append(bar);

  function render() {
    const s = getState();
    clear(bar); menus.length = 0;
    const isOpen = !!s.docId;
    bar.append(
      menu('File', [
        { label: 'New POI...', run: 'newDoc' }, { label: 'Open from the store...', run: 'openDoc', why: s.signedIn ? '' : 'Sign in first.' },
        { label: 'Save draft', run: 'save', why: !isOpen ? 'Open a POI first.' : !s.signedIn ? 'Sign in first.' : '' },
        { label: 'Submit for approval', run: 'submit', why: !isOpen ? 'Open a POI first.' : !s.signedIn ? 'Sign in first.' : s.problems ? 'Fix the problems first.' : '' },
        { label: 'Go to a place (a town or city)...', run: 'goToPlace', why: isOpen ? '' : 'Open a POI first.' },
        { label: 'Game files (ARENA2 folder)...', run: 'gameFiles' },
        { label: 'Close POI', run: 'closeDoc', why: isOpen ? '' : 'No POI is open.' },
        { label: 'Withdraw submission', run: 'withdraw', why: s.state === 'submitted' ? '' : 'Only a submitted revision can be withdrawn.' },
        { label: 'Try in the Sandbox', run: 'sandbox', why: isOpen ? '' : 'Open a POI first.' },
        { label: 'Import a .glb model...', run: 'importGlb', why: !isOpen ? 'Open a POI first.' : !s.signedIn ? 'Sign in first (the model is uploaded).' : '' },
        { label: 'Import a POI pack (.zip)...', run: 'importPack', why: s.signedIn ? '' : 'Sign in first.' },
        { label: 'Export as a POI pack (.zip)', run: 'exportPack', why: !isOpen ? 'Open a POI first.' : !s.signedIn ? 'Sign in first.' : '' },
      ]),
      menu('Review', [
        { label: 'Review submissions...', run: 'review', why: s.me?.approver ? '' : 'Approvers only.' },
        { label: 'Roll back to an approved revision...', run: 'rollback', why: !s.me?.approver ? 'Approvers only.' : !isOpen ? 'Open a POI first.' : '' },
      ]),
      menu('Edit', [
        { label: 'Undo  Ctrl+Z', run: 'undo', why: s.canUndo ? '' : 'Nothing to undo.' }, { label: 'Redo  Ctrl+Shift+Z', run: 'redo', why: s.canRedo ? '' : 'Nothing to redo.' },
        { label: 'Cut  Ctrl+X', run: 'cut', why: s.sel ? '' : 'Select something first.' }, { label: 'Copy  Ctrl+C', run: 'copy', why: s.sel ? '' : 'Select something first.' }, { label: 'Paste  Ctrl+V', run: 'paste' },
        { label: 'Duplicate  Ctrl+D', run: 'duplicate', why: s.sel ? '' : 'Select something first.' }, { label: 'Delete  Del', run: 'remove', why: s.sel ? '' : 'Select something first.' },
        { label: 'Group  Ctrl+G', run: 'group', why: s.sel ? '' : 'Select something first.' }, { label: 'Ungroup  Ctrl+Shift+G', run: 'ungroup', why: s.sel ? '' : 'Select a group first.' },
        { label: 'Select all  Ctrl+A', run: 'selectAll', why: isOpen ? '' : 'Open a POI first.' },
      ]),
      h('span', { class: 'sep' }),
      ...['select', 'move', 'turn', 'size'].map((m) => h('button', { class: s.mode === m ? 'on' : '', text: { select: 'Select Q', move: 'Move W', turn: 'Turn E', size: 'Size R' }[m], on: { click: () => actions.mode(m) } })),
      h('button', { class: 'on', text: s.space === 'world' ? 'World' : 'Local', title: 'Gizmo axes', on: { click: () => actions.space() } }),
      h('label', { title: 'Snap while dragging' }, h('input', { type: 'checkbox', checked: s.snapOn, on: { change: (e) => actions.snapOn(e.target.checked) } }), ' Snap'),
      h('input', { type: 'number', value: s.snap.move, step: 0.05, min: 0, title: 'Move step (m)', on: { change: (e) => actions.snapStep('move', Number(e.target.value)) } }),
      h('input', { type: 'number', value: s.snap.turn, step: 1, min: 0, title: 'Turn step (deg)', on: { change: (e) => actions.snapStep('turn', Number(e.target.value)) } }),
      menu('Arrange', [
        ...['x', 'y', 'z'].flatMap((a, i) => [{ label: `Align ${a} to min`, run: `align:${i}:min`, why: s.sel > 1 ? '' : 'Select two or more.' }, { label: `Align ${a} to middle`, run: `align:${i}:mid`, why: s.sel > 1 ? '' : 'Select two or more.' }, { label: `Align ${a} to max`, run: `align:${i}:max`, why: s.sel > 1 ? '' : 'Select two or more.' }, { label: `Distribute along ${a}`, run: `distribute:${i}`, why: s.sel > 2 ? '' : 'Select three or more.' }]),
        { label: 'Drop to ground', run: 'drop', why: !s.sel ? 'Select something first.' : s.ground ? '' : 'No ground data (WOODS.WLD).' },
        { label: 'Hang on a surface', run: 'hang', why: s.sel === 1 ? '' : 'Select one mount first.' },
        { label: 'Move by...', run: 'moveBy', why: s.sel ? '' : 'Select something first.' },
        { label: 'Set height to 0', run: 'ground', why: s.sel ? '' : 'Select something first.' }, { label: 'Reset turn and size', run: 'reset', why: s.sel ? '' : 'Select something first.' },
      ]),
      menu('View', [
        { label: `${s.show.grid ? 'Hide' : 'Show'} grid`, run: 'show:grid' },
        { label: `${s.show.terrain ? 'Hide' : 'Show'} ground`, run: 'show:ground', why: s.ground ? '' : 'No ground data (WOODS.WLD).' },
        { label: 'Live view in the game', run: 'liveView', why: isOpen ? '' : 'Open a POI first.' },
        { label: `${s.show.surround ? 'Hide' : 'Show'} the game's buildings`, run: 'show:surround' },
        { label: `${s.show.collision ? 'Hide' : 'Show'} collision`, run: 'show:collision' },
        { label: `${s.show.dm ? 'Hide' : 'Show'} routes, zones and encounters`, run: 'show:dm' },
      ]),
      h('span', { class: 'sep' }),
      ...[['persp', '3D'], ['top', 'Top'], ['front', 'Front'], ['side', 'Side']].map(([m, t]) => h('button', { class: s.camera === m ? 'on' : '', text: t, on: { click: () => actions.camera(m) } })),
      btn('Frame F', 'frame', 'Frame the selection'),
      h('button', { class: s.view === '3d' ? 'on' : '', text: 'Viewport', on: { click: () => actions.view('3d') } }), h('button', { class: s.view === '2d' ? 'on' : '', text: '2D canvas', on: { click: () => actions.view('2d') } }), h('button', { class: s.view === 'dm' ? 'on' : '', text: 'DM', title: 'People, routes, encounters, dialogues, trades and events', on: { click: () => actions.view('dm') } }),
      h('span', { class: 'grow', style: { flex: '1' } }),
      h('select', { title: 'Server', on: { change: (e) => actions.env(e.target.value) } }, ...ENVIRONMENTS.map((e) => h('option', { value: e.id, text: e.id === 'custom' && s.env.id === 'custom' ? `Custom: ${s.env.base}` : e.name, selected: e.id === s.env.id }))),
      s.signedIn ? h('span', null, `${s.me?.handle ?? 'signed in'}${s.me?.approver ? ' (approver)' : s.me?.builder ? ' (builder)' : ' (no builder role)'} `, h('button', { text: 'Sign out', on: { click: () => actions.signOut() } })) : h('button', { text: 'Sign in', on: { click: () => actions.signIn() } }),
      h('span', { class: `badge ${s.badge.cls}`, text: s.badge.text, title: s.badge.why }),
      h('button', { text: 'Panels', title: 'Fold the side and bottom panels', on: { click: () => actions.panels() } }),
    );
  }
  return { render };
}
