// @ts-check

import { InputMessageBoxWindow } from '../ui/inputMessageBox.js';
import { ChoiceWindow } from '../ui/talkWindow.js';
import { t } from '../ui/textManager.js';
import { GUESTBOOK_TEXT_MAX } from '../net/guestbookLaw.js';

export const GUESTBOOK_VERB = Object.freeze({ sign: 'home-guestbook-sign', read: 'home-guestbook-read' });
export const isGuestbookVerb = (/** @type {unknown} */ id) => id === GUESTBOOK_VERB.sign || id === GUESTBOOK_VERB.read;

const insider = (/** @type {any} */ home) => !!home && (home.own || home.mine === true || home.member === true || home.insider === true);
export function guestbookRows(/** @type {any} */ home) {
  if (!home || home.deed === true) return [];
  return insider(home)
    ? [{ id: GUESTBOOK_VERB.read, label: t('home.guestbook.readRow', 'Read the guestbook') }]
    : [{ id: GUESTBOOK_VERB.sign, label: t('home.guestbook.signRow', 'Sign the guestbook') }];
}

/**
 * @param {string} verb
 * @param {{ api: any, mapId: number, buildingKey: number, name: string, show: (w: any) => void, say: (s: string) => void,
 *   refusal: (word: string) => string }} o
 */
export function pressGuestbook(verb, { api, mapId, buildingKey, name, show, say, refusal }) {
  if (!api) return;
  if (verb === GUESTBOOK_VERB.sign) {
    show(new InputMessageBoxWindow({
      lines: [t('home.guestbook.ask', 'What do you write in the guestbook?')], maxCharacters: GUESTBOOK_TEXT_MAX,
      onSubmit: (/** @type {string} */ text) => {
        if (!String(text ?? '').trim()) return;
        Promise.resolve(api.guestbookSign({ mapId, buildingKey, name, text })).then((r) => {
          say(r?.ok ? t('home.guestbook.signed', 'You sign the guestbook.') : refusal(r?.error ?? 'bad-guestbook'));
        }).catch(() => say(refusal('offline')));
      },
    }));
    return;
  }
  Promise.resolve(api.guestbookRead(mapId, buildingKey)).then((r) => {
    if (!r?.ok) { say(refusal(r?.error ?? 'offline')); return; }
    const lines = r.lines.length
      ? r.lines.map((/** @type {{ name: string, text: string }} */ l) => `${l.name}: ${l.text}`)
      : [t('home.guestbook.empty', 'Nobody has signed the guestbook yet.')];
    show(new ChoiceWindow({ lines: [t('home.guestbook.title', 'The guestbook'), ...lines], options: [] }));
  }).catch(() => say(refusal('offline')));
}
