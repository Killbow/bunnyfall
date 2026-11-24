// The Co-owners window at a house door. The account service stores the list and checks every change.

import { ChoiceWindow } from './talkWindow.js';
import { t } from './textManager.js';
import { ownersViewOf, ownersRole, addCandidates, ownersRefusal, PICK_MAX } from '../homes/homeOwnerLaw.js';

/**
 * @param {number} mapId
 * @param {number} buildingKey
 * @param {{ homesApi?: { owners?: Function }, decorCharacter?: () => string | null, accountCharacters?: () => Promise<any[]> }} host
 * @param {(text: string) => void} say
 * @param {(code: string) => string} refusal
 * @param {(win: object) => void} show
 */
export async function openHomeOwners(mapId, buildingKey, host, say, refusal, show) {
  const tell = typeof say === 'function' ? say : () => {};
  const word = (code) => ownersRefusal(code, refusal);
  const mount = typeof show === 'function' ? show : () => {};
  const api = host?.homesApi?.owners;
  if (!api) { tell(t('housing.owners.signedOut', 'You are not signed in.')); return false; }
  const me = host.decorCharacter?.() ?? null;
  const at = { mapId, buildingKey, ...(me ? { character: me } : {}) };
  const ask = (body) => host.homesApi.owners({ ...at, ...body }).catch(() => ({ ok: false, error: 'server' }));
  const again = () => { void open(); };
  const act = async (body, done) => {
    const r = await ask(body);
    if (!r?.ok) tell(word(r?.error ?? 'server')); else tell(done);
    again();
  };

  async function open() {
    const got = await ask({ op: 'list' });
    if (!got?.ok) { tell(word(got?.error ?? 'server')); return; }
    const view = ownersViewOf(got);
    const role = ownersRole(view, me);
    const lines = [
      t('housing.owners.main', 'Main owner: {name}', { name: view.main?.name || '?' }),
      view.coOwners.length ? t('housing.owners.coList', 'Co-owners: {names}', { names: view.coOwners.map((c) => c.name).join(', ') }) : t('housing.owners.noCo', 'There are no co-owners.'),
    ];
    const options = [];
    if (role.canAdd) options.push({ code: 'KeyA', label: t('housing.owners.add', 'A: add a co-owner'), action: () => { void addStep(view); } });
    const removable = view.coOwners.filter(role.canRemove);
    if (role.isMain && removable.length) options.push({ code: 'KeyR', label: t('housing.owners.remove', 'R: remove a co-owner'), action: () => removeStep(removable) });
    else if (removable.length) options.push({ code: 'KeyR', label: t('housing.owners.leave', 'R: stop being a co-owner'), action: () => { void act({ op: 'remove', char: me }, t('housing.owners.left', 'You are no longer a co-owner of this house.')); } });
    options.push({ code: 'Escape', label: t('housing.owners.close', 'Esc: close'), action: () => {} });
    mount(new ChoiceWindow({ lines, options }));
  }

  async function addStep(view) {
    const chars = await Promise.resolve(host.accountCharacters?.()).catch(() => []);
    const list = addCandidates(chars, view, me).slice(0, PICK_MAX);
    if (!list.length) { tell(t('housing.owners.noOthers', 'You have no other characters to add.')); again(); return; }
    const options = list.map((c, i) => ({ code: `Digit${i + 1}`, label: `${i + 1}: ${c.name}`, action: () => { void act({ op: 'add', char: c.id }, t('housing.owners.added', '{name} is now a co-owner of this house.', { name: c.name })); } }));
    options.push({ code: 'Escape', label: t('housing.owners.back', 'Esc: back'), action: again });
    mount(new ChoiceWindow({ lines: [t('housing.owners.addAsk', 'Add which character as a co-owner?')], options }));
  }

  function removeStep(list) {
    const options = list.map((c, i) => ({ code: `Digit${i + 1}`, label: `${i + 1}: ${c.name}`, action: () => { void act({ op: 'remove', char: c.char }, t('housing.owners.removed', '{name} is no longer a co-owner of this house.', { name: c.name })); } }));
    options.push({ code: 'Escape', label: t('housing.owners.back', 'Esc: back'), action: again });
    mount(new ChoiceWindow({ lines: [t('housing.owners.removeAsk', 'Remove which co-owner?')], options }));
  }

  await open();
  return true;
}
