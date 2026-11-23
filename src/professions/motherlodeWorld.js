// The world's Motherlode reads: the Motherlode Sense check, the lode words, and the map marks.
// It also gives oreMapAt, the ore card for a pixel on the held map. It asks the gather host once
// per pixel.
import { localWhenText } from '../worldEvents/eventTimers.js';
import { lodeMapMarks } from '../ui/lodeMapMark.js';
import { materialLabel } from './profItems.js';
import { oreMapTip } from '../ui/oreMapTip.js';
import { SURVEYOR } from '../net/professionLaw.js';

/** @param {any} shared */
export function createMotherlodeWorld(shared) {
  const { _lodesSensed, maps, motherlodeBook, profBook } = shared;
  /** Whether this character's Mining stands under the Motherlode Sense, online with the professions open. */
  const lodeSense = () => !!motherlodeBook && profBook?.state.open === true && profBook.track('mining').specs?.[100] === 'motherlode-sense';
  /** The words a Motherlode is named and timed in - AUDIT MINE-PERKS (the cold pass, A1): its hour on THIS machine's
   *  clock (TIME1's display, as the timers window's), its weekday where it is not today - a bare "13:00" was read as past
   *  across the date line from the UTC day the Motherlodes keep. */
  const lodeWords = { oreName: (m) => materialLabel(m).replace(/ Ore$/, ''), clock: (s) => localWhenText(s * 1000 - shared._sharedOffsetMs, Date.now()) };
  const lodeMapMarksNow = () => {
    if (!lodeSense()) return [];
    return lodeMapMarks(motherlodeBook.sensedAll(_lodesSensed), Math.floor((Date.now() + shared._sharedOffsetMs) / 1000), lodeWords);
  };
  /** ORE-MAP (ui/oreMapTip.js): A BARE PIXEL'S ORE CARD on the held map - its veins, its dungeons', its kingdom's own and
   *  whether the witnesses have vouched for its ground. The ground's witnessed state is the book's (net/profBook.js
   *  pixel); one the book has not heard today is asked once, after the pointer has rested on it ORE_ASK_MS, through the
   *  gathering host (gatherHost.askPixels - a pixel it stands is stood again on the answer, as its own ask does), and
   *  the card asked again (`again`) when the word comes. A pixel asked is never asked again on this page: a refused or
   *  silent ask leaves the card saying the rule, not a loop. */
  const ORE_ASK_MS = 400;
  const _oreAsked = new Set();
  let _oreAskTimer = null;
  const oreMapAt = (px, py, again) => {
    const fact = profBook?.state?.open === true ? profBook.pixel(px, py) : null;
    const k = `${px},${py}`;
    if (!fact && profBook?.state?.open === true && shared.gatherHost && !_oreAsked.has(k)) {
      clearTimeout(_oreAskTimer);
      _oreAskTimer = setTimeout(() => {
        if (_oreAsked.has(k)) return;
        _oreAsked.add(k);
        shared.gatherHost?.askPixels([[px, py]]).then(() => again?.(), () => {});
      }, ORE_ASK_MS);
    }
    const surveyed = profBook?.state?.open === true && profBook.track('mining').specs?.[100] === SURVEYOR;   // MINE-PERKS
    return oreMapTip({ climate: maps.getClimateIndex(px, py), region: maps.getRegionIndexAt(px, py), fact, surveyed });
  };
  return { lodeMapMarksNow, lodeSense, lodeWords, oreMapAt };
}
