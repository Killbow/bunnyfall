// dataSource.js ranks this archive after the loose files, so a player file with the same name replaces ours, and
// before every BSA. `import.meta.glob` runs only in the browser, so node gets an empty archive.
import { makeVendoredArchive } from './urlArchive.js';

const IN_BROWSER = typeof window !== 'undefined';

// Eager on purpose: a lazy glob emits one chunk and one request per file, each holding only a URL.
const FILES = IN_BROWSER
  ? import.meta.glob('../assets/mw/**/*.{nif,dds}', { eager: true, query: '?url', import: 'default' })
  : {};

export function ownMwDataPath(file) {
  const p = String(file).replace(/\\/g, '/').toLowerCase();
  const at = p.indexOf('assets/mw/');
  return at >= 0 ? p.slice(at + 'assets/mw/'.length) : p.slice(p.lastIndexOf('/') + 1);
}

export const OWN_MW_URLS = Object.freeze(
  Object.fromEntries(Object.entries(FILES).map(([p, url]) => [ownMwDataPath(p), url])),
);

const fetchBytes = async (url) => new Uint8Array(await (await fetch(url)).arrayBuffer());

let _archive = null;
export function ownMwArchive() {
  return (_archive ??= makeVendoredArchive(OWN_MW_URLS, fetchBytes));
}
