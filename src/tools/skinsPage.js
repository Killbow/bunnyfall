// @ts-check
// BUNNYFALL (2026-11-07): skins.html - a player's custom paperdolls: upload, status, wear, delete. The session is the one the
// game keeps in this browser (net/accountClient.js storedSession); with none, the page says to sign in to the game first.
import { storedSession, serviceBase } from '../net/accountClient.js';
import { mountSkinsPanel } from '../ui/skinsPanel.js';

const storage = (() => { try { return globalThis.localStorage; } catch { return null; } })();
const io = () => { const s = storedSession(storage); return s ? { fetch: (/** @type {any[]} */ ...a) => globalThis.fetch(.../** @type {[any, any]} */ (a)), base: serviceBase(storage), secret: s.secret } : null; };
mountSkinsPanel(/** @type {HTMLElement} */ (document.getElementById('panel')), { io, manage: true });
