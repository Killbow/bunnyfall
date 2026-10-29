// @ts-check
// BUNNYFALL PHASE 3: THE NAME PICKER - a character without a first and last name (one from before Phase 3, or one just
// made) is asked for them once, in the world, the first time it is played. Prefilled from the name it already has.
// Strangers will call you by a title and your last name, NPCs who like you by your first (systems/names.js).
//
// It mounts itself: main.js imports this file, and a light check every couple of seconds asks whether the character in
// play still needs names. No host wires it (the hosts do not grow).
import { playerEntity } from '../characters/playerEntity.js';
import { needsNames, setNames, splitName, NAME_PART_MAX } from '../systems/names.js';

const CHECK_MS = 2000;
const ID = 'bf-name-picker';

const CSS = `
#${ID} { position: fixed; inset: 0; z-index: 100000; display: flex; align-items: center; justify-content: center;
  background: rgba(6, 7, 10, 0.72); font-family: var(--dfo-text-font, 'Alegreya', Georgia, serif); }
#${ID} .np-card { width: min(420px, calc(100vw - 32px)); background: #16130e; border: 1px solid #8a7a52; padding: 22px 22px 18px;
  color: #efe4c8; box-shadow: 0 10px 40px rgba(0,0,0,0.6); }
#${ID} h2 { margin: 0 0 6px; font-size: 22px; color: #f3cf86; font-weight: 700; }
#${ID} p { margin: 0 0 16px; font-size: 15px; line-height: 1.4; color: #cdbf9f; }
#${ID} label { display: block; font-size: 13px; letter-spacing: 0.04em; color: #b9a77c; margin: 10px 0 4px; }
#${ID} input { width: 100%; box-sizing: border-box; padding: 8px 10px; font: inherit; font-size: 17px; color: #fff3d6;
  background: #0c0b08; border: 1px solid #5d5238; outline: none; }
#${ID} input:focus { border-color: #f3cf86; }
#${ID} .np-row { display: flex; justify-content: flex-end; margin-top: 18px; }
#${ID} button { font: inherit; font-size: 16px; padding: 7px 18px; color: #16130e; background: #f3cf86; border: 0; cursor: pointer; }
#${ID} button:disabled { opacity: 0.45; cursor: default; }
#${ID} .np-hint { font-size: 13px; color: #9d8f70; margin: 12px 0 0; }
`;

let open = false;

/** Whether the main menu is up (the picker waits for the world). */
const menuUp = () => {
  const shell = globalThis.document?.querySelector?.('.shell');
  return !!shell && /** @type {HTMLElement} */ (shell).offsetParent !== null;
};

/** Put the picker up for `entity`; `done()` when the names are set. */
export function showNamePicker(entity = playerEntity, done = () => {}) {
  const doc = globalThis.document;
  if (!doc || open) return;
  open = true;
  try { doc.exitPointerLock?.(); } catch { /* no lock held */ }
  const { first, last } = { first: entity.firstName ?? splitName(entity.name).first, last: entity.lastName ?? splitName(entity.name).last };
  const root = doc.createElement('div');
  root.id = ID;
  root.innerHTML = `<style>${CSS}</style><form class="np-card" autocomplete="off">
    <h2>Your name</h2>
    <p>Strangers will address you by a title and your last name. Those who like you will use your first name.</p>
    <label for="np-first">First name</label><input id="np-first" maxlength="${NAME_PART_MAX}" required>
    <label for="np-last">Last name</label><input id="np-last" maxlength="${NAME_PART_MAX}">
    <div class="np-row"><button type="submit">Done</button></div>
    <p class="np-hint">You choose this once.</p></form>`;
  const form = /** @type {HTMLFormElement} */ (root.querySelector('form'));
  const firstIn = /** @type {HTMLInputElement} */ (root.querySelector('#np-first'));
  const lastIn = /** @type {HTMLInputElement} */ (root.querySelector('#np-last'));
  const button = /** @type {HTMLButtonElement} */ (root.querySelector('button'));
  firstIn.value = first;
  lastIn.value = last;
  const sync = () => { button.disabled = !firstIn.value.trim(); };
  // the game's keys stay out of the boxes, and the boxes' keys out of the game
  for (const type of ['keydown', 'keyup', 'keypress']) root.addEventListener(type, (e) => e.stopPropagation());
  root.addEventListener('input', sync);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!setNames(entity, firstIn.value, lastIn.value)) return;
    root.remove();
    open = false;
    done();
  });
  doc.body.append(root);
  sync();
  firstIn.focus();
  firstIn.select();
}

/** The check: the character in play needs names, is alive and in the world. */
function check() {
  if (open || menuUp()) return;
  if (!needsNames(playerEntity) || !(playerEntity.health > 0)) return;
  showNamePicker(playerEntity);
}

if (globalThis.document && typeof setInterval === 'function') setInterval(check, CHECK_MS);
