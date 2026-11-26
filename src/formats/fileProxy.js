
// Consumes the full length and trims only trailing NULs, so an embedded NUL and the bytes after it stay in the
// string, as in DFU.
export function readCStringFixed(bytes, start, length) {
  let s = '';
  for (let i = start; i < start + length; i++) s += String.fromCharCode(bytes[i]);
  return s.replace(/\0+$/, '');
}

export function readCStringScan(bytes, start) {
  let end = start;
  while (end < bytes.length && bytes[end] !== 0) end++;
  let s = '';
  for (let i = start; i < end; i++) s += String.fromCharCode(bytes[i]);
  return s;
}
