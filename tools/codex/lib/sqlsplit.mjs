// Splits D1 migration SQL into individual statements using Wrangler's quoting and compound rules.

/** @param {string} sql */
function trimSqlQuery(sql) {
  if (!sql.includes('BEGIN TRANSACTION')) return sql;
  const trimmed = sql.replace('BEGIN TRANSACTION;', '').replace('COMMIT;', '');
  if (trimmed.includes('BEGIN TRANSACTION')) {
    throw new Error('SQL file contains multiple transactions; D1 runs each migration in one transaction.');
  }
  return trimmed;
}

/** @param {string} sql */
function mayContainMultipleStatements(sql) {
  const trimmed = sql.trimEnd();
  const at = trimmed.indexOf(';');
  return at !== -1 && at !== trimmed.length - 1;
}

/** @param {string} sql @returns {string[]} */
export function splitSqlQuery(sql) {
  const trimmed = trimSqlQuery(sql);
  if (!mayContainMultipleStatements(trimmed)) return [trimmed];
  const split = splitSqlIntoStatements(trimmed);
  return split.length === 0 ? [trimmed] : split;
}

/** @param {Iterator<string>} iterator @param {(tail: string) => boolean} predicate @param {number} [window] */
function consumeWhile(iterator, predicate, window = 16) {
  let next = iterator.next();
  let str = '';
  let tail = '';
  while (!next.done) {
    str += next.value;
    tail = (tail + next.value).slice(-window);
    if (!predicate(tail)) break;
    next = iterator.next();
  }
  return str;
}

/** @param {Iterator<string>} iterator @param {string} endMarker */
const consumeUntilMarker = (iterator, endMarker) =>
  consumeWhile(iterator, (str) => !str.endsWith(endMarker), endMarker.length);

/** @param {string} str */
function isDollarQuoteIdentifier(str) {
  const last = str.slice(-1);
  return last !== '$' && (/[0-9_]/i.test(last) || last.toLowerCase() !== last.toUpperCase());
}

const isCompoundStatementStart = (/** @type {string} */ str) => /\s(BEGIN|CASE)\s$/i.test(str);
const isCompoundStatementEnd = (/** @type {string} */ str) => /\sEND[;\s]$/i.test(str);

/** @param {string} sql @returns {string[]} */
export function splitSqlIntoStatements(sql) {
  const statements = [];
  let str = '';
  /** @type {((s: string) => boolean)[]} */
  const compound = [];
  const iterator = sql[Symbol.iterator]();
  let next = iterator.next();
  while (!next.done) {
    const char = next.value;
    if (compound[0]?.(str + char)) compound.shift();
    switch (char) {
      case "'":
      case '"':
      case '`':
        str += char + consumeUntilMarker(iterator, char);
        break;
      case '$': {
        const dollarQuote = `$${consumeWhile(iterator, isDollarQuoteIdentifier)}`;
        str += dollarQuote;
        if (dollarQuote.endsWith('$')) str += consumeUntilMarker(iterator, dollarQuote);
        break;
      }
      case '-':
        next = iterator.next();
        if (!next.done && next.value === '-') {
          consumeUntilMarker(iterator, '\n');
          str += '\n';
          break;
        }
        str += char;
        continue;
      case '/':
        next = iterator.next();
        if (!next.done && next.value === '*') {
          consumeUntilMarker(iterator, '*/');
          break;
        }
        str += char;
        continue;
      case ';':
        if (compound.length === 0) {
          statements.push(str);
          str = '';
        } else {
          str += char;
        }
        break;
      default:
        str += char;
        break;
    }
    if (isCompoundStatementStart(str)) compound.unshift(isCompoundStatementEnd);
    next = iterator.next();
  }
  statements.push(str);
  return statements.map((s) => s.trim()).filter((s) => s.length > 0);
}
