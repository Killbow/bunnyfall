// The split keeps every piece, including the empty string after a trailing NUL, as C# `String.Split` does.

export class BioFile {
  constructor() {
    /** @type {string[]} */
    this.lines = [];
  }

  /** @param {Uint8Array|ArrayBuffer} buffer */
  load(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    let text = '';
    for (let i = 0; i < bytes.length; i++) text += String.fromCharCode(bytes[i]);
    this.lines = text.split('\0');
    return true;
  }
}
