// Daggerfall Enemy Expansion's CSV reading: BestiaryMod's SplitCsvLine, ParseArrayArg, and ParseBool,
// ported exactly, quirks included, because every cell it reads goes through them.

const CSV_SPLIT = /(?:^|,)("(?:\\"|[^"])*"|[^,]*)/g;

// An empty first cell is added twice, so `,a,b` reads `["", "", "b"]` as in the C#.
export function splitCsvLine(line) {
  const list = [];
  for (const m of String(line).matchAll(CSV_SPLIT)) {
    const curr = m[0];
    if (curr.length === 0) list.push('');
    list.push(curr.replace(/^[,;]+/, '').replaceAll('\\"', '"').replace(/^"+|"+$/g, ''));
  }
  return list;
}

export const splitCsvHeader = (header) => String(header).split(/[;,]/).map((f) => f.replace(/^"+|"+$/g, ''));

export function csvLines(text) {
  const lines = String(text).replace(/^﻿/, '').split(/\r\n|\n|\r/);
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

export function parseArrayArg(arg, context = '') {
  if (arg == null || arg === '') return [];
  let a = String(arg);
  if (a[0] === '[' || a[0] === '{') {
    if ((a[0] === '[' && a[a.length - 1] !== ']') || (a[0] === '{' && a[a.length - 1] !== '}')) {
      throw new Error(`Error parsing (${context}): array argument has mismatched brackets`);
    }
    a = a.slice(1, -1);
  }
  return a.split(/[,;]/).map((frame) => parseCsInt(frame === '' ? '-1' : frame, context));
}

export function parseFloatArrayArg(arg, context = '') {
  if (arg == null || arg === '') return [];
  let a = String(arg);
  if (a[0] === '[' || a[0] === '{') {
    if ((a[0] === '[' && a[a.length - 1] !== ']') || (a[0] === '{' && a[a.length - 1] !== '}')) {
      throw new Error(`Error parsing (${context}): array argument has mismatched brackets`);
    }
    a = a.slice(1, -1);
  }
  return a.split(/[,;]/).map((s) => {
    const v = (s === '' ? '-1' : s).trim();
    if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(v)) throw new Error(`Error parsing (${context}): '${s}' is not a number`);
    return Number(v);
  });
}

export function parseBool(value, context = '') {
  if (value == null || value === '') return false;
  if (String(value).toLowerCase() === 'true') return true;
  if (String(value).toLowerCase() === 'false') return false;
  throw new Error(`Error parsing (${context}): invalid boolean value '${value}'`);
}

export function parseCsInt(s, context = '') {
  const v = String(s).trim();
  if (!/^[+-]?\d+$/.test(v)) throw new Error(`Error parsing (${context}): '${s}' is not an integer`);
  return Number.parseInt(v, 10);
}

export function readCsvTable(text) {
  const lines = csvLines(text);
  const fields = splitCsvHeader(lines[0] ?? '');
  const lower = fields.map((f) => f.toLowerCase());
  const column = (name) => { const i = lower.indexOf(String(name).toLowerCase()); return i === -1 ? null : i; };
  const rows = lines.slice(1).map((line, i) => ({ lineNumber: i + 2, line, tokens: splitCsvLine(line) }));
  return { fields, column, rows };
}
