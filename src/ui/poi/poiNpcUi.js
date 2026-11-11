// @ts-check
// BUNNYFALL (2026-11-05, the owner: "i would also love to be able to hand place npcs ... and also dont forget to add a
// sprite picker with daggerfall's sprites"): THE EDITOR'S PEOPLE. A dialog to make a person (a name, the lines they say,
// a look, a height) and stand them with a click on the ground, the same click a part from the library takes; and the
// inspector's rows for the people a POI already has. A look is a Daggerfall sprite picked from a grid of the game's own
// flats, or a picture the builder uploads. The panel hands its helpers in, so this file adds no weight to it
// (scenes/poiNpcs.js is where they stand in the world, poi/poiLaw.js what the store accepts).
import { t } from '../../systems/textManager.js';
import { lawName } from '../../poi/poiEdit.js';
import { POI_LIMITS } from '../../poi/poiLaw.js';
import { poiImageMetaOf } from '../../poi/poiImage.js';
import { mobileBillboardSize } from '../../world/rmbFlats.js';

/** The archives of Daggerfall's people, to pick from (a number typed opens any other). */
export const NPC_ARCHIVES = Object.freeze([182, 183, 184, 357]);
const THUMB_PX = 64, DEFAULT_H = 1.8;

/**
 * @param {any} c the panel's helpers: `{ doc, el, btn, field, numberInput, text, select, swallow, root, say, refusal, act,
 *   poiPutAsset, facts, readFile, getTexture, editor, edit, dialogsClosed, closeDialog, setDialog, dialogIs }`
 */
export function createPoiNpcUi(c) {
  const { el, btn, field, numberInput, text, swallow } = c;   // and `c.select`

  /** Daggerfall's sprite `r` of a texture file, as a canvas to look at (or null). */
  function thumbOf(tex, r) {
    try {
      const bmp = tex.getDFBitmap(r, 0);
      const img = tex.getColor32(bmp, 0);
      const cv = c.doc.createElement('canvas');
      cv.width = img.width; cv.height = img.height;
      const out = new Uint8ClampedArray(img.colors.length), row = img.width * 4;
      for (let y = 0; y < img.height; y++) out.set(img.colors.subarray((img.height - 1 - y) * row, (img.height - y) * row), y * row);   // its rows are bottom-up
      cv.getContext('2d').putImageData(new ImageData(out, img.width, img.height), 0, 0);
      return cv;
    } catch { return null; }
  }

  /**
   * The person's dialog. `index` null: a new person, stood by a click afterwards; a number: that person of the held POI,
   * changed and kept.
   * @param {{ index?: number | null }} [o]
   */
  function openPerson({ index = null } = {}) {
    c.dialogsClosed();
    const sel = c.edit.selection();
    const was = index != null && sel ? c.edit.docOf(sel.id)?.npcs?.[index] : null;
    const box = el('div', 'dfpoi-dialog');
    for (const ty of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'wheel', 'contextmenu', 'touchstart']) box.addEventListener(ty, swallow);
    let name = was?.name ?? '', h = was?.h ?? DEFAULT_H, look = was ? structuredClone(was.look) : null;
    let pic = null;   // a picture chosen, not yet uploaded: { bytes, url }
    let archive = look?.k === 'df' ? look.a : NPC_ARCHIVES[0];
    let tex = null, heightTouched = !!was;
    const mine = () => c.dialogIs(box);

    const nameIn = text(name, (v) => { name = v; }, POI_LIMITS.label);
    const lines = el('textarea');
    lines.rows = 5; lines.style.width = '100%';
    lines.value = (was?.lines ?? []).join('\n');
    lines.placeholder = t('poi.npc.linesHint', 'One line per press of Talk.');
    const hIn = numberInput(h, (v) => { if (v > 0) { h = v; heightTouched = true; } }, { step: 0.1, min: 0.3, max: 20 });

    // the look: a Daggerfall sprite from the grid
    const status = el('div', 'dfpoi-sub');
    const grid = el('div');
    grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px;max-height:240px;overflow:auto;background:#0003;padding:4px;border-radius:4px';
    const chosen = el('div', 'dfpoi-sub');
    const cells = new Map();
    const showChosen = () => {
      chosen.textContent = look?.k === 'df' ? t('poi.npc.chosenDf', 'Sprite {a}, {r}', { a: look.a, r: look.r })
        : look?.k === 'pic' ? t('poi.npc.chosenPic', 'Your picture') : t('poi.npc.chosenNone', 'No look chosen yet.');
      for (const [r, cell] of cells) cell.style.outline = look?.k === 'df' && look.a === archive && look.r === r ? '2px solid #e8c24a' : 'none';
    };
    let drawn = 0;
    async function loadArchive() {
      const token = ++drawn;
      cells.clear(); grid.replaceChildren(); tex = null;
      status.textContent = t('poi.npc.loading', 'Loading the sprites...');
      let f = null;
      try { f = await c.getTexture?.(archive); } catch { f = null; }
      if (token !== drawn || !mine()) return;
      const n = f?.recordCount ?? 0;
      if (!f || !n) { status.textContent = t('poi.npc.noArchive', 'Nothing in that archive.'); return; }
      tex = f;
      status.textContent = t('poi.npc.count', '{n} sprites. Click one.', { n });
      let r = 0;
      const batch = () => {
        if (token !== drawn || !mine()) return;
        for (let k = 0; k < 24 && r < n; k++, r++) {
          const cv = thumbOf(f, r);
          if (!cv) continue;
          const cell = el('div');
          cell.style.cssText = `width:${THUMB_PX}px;height:${THUMB_PX}px;display:flex;align-items:center;justify-content:center;cursor:pointer;border-radius:3px`;
          cv.style.cssText = `max-width:${THUMB_PX}px;max-height:${THUMB_PX}px;image-rendering:pixelated`;
          cell.title = `${archive} / ${r}`;
          const rec = r;
          cell.addEventListener('click', () => {
            look = { k: 'df', a: archive, r: rec };
            if (!heightTouched) { try { h = Math.round(mobileBillboardSize(f, rec).h * 100) / 100 || DEFAULT_H; hIn.value = String(h); } catch { /* the default */ } }
            showChosen();
          });
          cell.append(cv);
          cells.set(rec, cell); grid.append(cell);
        }
        showChosen();
        if (r < n) setTimeout(batch, 0);
      };
      batch();
    }
    const archSel = c.select(String(NPC_ARCHIVES.includes(archive) ? archive : 'other'), [...NPC_ARCHIVES.map((a) => [String(a), `${a}`]), ['other', t('poi.npc.otherArchive', 'Another...')]], (v) => {
      if (v === 'other') { otherIn.style.display = ''; return; }
      otherIn.style.display = 'none'; archive = Number(v); loadArchive();
    });
    const otherIn = numberInput(archive, (v) => { archive = Math.round(v); loadArchive(); }, { step: 1, min: 0, max: 999 });
    otherIn.style.display = NPC_ARCHIVES.includes(archive) ? 'none' : '';

    // or a picture of their own
    const picInfo = el('div', 'dfpoi-sub');
    const picImg = el('img');
    picImg.style.cssText = 'max-width:96px;max-height:96px;image-rendering:pixelated;background:#0003;border-radius:4px;display:none';
    const choose = btn(t('poi.npc.choosePic', 'Or use a picture...'), () => {
      const input = el('input');
      input.type = 'file'; input.accept = '.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp';
      input.addEventListener('change', async () => {
        const file = input.files?.[0];
        if (!file) return;
        try {
          const bytes = await c.readFile(file);
          const meta = poiImageMetaOf(bytes);
          if (meta?.error) { picInfo.textContent = t('poi.editor.picBad', 'That picture cannot be used.'); return; }
          if (!mine()) return;
          pic = { bytes, url: URL.createObjectURL(new Blob([bytes], { type: meta.type ?? 'image/png' })) };
          picImg.src = pic.url; picImg.style.display = '';
          picInfo.textContent = file.name;
          look = { k: 'pic', tex: '' };   // its sha is known once it is uploaded
          if (!heightTouched) { h = DEFAULT_H; hIn.value = String(h); }
          showChosen();
        } catch { picInfo.textContent = t('poi.editor.picBad', 'That picture cannot be used.'); }
      });
      input.click?.();
    });

    let busy = false;
    const go = btn(was ? t('poi.npc.keep', 'Keep the changes') : t('poi.npc.place', 'Place them'), async () => {
      if (busy) return;
      if (!look) { c.say(t('poi.npc.needLook', 'Pick a sprite or a picture first.'), 'bad'); return; }
      const said = lines.value.split('\n').map((l) => l.trim().slice(0, POI_LIMITS.npcLine)).filter(Boolean).slice(0, POI_LIMITS.npcLines);
      const who = { name: lawName(nameIn.value) || t('poi.npc.defaultName', 'Stranger'), h, look, lines: said };
      if (look.k === 'pic' && pic) {
        busy = true;
        const r = await c.act((i) => c.poiPutAsset(i, pic.bytes, 'texture'));
        busy = false;
        if (!mine()) return;
        if (!r) return;
        if (!r.ok) { c.say(c.refusal(r), 'bad'); return; }
        c.facts.put(r.data.sha, { kind: 'texture', ...r.data.meta, bytes: pic.bytes.byteLength });
        who.look = { k: 'pic', tex: r.data.sha };
      }
      c.closeDialog();
      if (was && sel) {
        c.edit.edit(sel.id, 'person', (x) => { const n = x.npcs?.[index]; if (n) { n.name = who.name; n.h = who.h; n.look = who.look; n.lines = who.lines; } });
      } else {
        c.editor.placeNpc(who, who.name);
        c.say(t('poi.npc.placeHint', 'Click where they stand. Esc to stop.'));
      }
    });
    const cancel = btn(t('poi.editor.cancel', 'Cancel'), () => c.closeDialog());
    const acts = el('div', 'dfpoi-row'); acts.append(go, cancel);

    box.append(el('div', 'dfpoi-h', was ? t('poi.npc.titleEdit', 'A person') : t('poi.npc.title', 'A new person')),
      field(t('poi.npc.name', 'Name'), nameIn),
      el('div', 'dfpoi-row', t('poi.npc.lines', 'What they say (one line each)')), lines,
      field(t('poi.npc.height', 'Height (m)'), hIn),
      el('div', 'dfpoi-h', t('poi.npc.look', 'Look')),
      field(t('poi.npc.archive', 'Daggerfall sprites, archive'), archSel, otherIn),
      status, grid, chosen, choose, picImg, picInfo, acts);
    c.setDialog(box);
    c.root.append(box);
    showChosen();
    loadArchive();
  }

  /** The inspector's rows for a POI's people: each named, with where they stand and a way to change or remove them. */
  function peopleRows(d, change) {
    const out = [el('div', 'dfpoi-h', t('poi.npc.people', 'People'))];
    const drawn = JSON.stringify(d.npcs ?? []);
    const same = () => JSON.stringify(c.edit.docOf(d.id)?.npcs ?? []) === drawn;
    out.push(btn(t('poi.npc.add', 'Add a person...'), () => openPerson()));
    (d.npcs ?? []).forEach((n, i) => {
      out.push(el('div', 'dfpoi-sub', `${n.name} (${n.lines.length === 1 ? t('poi.npc.oneLine', '1 line') : t('poi.npc.nLines', '{n} lines', { n: n.lines.length })})`));
      out.push(field(t('poi.editor.offset', 'Offset (m)'), ...n.t.map((v, k) => numberInput(v, (x) => { if (same()) change('person', (doc) => { const q = doc.npcs[i]; if (q) q.t = q.t.map((o, j) => (j === k ? x : o)); }); }, { step: 0.1, min: -2000, max: 2000 }))));
      const row = el('div', 'dfpoi-row');
      row.append(
        btn(t('poi.npc.edit', 'Change...'), () => openPerson({ index: i })),
        btn(t('poi.npc.remove', 'Remove'), () => { if (same()) change('remove person', (doc) => { doc.npcs.splice(i, 1); if (!doc.npcs.length) delete doc.npcs; }); }),
      );
      out.push(row);
    });
    return out;
  }

  return { openPerson, peopleRows };
}
