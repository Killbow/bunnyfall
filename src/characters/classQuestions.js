// Generate-class wizard questionnaire: the TEXT.RSC 9000 question library, the FALL.EXE answer table,
// the ten-unique-question pick, and the CLASSES.DAT results walk that turns ten answers into a class index.
// The questionnaire is one classic record whose forty questions are delimited by literal '{' characters.

export const CLASS_QUESTIONS_TEXT_ID = 9000;
export const QUESTION_COUNT = 10;
export const NO_CLASS_INDEX = 255;
export const QUESTION_LIBRARY_SIZE = 40;

export const ANSWER_TABLE = Object.freeze([
  0, 2, 1,
  0, 2, 1,
  0, 1, 2,
  2, 0, 1,
  0, 1, 2,
  1, 0, 2,
  0, 1, 2,
  2, 0, 1,
  0, 2, 1,
  0, 1, 2,
  0, 1, 2,
  0, 1, 2,
  0, 2, 1,
  0, 1, 2,
  1, 0, 2,
  1, 2, 0,
  2, 0, 1,
  1, 0, 2,
  0, 1, 2,
  2, 0, 1,
  1, 0, 2,
  0, 1, 2,
  0, 2, 1,
  2, 1, 0,
  1, 0, 2,
  0, 2, 1,
  2, 1, 0,
  2, 0, 1,
  2, 1, 0,
  2, 1, 0,
  2, 0, 1,
  1, 0, 2,
  0, 2, 1,
  2, 1, 0,
  1, 2, 0,
  2, 0, 1,
  2, 0, 1,
  1, 2, 0,
  0, 1, 2,
  1, 2, 0,
]);

export function parseQuestionLibrary(textRsc) {
  if (textRsc?.localeTokensByKey?.(`${CLASS_QUESTIONS_TEXT_ID}.1`)) {
    const library = [];
    for (let q = 1; q <= QUESTION_LIBRARY_SIZE; q++) {
      const tokens = textRsc.localeTokensByKey(`${CLASS_QUESTIONS_TEXT_ID}.${q}`) ?? [];
      library.push(tokens.map((t) => { const split = t.text.split(/\d+[.]/); return split.length > 1 ? split[1] : split[0]; }).join('\n'));
    }
    return library;
  }
  if (!textRsc?.hasRecord?.(CLASS_QUESTIONS_TEXT_ID)) return null;
  const parts = textRsc.plainText(CLASS_QUESTIONS_TEXT_ID)[0].split('{');
  const library = [];
  for (let q = 1; q <= QUESTION_LIBRARY_SIZE; q++) {
    const lines = (parts[q] ?? '').split('\n').map((line) => {
      const split = line.split(/\d+[.]/);
      return split.length > 1 ? split[1] : split[0];
    });
    library.push(lines.join('\n'));
  }
  return library;
}

export function displayQuestion(questionText) {
  const lines = questionText.split('\n').filter((x) => x !== '');
  let aIndex = 0, bIndex = 0, cIndex = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('a)')) aIndex = i;
    else if (lines[i].includes('b)')) bIndex = i;
    else if (lines[i].includes('c)')) cIndex = i;
  }
  return { lines, aIndex, bIndex, cIndex };
}

export function pickQuestionIndices(librarySize, rolls = Math.random) {
  const picked = new Set();
  const indices = [];
  for (let i = 0; i < QUESTION_COUNT; i++) {
    let index = Math.floor(rolls() * librarySize);
    while (picked.has(index)) index = (index + 1) % librarySize;
    picked.add(index);
    indices.push(index);
  }
  return indices;
}

export function answerWeightIndex(questionLibraryIndex, column) {
  return ANSWER_TABLE[questionLibraryIndex * 3 + column];
}

const weightsToUint = (w1, w2, w3) => (w1 | (w2 << 8) | (w3 << 16)) >>> 0;

export function getHeaderIndex(classData, weights) {
  const want = weightsToUint(weights[0], weights[1], weights[2]);
  // The loop bound 66 is DFU's own and equals the number of triples summing to ten.
  let resultsOffset = 18;
  for (let i = 0; i < 66; i++, resultsOffset += 3) {
    if (weightsToUint(classData[resultsOffset], classData[resultsOffset + 1], classData[resultsOffset + 2]) === want) {
      return Math.floor(i / 4);
    }
  }
  return -1;
}

export function getClassIndex(headerIndex, classData) {
  let r = classData[headerIndex];
  if (headerIndex > 3) r &= 0x0f;
  return r;
}

export function resolveClassIndex(classData, weights) {
  const headerIndex = getHeaderIndex(classData, weights);
  if (headerIndex === -1) return null;
  return getClassIndex(headerIndex, classData);
}
