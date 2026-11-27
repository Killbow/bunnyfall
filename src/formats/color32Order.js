// Textures reach the GPU in getColor32 order, where row 0 is the bottom row, and upload with no Y flip. A top-down
// raster from a PNG or canvas converts here exactly once on the way in, so callers must not flip it again.

/**
 * @param {{width:number,height:number,data:Uint8Array}} image
 * @returns {{width:number,height:number,data:Uint8Array}}
 */
export function toColor32Order(image) {
  const { width, height, data } = image;
  const row = width * 4;
  if (data.length !== row * height) throw new Error(`${width}x${height} carries ${data.length} bytes`);
  const out = new Uint8Array(data.length);
  for (let y = 0; y < height; y++) out.set(data.subarray(y * row, (y + 1) * row), (height - 1 - y) * row);
  return { width, height, data: out };
}

/**
 * Same result as `toColor32Order`, but reverses the rows of `image.data` in place.
 * @param {{width:number,height:number,data:Uint8Array}} image
 * @returns {{width:number,height:number,data:Uint8Array}}
 */
export function toColor32OrderInPlace(image) {
  const { width, height, data } = image;
  const row = width * 4;
  if (data.length !== row * height) throw new Error(`${width}x${height} carries ${data.length} bytes`);
  const tmp = new Uint8Array(row);
  for (let y = 0, z = height - 1; y < z; y++, z--) {
    const a = y * row, b = z * row;
    tmp.set(data.subarray(a, a + row));
    data.copyWithin(a, b, b + row);
    data.set(tmp, b);
  }
  return { width, height, data };
}

/**
 * @param {{width:number,height:number,data:Uint8Array}} image
 * @returns {{width:number,height:number,colors:Uint8ClampedArray}}
 */
export function toColor32(image) {
  const { width, height, data } = toColor32Order(image);
  return { width, height, colors: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength) };
}

/**
 * Screen quads draw row 0 at the top, so a decoded PNG drawn on screen keeps its rows as they are. World billboards
 * need `toColor32` instead.
 * @param {{width:number,height:number,data:Uint8Array}} image
 * @returns {{width:number,height:number,colors:Uint8ClampedArray}}
 */
export function toScreenOrder(image) {
  const { width, height, data } = image;
  const row = width * 4;
  if (data.length !== row * height) throw new Error(`${width}x${height} carries ${data.length} bytes`);
  return { width, height, colors: new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength) };
}

export function bitmapToColor32(bmp, palette, alphaIndex = 0) {
  const colors = new Uint32Array(bmp.width * bmp.height);
  const u8 = new Uint8Array(colors.buffer);
  for (let i = 0; i < bmp.data.length; i++) {
    const idx = bmp.data[i];
    const o = i * 4;
    if (idx === alphaIndex) continue;
    const c = palette.get(idx);
    u8[o] = c.r; u8[o + 1] = c.g; u8[o + 2] = c.b; u8[o + 3] = 255;
  }
  return { width: bmp.width, height: bmp.height, colors };
}
