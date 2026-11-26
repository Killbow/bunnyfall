
export const BIOG_QUESTION_COUNT = 12;
export const BIOG_QUESTION_LINES = 2;
export const DEFAULT_BACKSTORIES_START = 4116;

// Matches C# `int.TryParse`: the whole string must parse, outer whitespace is allowed, and the value must fit 32
// bits. Returns null on failure.
function tryParseInt(str) {
  const m = /^[ \t\n\r\f\v]*([+-]?[0-9]+)[ \t\n\r\f\v]*$/.exec(str);
  if (!m) return null;
  const v = Number(m[1]);
  if (!Number.isSafeInteger(v) || v < -2147483648 || v > 2147483647) return null;
  return v;
}

function splitFirst(line, sep) {
  const i = line.indexOf(sep);
  return i < 0 ? [line] : [line.slice(0, i), line.slice(i + 1)];
}

export function parseBiog(text, classIndex = 0) {
  const lines = text.split(/\r\n|\r|\n/);
  let p = 0;
  const next = () => (p < lines.length ? lines[p++] : null);
  let cur = next();
  let backstoryId = null;
  const questions = [];

  for (let i = 0; i < BIOG_QUESTION_COUNT; i++) {
    const q = { text: ['', ''], answers: [] };
    while (cur !== null && cur.length <= 1) cur = next();
    if (cur === null) break;

    if (i === 0 && cur[0] === '#') {
      const v = tryParseInt(cur.slice(1));
      backstoryId = v !== null ? v : DEFAULT_BACKSTORIES_START + classIndex;
      do { cur = next(); } while (cur !== null && cur.length <= 1);
      if (cur === null) break;
    }

    for (let j = 0; j < BIOG_QUESTION_LINES; j++) {
      if (cur === null) break;
      if (j === 0) {
        q.text[j] = (splitFirst(cur, '.')[1] ?? '').trim();
      } else if (cur.indexOf('.') !== 1 && cur.indexOf('.') !== 2) {
        q.text[j] = cur.trim();
      } else {
        break;
      }
      cur = next();
    }

    while (cur !== null && cur.indexOf('.') === 1 && /[a-zA-Z]/.test(cur[0])) {
      const answer = { text: (cur.split('.')[1] ?? '').trim(), effects: [] };
      cur = next();
      while (cur !== null && cur.indexOf('.') !== 1 && cur.length > 1) {
        answer.effects.push(cur.trim());
        cur = next();
      }
      q.answers.push(answer);
    }
    questions.push(q);
  }

  if (backstoryId === null) backstoryId = DEFAULT_BACKSTORIES_START + classIndex;
  return { backstoryId, questions };
}

export const biogFileName = (classIndex, set = 0) =>
  `BIOG${String(classIndex).padStart(2, '0')}T${set}.TXT`;
