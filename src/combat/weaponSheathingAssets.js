// Weapon Sheathing scabbard and bone-addon meshes, served as build URLs.
// import.meta.glob exists only under Vite, so node gets an empty table.
import { makeVendoredArchive, vendoredDataPath } from './weaponSheathing.js';

const IN_BROWSER = typeof window !== 'undefined';
// Eager, so the build emits one URL table instead of one chunk per file.
const FILES = IN_BROWSER ? import.meta.glob('../../vendor/weapon-sheathing/Data Files/**/*.nif', { eager: true, query: '?url', import: 'default' }) : {};

export const WEAPON_SHEATHING_URLS = Object.freeze(Object.fromEntries(Object.entries(FILES).map(([p, url]) => [vendoredDataPath(p), url])));

const fetchBytes = async (url) => new Uint8Array(await (await fetch(url)).arrayBuffer());

let _archive = null;
export function weaponSheathingArchive() {
  return (_archive ??= makeVendoredArchive(WEAPON_SHEATHING_URLS, fetchBytes));
}
