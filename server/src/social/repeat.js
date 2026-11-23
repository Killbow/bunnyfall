// A social word repeated between the same two players inside SOCIAL_REPEAT_MS.
import { SOCIAL_REPEAT_MS } from '../relay.js';

export class RepeatPart {
  _repeated(me, kind, them, now) {
    const key = `${kind} ${me} ${them}`;
    const at = this._cool.get(key);
    if (at != null && now - at < SOCIAL_REPEAT_MS) return true;
    // This stamps the cooldown, so callers ask it after every other refusal;
    // a refused act stamps nothing.
    this._cool.set(key, now);
    return false;
  }
}
