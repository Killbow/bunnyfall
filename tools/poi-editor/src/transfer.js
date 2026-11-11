// @ts-check

// The editor's store and file actions beyond save and submit: an approver's review of the queue (the change shown
// against the live revision, the approval naming the exact document it read), a rollback, a withdrawal, a .zip POI pack
// out and in, and a .glb model in. Each reuses the game's own modules (poi/poiTransfer.js, poi/poiImport.js,
// poi/gltfImport.js, poi/poiDiff.js), so a pack or a model means the same thing here and in the old editor.

import { exportPack, importPack, fileNameOf } from '../../../src/poi/poiTransfer.js';
import { readPackBytes } from '../../../src/poi/poiPack.js';
import { readGltf, bakeGltf } from '../../../src/poi/gltfImport.js';
import { prepareImport, uploadImport } from '../../../src/poi/poiImport.js';
import { newPart } from '../../../src/poi/poiEdit.js';
import { poiDiff } from '../../../src/poi/poiDiff.js';
import { diffText, packErrorText, gltfErrorText, meshErrorText, problemText } from '../../../src/poi/poiText.js';
import { ask, confirmBox } from './ui/dialog.js';

/** Let the builder pick a file. @param {string} accept @returns {Promise<File | null>} */
export function pickFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = accept;
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null), { once: true });
    input.addEventListener('cancel', () => resolve(null), { once: true });
    input.click();
  });
}
/** Hand the builder a file. @param {Uint8Array} bytes @param {string} name @param {string} type */
export function download(bytes, name, type) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** What a revision changes, as lines. @param {any} live @param {any} doc */
export const diffLines = (live, doc) => poiDiff(live, doc).map((c) => { try { return diffText(c); } catch { return c.code; } });

/**
 * @param {{ api: any, edit: any, getDoc: () => any, docId: () => (string | null), say: (l: string) => void,
 *   act: (label: string, fn: (d: any) => void, after?: any) => void, opened: (id: string) => void, refresh: () => void }} o
 */
export function createTransfer({ api, edit, getDoc, docId, say, act, opened, refresh }) {
  return {
    /** The open POI, every asset it names with it, as a .zip pack. */
    async exportPack() {
      const doc = getDoc();
      if (!doc) return;
      const r = await exportPack({ pois: [doc], shelf: [] }, (sha) => api.assetBytes(sha));
      if (!r.ok) { say(r.code === 'export-fetch' ? `Could not fetch asset ${r.sha}. Sign in to the server that holds it.` : packErrorText(r)); return; }
      download(r.bytes, fileNameOf(doc.name, 'zip'), 'application/zip');
      say(`Exported ${doc.name} as a pack.`);
    },
    /** A pack's POIs opened as drafts, its assets uploaded first. */
    async importPack() {
      const f = await pickFile('.zip');
      if (!f) return;
      let pack;
      try { pack = await readPackBytes(new Uint8Array(await f.arrayBuffer())); } catch (e) { say(`Not a POI pack: ${/** @type {any} */ (e)?.message ?? e}`); return; }
      if (!pack.ok) { say(packErrorText(pack)); return; }
      const r = await importPack(pack, {
        putAsset: (bytes, kind) => api.putAsset(bytes, kind), history: (id) => api.history(id), shelfEntry: (id) => api.shelfEntry(id),
        shelve: (item) => api.shelve(item), rand: (b) => globalThis.crypto.getRandomValues(b), progress: (d, n) => say(`Importing ${d} of ${n}...`),
      });
      if (!r.ok) { say(`Import stopped at ${r.at}: ${r.error}`); for (const pr of r.problems ?? []) say(`  ${problemText(pr)}`); return; }
      for (const o of r.open) { edit.open(o.id, { doc: o.doc, saved: o.saved, base: o.base, state: o.state === 'live' ? 'draft' : o.state }); opened(o.id); }
      say(`Imported ${r.open.length} POI(s) as drafts; ${r.uploaded} asset(s) uploaded, ${r.existed} already stored. Save to keep them.`);
      refresh();
    },
    /** A .glb (or a .gltf with its files inlined) as parts of the open POI, its meshes and pictures uploaded. */
    async importGlb() {
      if (!getDoc()) { say('Open a POI first.'); return; }
      const f = await pickFile('.glb,.gltf');
      if (!f) return;
      let prep;
      try {
        const model = readGltf(new Uint8Array(await f.arrayBuffer()));
        prep = prepareImport(model, bakeGltf(model, { split: 'whole' }));
      } catch (e) { say(`Could not read the model: ${(() => { try { return gltfErrorText(/** @type {any} */ (e).code, e); } catch { return String(e); } })()}`); return; }
      for (const x of prep.refused) say(`Left out ${x.name}: ${meshErrorText(x.code)}`);
      if (!prep.parts.length) { say('The model has no part the store can take.'); return; }
      const up = await uploadImport(prep, (bytes, kind) => api.putAsset(bytes, kind), (d, n) => say(`Uploading ${d} of ${n}...`));
      if (!up.ok) { say(`Upload stopped${up.part ? ` at ${up.part}` : ''}: ${up.error}`); return; }
      act(`import ${f.name}`, (d) => {
        for (const p of up.asset.parts) d.parts.push(newPart(d, { mesh: p.mesh, submeshes: p.submeshes, name: p.name, materials: p.materials, t: p.t }));
        for (const l of up.asset.lights) d.lights.push(l);
      });
      say(`Imported ${up.asset.parts.length} part(s) from ${f.name}.`);
    },
    /** An approver's review: a submission from the queue, its change against the live revision, then approve or reject. */
    async review() {
      const q = await api.queue();
      if (!q.ok) { say(`The store said: ${q.error}`); return; }
      const list = q.data.queue ?? [];
      if (!list.length) { say('Nothing is waiting for review.'); return; }
      const v = await ask('Review a submission', [{ name: 'k', label: 'Submission', options: list.map((x, i) => [String(i), `${x.doc?.name ?? x.id} rev ${x.rev} by ${x.author}${x.stale ? ' (made from an older live revision)' : ''}`]) }], { ok: 'Show the change' });
      if (!v) return;
      const x = list[Number(v.k)];
      const lines = x.kind === 'retire' ? ['Take this POI out of the world.'] : diffLines(x.liveDoc, x.doc);
      const w = await ask(`${x.doc?.name ?? x.id}, revision ${x.rev}`, [
        { name: 'verdict', label: lines.slice(0, 30).join('\n') || 'No visible change.', options: [['approve', 'Approve: it goes live'], ['reject', 'Reject'], ['open', 'Open it in the editor (read it first)']] },
        { name: 'note', label: 'Note to the builder', value: '' },
      ], { ok: 'Decide' });
      if (!w) return;
      if (w.verdict === 'open') { edit.open(x.id, { doc: structuredClone(x.doc), saved: x.doc, base: x.liveRev, rev: x.rev, state: 'submitted' }); opened(x.id); refresh(); return; }
      if (!(await confirmBox(w.verdict === 'approve' ? 'Approve' : 'Reject', w.verdict === 'approve' ? 'Players will see this revision.' : 'The builder can fix it and submit again.', w.verdict === 'approve' ? 'Approve' : 'Reject'))) return;
      // the approval names the document read (docSha): a change saved over it since is refused, never approved unseen
      const r = await api.review(x.id, x.rev, w.verdict, w.note || null, x.docSha ?? null);
      say(r.ok ? `${w.verdict === 'approve' ? 'Approved, now live' : 'Rejected'}: ${x.doc?.name ?? x.id} revision ${x.rev}.` : `Not decided: ${r.error}${r.error === 'poi-changed' ? ' (it changed since you read it; review again)' : ''}`);
      const e = edit.entryOf(x.id);
      if (r.ok && e) edit.markSaved(x.id, { rev: x.rev, state: r.data.state });
      refresh();
    },
    /** An approver puts an earlier approved revision back in the world (recorded as a revision of its own). */
    async rollback() {
      const id = docId();
      if (!id) { say('Open a POI first.'); return; }
      const hr = await api.history(id);
      if (!hr.ok) { say(`The store said: ${hr.error}`); return; }
      const ok = (hr.data.revs ?? []).filter((x) => x.state === 'approved' && x.kind === 'doc');
      if (!ok.length) { say('This POI has no approved revision to go back to.'); return; }
      const v = await ask('Roll back', [{ name: 'rev', label: 'Put this revision back in the world', options: ok.map((x) => [String(x.rev), `revision ${x.rev}${x.rev === hr.data.liveRev ? ' (live now)' : ''}`]) }], { ok: 'Roll back' });
      if (!v) return;
      const r = await api.rollback(id, Number(v.rev));
      say(r.ok ? `Revision ${v.rev} is live again. The rollback is recorded as a new revision.` : `Not rolled back: ${r.error}`);
      refresh();
    },
    /** The author takes a submission back. */
    async withdraw() {
      const id = docId(), e = id ? edit.entryOf(id) : null;
      if (!e || e.state !== 'submitted') { say('Only a submitted revision can be withdrawn.'); return; }
      const r = await api.withdraw(id, e.rev);
      if (r.ok) edit.markSaved(id, { rev: e.rev, state: r.data.state ?? 'draft' });
      say(r.ok ? 'Withdrawn. It is a draft again.' : `Not withdrawn: ${r.error}`);
      refresh();
    },
  };
}
