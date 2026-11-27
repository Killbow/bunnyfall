// @ts-check
import { registerModSaveData } from '../saves/modSaveData.js';
import { isSigilStone } from './gateSpoils.js';
import { createBook } from '../items/books.js';
import { BURNING_DOORS_ID } from '../items/portBooks.js';

export const BREACH_BOOK_TEXT = "A Mages Guild courier finds you: 'On the Burning Doors', with the Guild's compliments.";

// Save key for the given flag; renaming it loses the record in existing saves.
export const BREACH_BOOK_SAVE_VENDOR = 'BreachBook';
let _given = false;
export const breachBookGiven = () => _given;

export function breachBookFor(item) {
  if (_given || !isSigilStone(item)) return null;
  const book = createBook(BURNING_DOORS_ID);
  if (book) _given = true;
  return book;
}

registerModSaveData(BREACH_BOOK_SAVE_VENDOR, {
  newSaveData: () => ({ given: false }),
  getSaveData: () => ({ given: _given }),
  restoreSaveData: (r) => { _given = r?.given === true; },
});
