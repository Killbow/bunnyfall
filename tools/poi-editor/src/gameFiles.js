// @ts-check

// The game's data files for the viewport. The dev server serves them at /arena2; on the live /builder/ page there is
// no such folder, so the builder picks their own ARENA2 folder once. Only the few files the editor reads are copied
// into this browser (IndexedDB) and never leave it.

const DB = 'bunnyfall.worldbuilder.files';
const NEEDED = /^(ARCH3D\.BSA|ART_PAL\.COL|WOODS\.WLD|TEXTURE\.\d{3})$/i;

/** @returns {Promise<IDBDatabase>} */
function open() {
  return new Promise((ok, no) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('files');
    r.onsuccess = () => ok(r.result);
    r.onerror = () => no(r.error);
  });
}

/** @param {'readonly' | 'readwrite'} mode @param {(s: IDBObjectStore) => IDBRequest | void} fn */
async function run(mode, fn) {
  const db = await open();
  return new Promise((ok, no) => {
    const t = db.transaction('files', mode);
    const req = fn(t.objectStore('files'));
    t.oncomplete = () => { db.close(); ok(req ? req.result : undefined); };
    t.onerror = () => { db.close(); no(t.error); };
  });
}

/** A file by name: the dev server's /arena2 first, then the folder the builder picked. Throws when neither has it. */
export async function readGameFile(name, fetcher = (u) => fetch(u)) {
  try {
    const r = await fetcher(`./arena2/${name}`);
    // a host that answers every path with its page is not a file
    if (r.ok && !/text\/html/.test(r.headers?.get?.('content-type') ?? '')) return new Uint8Array(await r.arrayBuffer());
  } catch { /* fall through to the picked folder */ }
  let got;
  try { got = await run('readonly', (s) => s.get(name.toUpperCase())); } catch { got = undefined; }
  if (!got) throw new Error(`${name} not found`);
  return new Uint8Array(got);
}

/** Copy the editor's files out of the picked folder's File list. Answers how many were kept. */
export async function keepGameFiles(files) {
  let n = 0;
  for (const f of files) {
    if (!NEEDED.test(f.name)) continue;
    const bytes = await f.arrayBuffer();
    await run('readwrite', (s) => s.put(bytes, f.name.toUpperCase()));
    n += 1;
  }
  return n;
}

/** Ask the builder for their ARENA2 folder (a folder picker), keep the files, answer how many were kept. */
export function pickGameFolder() {
  return new Promise((ok) => {
    const input = document.createElement('input');
    input.type = 'file'; input.multiple = true;
    input.setAttribute('webkitdirectory', '');
    input.onchange = async () => ok(await keepGameFiles(Array.from(input.files ?? [])));
    input.oncancel = () => ok(0);
    input.click();
  });
}
