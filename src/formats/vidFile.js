
const VID = 'VID';
const SAMPLE_RATE = 11025;
const PALETTE_DATA_LENGTH = 768;
const PALETTE_COLOR_COUNT = 256;
const PALETTE_MULTIPLIER = 4;
const MIN_FRAME_DELAY = 740 / SAMPLE_RATE;

export const VID_SAMPLE_RATE = SAMPLE_RATE;
export const VID_MIN_FRAME_DELAY = MIN_FRAME_DELAY;

export const VID_BLOCK_TYPES = Object.freeze({
  Null: 0,
  Video_IncrementalFrame: 1,
  Palette: 2,
  Video_StartFrame: 3,
  Video_IncrementalRowOffsetFrame: 4,
  EndOfFile: 20,
  Audio_StartFrame: 124,
  Audio_IncrementalFrame: 125,
});

class VidReader {
  constructor(bytes) {
    this.bytes = bytes;
    this.position = 0;
  }

  readByte() {
    if (this.position >= this.bytes.length) throw new Error('VidFile: end of stream.');
    return this.bytes[this.position++];
  }

  readUInt16() {
    const lo = this.readByte();
    const hi = this.readByte();
    return lo | (hi << 8);
  }

  readBytes(count) {
    if (this.position >= this.bytes.length) return new Uint8Array(0);
    const end = Math.min(this.position + count, this.bytes.length);
    const out = this.bytes.subarray(this.position, end);
    this.position = end;
    return out;
  }

  readCString(length) {
    const raw = this.readBytes(length);
    let end = raw.length;
    while (end > 0 && raw[end - 1] === 0) end--;
    return String.fromCharCode(...raw.subarray(0, end));
  }
}

export class VidFile {
  constructor() {
    this.header = null;
    this.reader = null;
    this.palette = null;
    this._frameBuffer = null;
    this._audioBuffer = null;
    this._lastBlockType = VID_BLOCK_TYPES.Null;
    this._currentBlock = 0;
    this._lastDelay = 0;
    this._frameDelay = 0;
    this.streamPosition = 0;
    this._endOfFileReached = false;
  }

  get frameCount() { return this.header.frameCount; }
  get frameWidth() { return this.header.frameWidth; }
  get frameHeight() { return this.header.frameHeight; }
  get sampleRate() { return SAMPLE_RATE; }
  get audioBuffer() { return this._audioBuffer; }
  get frameBuffer() { return this._frameBuffer; }
  get frameDelay() { return this._frameDelay; }
  get currentBlock() { return this._currentBlock; }
  get lastBlockType() { return this._lastBlockType; }
  get endOfFile() { return this._endOfFileReached; }
  get lastDelay() { return this._lastDelay; }

  /**
   * @param {Uint8Array} bytes
   * @returns {boolean}
   */
  open(bytes) {
    if (!bytes || bytes.length === 0) {
      this._endOfFileReached = true;
      return false;
    }

    this.reader = new VidReader(bytes);
    this._readHeader();
    this._readPalette();

    this.streamPosition = this.reader.position;
    this._endOfFileReached = false;
    this._currentBlock = 0;

    return true;
  }

  readNextBlock() {
    this._readBlock();
  }

  _readBlock() {
    if (this._endOfFileReached) return 0;

    const reader = this.reader;
    reader.position = this.streamPosition;

    // This read sits outside the try, so a stream that ends before an EndOfFile block throws out of
    // `readNextBlock`.
    const blockType = reader.readByte();
    this._lastBlockType = blockType;

    if (blockType === VID_BLOCK_TYPES.Null) {
      this.streamPosition = reader.position;
      return 0;
    }

    try {
      switch (blockType) {
        case VID_BLOCK_TYPES.Palette:
          // DFU parity: the `streamPosition = reader.position` below undoes this skip, so a mid-stream palette
          // block desyncs the stream.
          this.streamPosition += PALETTE_DATA_LENGTH;
          break;
        case VID_BLOCK_TYPES.Audio_StartFrame:
          this._readAudioStartFrame();
          break;
        case VID_BLOCK_TYPES.Audio_IncrementalFrame:
          this._readAudioIncrementalFrame();
          break;
        case VID_BLOCK_TYPES.Video_StartFrame:
          this._readVideoStartFrame();
          break;
        case VID_BLOCK_TYPES.Video_IncrementalFrame:
          this._readVideoIncrementalFrame();
          break;
        case VID_BLOCK_TYPES.Video_IncrementalRowOffsetFrame:
          this._readVideoRowOffsetFrame();
          break;
        case VID_BLOCK_TYPES.EndOfFile:
          this._endOfFileReached = true;
          break;
        default:
          throw new Error('VidFile: Invalid/Unknown block type encountered.');
      }
    } catch {
      // DFU parity: a failed block leaves `streamPosition` unchanged, so the next call reads the same block again.
      return 0;
    }

    // Every block takes its delay from the last audio block. With no audio block read yet this throws, as in DFU.
    this._frameDelay = this._audioBuffer.length / SAMPLE_RATE;

    // A floor of 740 samples keeps the short audio blocks at the ends of ANIM0000.VID and ANIM0005.VID from
    // speeding playback up.
    if (this._frameDelay < MIN_FRAME_DELAY) {
      this._frameDelay = MIN_FRAME_DELAY;
    }

    const bytesRead = reader.position - this.streamPosition;
    this.streamPosition = reader.position;
    this._currentBlock++;

    return bytesRead;
  }

  _readHeader() {
    const reader = this.reader;

    const vid = reader.readCString(3);
    if (vid !== VID) throw new Error('VidFile: Invalid VID header encountered.');

    this.header = {
      vid,
      unknown1: reader.readUInt16(),
      frameCount: reader.readUInt16(),
      frameWidth: reader.readUInt16(),
      frameHeight: reader.readUInt16(),
      globalDelay: reader.readUInt16(),
      unknown2: reader.readUInt16(),
    };

    this._frameBuffer = new Uint8Array(this.header.frameWidth * this.header.frameHeight * 4);
  }

  _readPalette() {
    const reader = this.reader;
    const blockType = reader.readByte();
    if (blockType !== VID_BLOCK_TYPES.Palette) {
      throw new Error('VidFile: Palette block not encountered after header.');
    }

    let pos = 0;
    const data = reader.readBytes(PALETTE_DATA_LENGTH);
    this.palette = new Uint8Array(PALETTE_COLOR_COUNT * 4);
    for (let i = 0; i < PALETTE_COLOR_COUNT; i++) {
      this.palette[i * 4 + 0] = (data[pos++] * PALETTE_MULTIPLIER) & 0xff;
      this.palette[i * 4 + 1] = (data[pos++] * PALETTE_MULTIPLIER) & 0xff;
      this.palette[i * 4 + 2] = (data[pos++] * PALETTE_MULTIPLIER) & 0xff;
      this.palette[i * 4 + 3] = 255;
    }
  }

  _readAudioStartFrame() {
    const reader = this.reader;
    const block = {
      unknown1: reader.readUInt16(),
      playbackRate: reader.readByte(),
      dataLength: 0,
    };
    block.dataLength = reader.readUInt16();
    this._audioBuffer = reader.readBytes(block.dataLength);

    if (block.playbackRate !== 166) throw new Error('VidFile: Unknown PlaybackRate encountered.');

    return block;
  }

  _readAudioIncrementalFrame() {
    const reader = this.reader;
    const block = { dataLength: reader.readUInt16() };
    this._audioBuffer = reader.readBytes(block.dataLength);

    return block;
  }

  _readVideoStartFrame() {
    this._lastDelay = this.reader.readUInt16();

    this._readVideoFullFrameData();
  }

  _readVideoRowOffsetFrame() {
    this._lastDelay = this.reader.readUInt16();
    const row = this.reader.readUInt16();

    this._readVideoPartialFrameData(row * this.frameWidth);
  }

  _readVideoIncrementalFrame() {
    this._lastDelay = this.reader.readUInt16();

    this._readVideoPartialFrameData(0);
  }

  _putPixel(pos, index) {
    if (pos < 0 || pos * 4 >= this._frameBuffer.length) {
      throw new Error('VidFile: frame buffer index out of range.');
    }
    const s = index * 4;
    const d = pos * 4;
    this._frameBuffer[d + 0] = this.palette[s + 0];
    this._frameBuffer[d + 1] = this.palette[s + 1];
    this._frameBuffer[d + 2] = this.palette[s + 2];
    this._frameBuffer[d + 3] = this.palette[s + 3];
  }

  _readVideoFullFrameData() {
    const reader = this.reader;
    const length = this._frameBuffer.length / 4;
    let pos = 0;
    let count = 0;
    while (pos < length) {
      let input = reader.readByte();
      if (input >= 0x80) {
        count = input - 0x80;
        input = reader.readByte();
        for (let i = 0; i < count; i++) {
          this._putPixel(pos++, input);
        }
      } else if (input === 0) {
        break;
      } else {
        count = input;
        for (let i = 0; i < count; i++) {
          const index = reader.readByte();
          this._putPixel(pos++, index);
        }
      }
    }
  }

  _readVideoPartialFrameData(pos) {
    const reader = this.reader;
    const length = this._frameBuffer.length / 4;
    let count = 0;
    while (pos < length) {
      const input = reader.readByte();
      if (input >= 0x80) {
        count = input - 0x80;
        pos += count;
      } else if (input === 0) {
        break;
      } else {
        count = input;
        for (let i = 0; i < count; i++) {
          const index = reader.readByte();
          this._putPixel(pos++, index);
        }
      }
    }
  }
}
