import { getBool } from '../platform/settings.js';

export const NUDE_FLAT_STAND_INS = Object.freeze({
  '175_0': Object.freeze([182, 56]),
  '176_2': Object.freeze([176, 6]),
  '176_3': Object.freeze([176, 6]),
  '179_0': Object.freeze([179, 2]),
  '179_1': Object.freeze([179, 4]),
  '179_3': Object.freeze([179, 2]),
  '182_32': Object.freeze([182, 11]),
  '182_34': Object.freeze([182, 47]),
  '182_41': Object.freeze([182, 27]),
  '182_48': Object.freeze([182, 26]),
  '184_6': Object.freeze([182, 11]),
  '184_11': Object.freeze([184, 29]),
  '184_12': Object.freeze([184, 23]),
  '184_13': Object.freeze([184, 5]),
  '184_14': Object.freeze([184, 26]),
  '184_31': Object.freeze([182, 57]),
});

export const showNudity = () => getBool('ChildGuard', 'PlayerNudity');

export const isNudeFlat = (archive, record) => Object.hasOwn(NUDE_FLAT_STAND_INS, `${archive}_${record}`);

export function drawnFlat(archive, record, show = null) {
  const s = NUDE_FLAT_STAND_INS[`${archive}_${record}`];
  return s && !(show ?? showNudity()) ? [s[0], s[1]] : [archive, record];
}
