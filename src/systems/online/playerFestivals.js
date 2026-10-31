// @ts-check
// PLAYER-FESTIVALS (2026-10-30, the owner: "players being able to make a festival ... a custom entry"): THE FESTIVALS
// PLAYERS HOST, AS THIS CLIENT LIVES THEM (net/playerFestivalLaw.js its law, server-account/src/playerFestival.js its
// registry). At any innkeeper, online, a registered account may host one: it names the festival and says what it is, pays
// FEST_COST_GOLD, and for FEST_HOURS the town holds it. Every client polls the registry, says each festival once in the
// chat, marks its town on the held map, and lays a small buff (Festival Cheer) on whoever stands in the town.
//
// The host hands in its doors: the homes' service, the town of a map id, a line, the overlay.

import { InputMessageBoxWindow } from '../../ui/inputMessageBox.js';
import { assignModBundle } from '../effects.js';
import { DISH_ICON } from '../../net/recipeLaw.js';
import { addGoldPieces, goldPiecesOf } from '../inventory.js';
import { t } from '../textManager.js';
import {
  FEST_NAME_MAX, FEST_TEXT_MAX, FEST_COST_GOLD, FEST_HOURS, FEST_BUFF_NAME, FEST_BUFF_STAT, FEST_BUFF_AMOUNT, FEST_BUFF_ROUNDS,
  festStanding, festMinutesLeft,
} from '../../net/playerFestivalLaw.js';

/** How often the registry is read, and how often the buff is looked at, ms. */
export const FEST_POLL_MS = 60_000;
export const FEST_BUFF_LOOK_MS = 5000;
/** A held map card's line, characters (ui/eventMapMarks.js TIP_TEXT_MAX). */
const CARD_LINE = 80;

export const festivalWords = {
  host: (/** @type {number} */ gold) => t('festival.host.row', 'H - Host a festival ({gold} gold)', { gold }),
  askName: () => t('festival.host.askName', 'What is your festival called? It costs {gold} gold and lasts {hours} hours.', { gold: FEST_COST_GOLD, hours: FEST_HOURS }),
  askText: () => t('festival.host.askText', 'What is it about? A few words for the town.'),
  poor: () => t('festival.host.poor', 'You cannot afford a festival ({gold} gold).', { gold: FEST_COST_GOLD }),
  nowhere: () => t('festival.host.nowhere', 'You cannot host a festival here.'),
  started: (/** @type {string} */ name) => t('festival.host.started', 'Your festival, {name}, begins. The town is told.', { name }),
  begun: (/** @type {string} */ host, /** @type {string} */ town, /** @type {string} */ name) => t('festival.told', '{host} is hosting a festival in {town}: {name}.', { host, town, name }),
  joined: (/** @type {string} */ name) => t('festival.joined', 'You join the festival, {name}. Personality +{n} while you are here.', { name, n: FEST_BUFF_AMOUNT }),
  hostedBy: (/** @type {string} */ host) => t('festival.card.host', 'Hosted by {host}', { host }),
  left: (/** @type {number} */ min) => t('festival.card.left', '{min} minutes left', { min }),
};

/** A description cut into at most two lines for a map card, on spaces. */
function cardLines(/** @type {string} */ text) {
  const out = [];
  let rest = text;
  while (rest && out.length < 2) {
    if (rest.length <= CARD_LINE) { out.push(rest); rest = ''; break; }
    let cut = rest.lastIndexOf(' ', CARD_LINE);
    if (cut < 20) cut = CARD_LINE;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut).trim();
  }
  return out;
}

/**
 * @param {{ api: any, on: () => boolean, entity: () => any, mapIdNow: () => number, townOf: (mapId: number) => ({ name: string, px: number, py: number } | null | undefined),
 *   hostName: () => string, say: (s: string) => void, show: (w: any) => void, refusal: (word: string) => string, nowMs?: () => number }} deps
 */
export function createPlayerFestivals(deps) {
  const nowS = () => Math.floor((deps.nowMs ?? Date.now)() / 1000);
  /** @type {Array<{ id: number, host: string, mapId: number, town: string, name: string, text: string, startsAt: number, endsAt: number, mine: boolean }>} */
  let list = [];
  const told = new Set();
  const joined = new Set();
  let nextPoll = 0;
  let nextLook = 0;
  let busy = false;

  const standing = () => list.filter((f) => festStanding(f, nowS()));
  const text = (/** @type {unknown} */ v, /** @type {number} */ max) => String(v ?? '').slice(0, max);

  /** Reads the registry, and says each festival not yet said. */
  function poll(force = false) {
    const now = performance.now();
    if (!deps.api || busy || (!force && now < nextPoll) || !deps.on()) return;
    busy = true;
    Promise.resolve(deps.api.festivalList()).then((/** @type {any} */ r) => {
      if (!r?.ok || !Array.isArray(r.festivals)) return;
      list = r.festivals.filter((/** @type {any} */ f) => Number.isSafeInteger(f?.id) && Number.isSafeInteger(f?.mapId) && Number.isFinite(f?.endsAt)).map((/** @type {any} */ f) => ({
        id: f.id, host: text(f.host, 40), mapId: f.mapId, town: text(f.town, 60), name: text(f.name, FEST_NAME_MAX), text: text(f.text, FEST_TEXT_MAX),
        startsAt: Number(f.startsAt) || 0, endsAt: Number(f.endsAt), mine: f.mine === true,
      }));
      for (const f of standing()) {
        if (told.has(f.id)) continue;
        told.add(f.id);
        if (!f.mine) { deps.say(festivalWords.begun(f.host, f.town, f.name)); if (f.text) deps.say(f.text); }
      }
    }).catch(() => {}).finally(() => { busy = false; nextPoll = performance.now() + FEST_POLL_MS; });
  }

  /** Lays Festival Cheer on the entity, renewed once it has run out. */
  function cheer(/** @type {any} */ e) {
    if ((e.activeEffects ?? []).some((/** @type {any} */ a) => a.bundleName === FEST_BUFF_NAME)) return false;
    const b = assignModBundle(e, { name: FEST_BUFF_NAME, kind: 'fortifyAttribute', rounds: FEST_BUFF_ROUNDS, sinks: {}, rolls: Math.random });
    Object.assign(b, { stat: FEST_BUFF_STAT, magnitude: FEST_BUFF_AMOUNT, bundleIcon: DISH_ICON });
    return true;
  }

  /** Asks for the festival's name, then its words, then hosts it. */
  function startHosting() {
    const e = deps.entity();
    const mapId = deps.mapIdNow() >>> 0;
    const town = mapId ? deps.townOf(mapId) : null;
    if (!e || !town) { deps.say(festivalWords.nowhere()); return; }
    if (goldPiecesOf(e) < FEST_COST_GOLD) { deps.say(festivalWords.poor()); return; }
    const later = (/** @type {() => void} */ fn) => { Promise.resolve().then(fn).catch(() => {}); };
    deps.show(new InputMessageBoxWindow({
      lines: [festivalWords.askName()], maxCharacters: FEST_NAME_MAX,
      onSubmit: (/** @type {string} */ name) => {
        if (!String(name ?? '').trim()) return;
        later(() => deps.show(new InputMessageBoxWindow({
          lines: [festivalWords.askText()], maxCharacters: FEST_TEXT_MAX,
          onSubmit: (/** @type {string} */ words) => { if (String(words ?? '').trim()) host(mapId, town.name, String(name), String(words)); },
        })));
      },
    }));
  }

  /** Hosts it: the gold is taken first and given back if the service says no. */
  function host(/** @type {number} */ mapId, /** @type {string} */ town, /** @type {string} */ name, /** @type {string} */ words) {
    const e = deps.entity();
    if (!e || goldPiecesOf(e) < FEST_COST_GOLD) { deps.say(festivalWords.poor()); return; }
    addGoldPieces(e, -FEST_COST_GOLD);
    Promise.resolve(deps.api.festivalHost({ mapId, town, host: deps.hostName(), name, text: words })).then((/** @type {any} */ r) => {
      if (!r?.ok || !r.festival) { addGoldPieces(e, FEST_COST_GOLD); deps.say(deps.refusal(r?.error ?? 'offline')); return; }
      list = [...list.filter((f) => f.id !== r.festival.id), { ...r.festival, mine: true }];
      told.add(r.festival.id);
      deps.say(festivalWords.started(r.festival.name));
      nextLook = 0;
    }).catch(() => { addGoldPieces(e, FEST_COST_GOLD); deps.say(deps.refusal('offline')); });
  }

  return {
    /** Whether the innkeeper lists the row: online. */
    on: () => !!deps.api && deps.on(),
    /** The innkeeper's row. */
    rowLabel: () => festivalWords.host(FEST_COST_GOLD),
    startHosting,
    /** Each frame: the registry read when due, and the buff laid on whoever stands in a festival's town. */
    frame() {
      if (!deps.api || !deps.on()) return;
      poll();
      const now = performance.now();
      if (now < nextLook) return;
      nextLook = now + FEST_BUFF_LOOK_MS;
      const here = deps.mapIdNow() >>> 0;
      const f = here ? standing().find((x) => x.mapId === here) : null;
      const e = deps.entity();
      if (!f || !e) return;
      if (cheer(e) && !joined.has(f.id)) { joined.add(f.id); deps.say(festivalWords.joined(f.name)); }
    },
    /** The held map's marks (ui/eventMapMarks.js readRaidMarks's shape): each standing festival at its town's pixel. */
    mapMarks() {
      const out = [];
      for (const f of standing()) {
        const town = deps.townOf(f.mapId);
        if (!town || !Number.isInteger(town.px) || !Number.isInteger(town.py)) continue;
        out.push({
          key: `festival:${f.id}`, px: town.px, py: town.py, label: `${f.town} · ${f.name}`.slice(0, CARD_LINE),
          tip: { title: f.name, lines: [f.town, ...cardLines(f.text), festivalWords.hostedBy(f.host), festivalWords.left(festMinutesLeft(f, nowS()))].slice(0, 5) },
        });
      }
      return out;
    },
    /** The festivals standing now (a read for the legend and tests). */
    standing,
  };
}
