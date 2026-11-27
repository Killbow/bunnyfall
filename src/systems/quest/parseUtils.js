// Leaf module: resource modules use these helpers, and importing them via parser.js would form an import cycle.

export function splitLine(text, trim = true) {
  const parts = text.split(/\s+/).filter((s) => s.length);
  return trim ? parts.map((s) => s.trim()) : parts;
}

export function splitField(text, expectedCount = 2, trim = true) {
  const parts = text.split(':');
  if (parts.length !== expectedCount && expectedCount !== -1) {
    throw new Error('SplitField() encountered invalid number of results.');
  }
  return trim ? parts.map((s) => s.trim()) : parts;
}

export const getFieldStringValue = (text) => splitField(text)[1].trim();
export const getFieldIntValue = (text) => parseInt(splitField(text)[1].trim());

// Matches C# int.Parse with NumberStyles.Integer: surrounding whitespace, one leading sign, and digits.
const INT_SURFACE = /^\s*[+-]?\d+\s*$/;
const inInt32 = (n) => n <= 2147483647 && n >= -2147483648;

export function intTryParse(text) {
  if (typeof text !== 'string' || !INT_SURFACE.test(text)) return null;
  const n = Number.parseInt(text, 10);
  return inInt32(n) ? n : null;
}

export function intParse(text) {
  const n = intTryParse(text);
  if (n !== null) return n;
  const onSurface = typeof text === 'string' && INT_SURFACE.test(text);
  throw new Error(`int.Parse ${onSurface ? 'overflow' : 'failed'} on '${text}'`);
}

export function parseInt(text) {
  if (text == null || text === '') return 0;
  return intParse(text);
}
