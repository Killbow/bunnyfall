// @ts-check
// Every string is read through `t()` when used, never at import, so a language chosen after load applies.
import { t } from '../../ui/textManager.js';
import { KT_TEXT, ketchVoyageAt } from '../../net/ketch/ketchLaw.js';

export const KT_WORDS = Object.freeze({
  get name() { return t('ketch.name', 'The Sky-Ketch Mzunthar'); },
  get sighted() { return t('ketch.sighted', 'The Sky-Ketch has been sighted east of Daggerfall.'); },
  get arrived() { return t('ketch.arrived', 'The Sky-Ketch has arrived over Daggerfall. Its anchor-lift is down in the fields east of the city.'); },
  get departing() { return t('ketch.departing', 'The Ketch is weighing anchor. No one else can board this voyage.'); },
  get departed() { return t('ketch.departed', 'The Ketch has gone. It comes back every ten hours.'); },
  get boarding() { return t('ketch.boarding', 'The anchor-lift rises.'); },
  get lowered() { return t('ketch.lowered', 'The anchor-lift sets you down in the fields outside Daggerfall.'); },
  get noRest() { return t('ketch.noRest', 'You cannot rest aboard the Ketch.'); },
  get noSave() { return t('ketch.noSave', 'You cannot save aboard the Ketch.'); },
  get noMap() { return t('ketch.noMap', 'There is no map of the Ketch.'); },
  get noMark() { return t('ketch.noMark', 'You cannot set a Mark here.'); },
  get noRecall() { return t('ketch.noRecall', 'Recall does not work aboard the Ketch.'); },
  get noFlight() { return t('ketch.noFlight', 'The Sailwalk is walked, not flown.'); },
  get noUnstuck() { return t('ketch.noUnstuck', 'Use the anchor-lift or the stern lift to leave the Ketch.'); },
  get died() { return t('ketch.died', 'You fall from the Ketch and wake in the fields below.'); },
  get castBack() { return t('ketch.castBack', 'The rigging nets catch you and pull you back aboard.'); },
  get hatchOpen() { return t('ketch.hatchOpen', 'The Watch is broken. The hatch to the gun deck opens.'); },
  get holdOpen() { return t('ketch.holdOpen', 'The Hammer Wardens are down. The way to the hold opens.'); },
  get engineFed() { return t('ketch.engineFed', 'The engine wakes. The mast-lift is running.'); },
  get bridgeBarred() { return t('ketch.bridgeBarred', 'The bridge is barred.'); },
  get bridgeOpen() { return t('ketch.bridgeOpen', 'The bridge is open. The bosun\'s line runs from the main top.'); },
  get lineTaken() { return t('ketch.lineTaken', 'You ride the bosun\'s line down to the bridge.'); },
  get cabinOpen() { return t('ketch.cabinOpen', 'The Ketchmaster\'s cabin opens.'); },
});

// The first four keys mirror `KT_TEXT.refuse` in net/ketch/ketchLaw.js, because `ketchRefusal` matches the relay's
// English text to find the key.
export const KT_REFUSE_WORDS = Object.freeze({
  get closed() { return t('ketch.refuse.closed', 'The anchor-lift is up. No one can board while the Ketch weighs anchor.'); },
  get gone() { return t('ketch.refuse.gone', 'The Ketch is gone.'); },
  get crew() { return t('ketch.refuse.crew', 'This ship belongs to another party.'); },
  get full() { return t('ketch.refuse.full', 'This crew is full.'); },
  get busy() { return t('ketch.refuse.busy', 'The anchor-lift does not answer. Try again in a moment.'); },
  get offline() { return t('ketch.refuse.offline', 'Only an online crew can board the Ketch.'); },
  get away() { return t('ketch.refuse.away', 'The Ketch is not over Daggerfall right now. It comes every ten hours.'); },
});
export function ketchRefusal(err) {
  for (const [k, en] of Object.entries(KT_TEXT.refuse)) if (en === err) return KT_REFUSE_WORDS[/** @type {keyof typeof KT_REFUSE_WORDS} */ (k)];
  return err;
}

const STAGE_NAMES = Object.freeze([
  () => t('ketch.stage.watch', 'The Boarding Watch'),
  () => t('ketch.stage.gallery', 'The Gallery of Hammers'),
  () => t('ketch.stage.engine', 'The Starved Engine'),
  () => t('ketch.stage.sailwalk', 'The Sailwalk'),
  () => t('ketch.stage.bridge', 'The Tonal Warden'),
  () => t('ketch.stage.vault', 'The Ketchmaster\'s Cabin'),
]);
export const ketchStageName = (k) => STAGE_NAMES[k]?.() ?? '';
const PHASE_NAMES = Object.freeze([
  () => t('ketch.phase.1', 'The Steersman'),
  () => t('ketch.phase.2', 'The Discord'),
  () => t('ketch.phase.3', 'The Last Note'),
]);
export const ketchPhaseName = (n) => PHASE_NAMES[n - 1]?.() ?? '';
const BLOW_NAMES = Object.freeze({
  keel: () => t('ketch.blow.keel', 'Keel-Strike'),
  lash: () => t('ketch.blow.lash', 'Steam Lash'),
  ring: () => t('ketch.blow.ring', 'Tonal Ring'),
  wave: () => t('ketch.blow.wave', 'Tonal Wave'),
  discord: () => t('ketch.blow.discord', 'The Discord'),
  song: () => t('ketch.blow.song', 'The Keel-Song'),
  west: () => t('ketch.blow.west', 'The Ketch Turns West'),
});
export const ketchBlowName = (key) => (Object.hasOwn(BLOW_NAMES, key) ? BLOW_NAMES[/** @type {keyof typeof BLOW_NAMES} */ (key)]() : '');
const KIND_NAMES = Object.freeze({
  sphere: () => t('ketch.kind.sphere', 'Dwarven Sphere'),
  sentry: () => t('ketch.kind.sentry', 'Dwarven Sentry'),
  spider: () => t('ketch.kind.spider', 'Dwarven Spider'),
  warden: () => t('ketch.kind.warden', 'Hammer Warden'),
  captain: () => t('ketch.kind.captain', 'Watch-Captain'),
  tonal: () => t('ketch.kind.tonal', 'The Tonal Warden'),
});
export const ketchKindName = (key) => (Object.hasOwn(KIND_NAMES, key) ? KIND_NAMES[/** @type {keyof typeof KIND_NAMES} */ (key)]() : '');

export function ketchWhen(v, now) {
  const ms = v.phase === 'away' ? v.sightAt - now : v.phase === 'sighted' ? v.at - now : v.phase === 'docked' ? v.departAt - now : v.endAt - now;
  const m = Math.max(0, Math.ceil(ms / 60000)), h = Math.floor(m / 60), d = Math.floor(h / 24);
  return d >= 1 ? t('ketch.when.days', '{d}d {h}h', { d, h: h % 24 }) : h >= 1 ? t('ketch.when.hours', '{h}h {m}m', { h, m: m % 60 }) : t('ketch.when.minutes', '{m}m', { m });
}
export function ketchWhenLine(now) {
  const v = ketchVoyageAt(now), w = ketchWhen(v, now);
  if (v.phase === 'away') return t('ketch.left.away', 'sighted in {w}', { w });
  if (v.phase === 'sighted') return t('ketch.left.sighted', 'arrives in {w}', { w });
  if (v.phase === 'docked') return t('ketch.left.docked', 'over Daggerfall, {w} left', { w });
  return t('ketch.left.departing', 'weighing anchor, {w}', { w });
}
export function ketchSkyPhase(phase) {
  return phase === 'sighted' ? t('ketch.sky.sighted', 'Sighted in the east') : phase === 'docked' ? t('ketch.sky.docked', 'Keeping station over the fields') : t('ketch.sky.departing', 'Weighing anchor');
}
