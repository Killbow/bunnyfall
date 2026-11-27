// Decodes a raw LZ4 block with no frame. A match may overlap its own output (offset below length), so it copies
// byte by byte, not as a block copy.

const MIN_MATCH = 4;

/**
 * @param {Uint8Array} src
 * @param {number} outSize
 * @returns {Uint8Array}
 */
export function lz4BlockDecompress(src, outSize) {
  const out = new Uint8Array(outSize);
  let ip = 0;
  let op = 0;
  const n = src.length;
  while (ip < n) {
    const token = src[ip++];
    let litLen = token >>> 4;
    if (litLen === 15) {
      let s;
      do {
        if (ip >= n) throw new Error('lz4: literal length runs past the block');
        s = src[ip++];
        litLen += s;
      } while (s === 255);
    }
    if (ip + litLen > n || op + litLen > outSize) throw new Error('lz4: literals run past a buffer');
    for (let i = 0; i < litLen; i++) out[op++] = src[ip++];
    if (ip >= n) break;
    if (ip + 2 > n) throw new Error('lz4: truncated match offset');
    const offset = src[ip] | (src[ip + 1] << 8);
    ip += 2;
    if (offset === 0 || offset > op) throw new Error('lz4: match offset outside the output written so far');
    let matchLen = token & 15;
    if (matchLen === 15) {
      let s;
      do {
        if (ip >= n) throw new Error('lz4: match length runs past the block');
        s = src[ip++];
        matchLen += s;
      } while (s === 255);
    }
    matchLen += MIN_MATCH;
    if (op + matchLen > outSize) throw new Error('lz4: match runs past the output');
    let ref = op - offset;
    for (let i = 0; i < matchLen; i++) out[op++] = out[ref++];
  }
  if (op !== outSize) throw new Error(`lz4: block filled ${op} of ${outSize} bytes`);
  return out;
}
