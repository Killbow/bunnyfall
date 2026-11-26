export function getInnerSymbolName(symbol) {
  if (!symbol) return '';
  // C# runs all three trims on `symbol`, not on the previous result, so only Trim('_') takes effect.
  // This matches the C# source on purpose ("=sym_" keeps its '=').
  let result;
  result = trimChar(symbol, '=');
  result = trimChar(symbol, '#');
  result = trimChar(symbol, '_');
  return result;
}

function trimChar(s, ch) {
  let start = 0, end = s.length;
  while (start < end && s[start] === ch) start++;
  while (end > start && s[end - 1] === ch) end--;
  return s.slice(start, end);
}

export class Symbol {
  constructor(original = null) {
    this.original = null;
    this.name = null;
    if (original !== null) this.setValue(original);
  }

  setValue(original) {
    this.original = original;
    this.name = getInnerSymbolName(original);
  }

  clone() {
    const c = new Symbol();
    c.original = this.original;
    c.name = this.name;
    return c;
  }
}

// Saves store only `original`; `name` re-derives in the constructor.
export const symbolToSaveData = (sym) => (sym ? { original: sym.original } : null);
export const symbolFromSaveData = (data) => (data ? new Symbol(data.original) : null);
