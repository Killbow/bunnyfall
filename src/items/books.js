import { BOOK_ID_TITLES } from './booksData.js';
import { messageToBookFilename, BookFile } from '../formats/bookFile.js';
import { templateByIndex, mintCondition } from './itemTemplates.js';
import { localizedBookExists, localizedBookHeader } from '../ui/localizedBook.js';
import { globalVarsTable } from '../systems/quest/tables.js';
import { PORT_BOOK_IDS, isPortBook, portBookTitle, portBookPrice } from './portBooks.js';

const BOOK_IDS = Object.freeze([...BOOK_ID_TITLES.keys()]);
export const SHELF_BOOK_IDS = Object.freeze([...BOOK_IDS, ...PORT_BOOK_IDS]);

export const BOOK_TEMPLATE = 277;

// Book id 10000 is a legacy alias of book 5, kept for old saves.
const bookFileNameQuiet = (id) => {
  const key = id === 10000 ? 5 : id;
  return BOOK_ID_TITLES.has(key) || isPortBook(key) ? messageToBookFilename(key) : null;
};

export function getBookFileName(id) {
  const name = bookFileNameQuiet(id);
  if (name == null) console.warn(`[books] ID ${id} is not assigned to any known book`);
  return name;
}

const _unreadable = new Set();
const drawable = (ids) => {
  if (!_unreadable.size) return ids;
  const ok = ids.filter((id) => !_unreadable.has(id));
  return ok.length ? ok : ids;
};

export function getRandomBookID(roll = Math.random) {
  const ids = drawable(BOOK_IDS);
  for (let i = 0; i < 6; i++) {
    const id = ids[Math.floor(roll() * ids.length)];
    if (localizedBookExists(bookFileNameQuiet(id))) {
      if (localizedBookMeetsConditions(id)) return id;
      continue;
    }
    return id;
  }
  return ids[0];
}

let _globalVarSet = null;
export function setBookGlobalVars(fn) { _globalVarSet = typeof fn === 'function' ? fn : null; }

export function localizedBookMeetsConditions(id) {
  const book = localizedBookHeader(bookFileNameQuiet(id));
  if (!book) return false;
  let globalVar = -1, globalVarSet = false;
  if (book.whenVarSet) {
    let table = null;
    // Before the quest tables load this throws, and then no global variable gates the book.
    try { table = globalVarsTable(); } catch { }
    if (table?.hasValue(book.whenVarSet)) {
      globalVar = Number.parseInt(table.getValue('id', book.whenVarSet), 10);
      globalVarSet = !!_globalVarSet?.(globalVar);
    }
  }
  return !book.isUnique && (globalVar === -1 || globalVarSet);
}

export function getShelfBookID(roll = Math.random) {
  const ids = drawable(SHELF_BOOK_IDS);
  return ids[Math.floor(roll() * ids.length)];
}

export function bookTitle(id) {
  const key = id === 10000 ? 5 : id;
  const localized = localizedBookHeader(bookFileNameQuiet(key));
  if (localized) return localized.title;
  return BOOK_ID_TITLES.get(key) ?? portBookTitle(id);
}

export const CLASSIC_BOOK_COUNT = BOOK_IDS.length;

const _bookPrices = new Map();
let _warnedNoPrices = false;
const _bookFilesRead = new Set();

export function setBookPrice(id, price) {
  if (Number.isFinite(price) && price > 0) _bookPrices.set(id === 10000 ? 5 : id, Math.trunc(price));
}
export const bookPriceCount = () => _bookPrices.size;
export function clearBookPrices() { _bookPrices.clear(); _unreadable.clear(); _bookFilesRead.clear(); _warnedNoPrices = false; }

export const bookFilePrice = (id) => (isPortBook(id) ? portBookPrice(id) : _bookPrices.get(id === 10000 ? 5 : id) ?? null);

// A book's value is the price stored in its file, not the template basePrice; the host loads those prices.
// Without them it falls back to the basePrice, where classic Daggerfall would price an unread book at 0.
export function bookValue(id) {
  const price = bookFilePrice(id);
  if (price != null) return price;
  if (!_warnedNoPrices) {
    _warnedNoPrices = true;
    console.log('[books] no BOOKS prices registered - book values fall back to the template basePrice (loud interim: warm them with preloadBookPrices)');
  }
  return templateByIndex(BOOK_TEMPLATE)?.basePrice ?? 0;
}

export function createRandomBook(rolls = Math.random, draw = getRandomBookID) {
  // Draw the book id before the variant; seeded rolls depend on this order.
  const message = draw(rolls);
  const variant = Math.floor(rolls() * (templateByIndex(BOOK_TEMPLATE)?.variants ?? 0));
  return mintCondition({
    group: 'Books',
    templateIndex: BOOK_TEMPLATE,
    name: templateByIndex(BOOK_TEMPLATE)?.name,
    message,
    variant,
    value: bookValue(message),
  });
}

export const createShelfBook = (rolls = Math.random) => createRandomBook(rolls, getShelfBookID);

export function createBook(id) {
  if (bookFileNameQuiet(id) == null) return null;
  return mintCondition({
    group: 'Books',
    templateIndex: BOOK_TEMPLATE,
    name: templateByIndex(BOOK_TEMPLATE)?.name,
    // Keep the id as given: the 10000 alias applies only to the file name.
    message: id,
    value: bookValue(id),
  });
}

// Mints are synchronous, so every book file's price is read once up front instead of at each mint.
export async function loadBookPrices(fetchBytes) {
  if (typeof fetchBytes !== 'function') return _bookPrices.size;
  await Promise.all(BOOK_IDS.map(async (id) => {
    const name = bookFileNameQuiet(id);
    if (!name || _bookFilesRead.has(name)) return;
    _bookFilesRead.add(name);
    try {
      const bf = new BookFile();
      bf.load(await fetchBytes(name), name);
      setBookPrice(id, bf.price);
    } catch (e) {
      // A dropped download is read again next time; any other failure leaves the book out of random draws.
      if (e instanceof TypeError) _bookFilesRead.delete(name);
      else _unreadable.add(id);
    }
  }));
  return _bookPrices.size;
}
