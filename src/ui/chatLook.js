// The chat font and the chat text size, set in Settings > Chat and by the A- / A+ buttons in the chat top bar.
// The font is a small sheet that beats the game text-font sheet inside the chat only. The size is the
// `--dfchat-scale` value the chat sheet multiplies its text sizes by. Both go on every page that shows the chat.
import { getPref, setPref } from './uiPrefs.js';
import { TEXT_FONTS, wordStack, textFontSystem, fontFaceCss, mountTextFont } from './textFont.js';
import { PIXEL_STACK } from './pixelifyFive.js';

export const CHAT_FONT_STYLE_ID = 'dfchat-font';
/** '' is Same as game text; the rest are the Text font list's own keys. */
export const CHAT_FONT_SAME = '';
export const CHAT_TEXT_SIZES = Object.freeze([85, 100, 115, 130, 150]);
export const CHAT_TEXT_SIZE_DEFAULT = 100;

export const chatFont = () => { const v = getPref('chatFont'); return typeof v === 'string' && Object.hasOwn(TEXT_FONTS, v) ? v : CHAT_FONT_SAME; };
export const chatTextSize = () => { const v = getPref('chatTextSize'); return CHAT_TEXT_SIZES.includes(v) ? v : CHAT_TEXT_SIZE_DEFAULT; };
export const chatScale = (size = chatTextSize()) => size / 100;

/** One step along the size list (-1 smaller, +1 larger), held at its ends. False when there is no step to take. */
export function stepChatTextSize(dir) {
  const at = CHAT_TEXT_SIZES.indexOf(chatTextSize());
  const next = Math.max(0, Math.min(CHAT_TEXT_SIZES.length - 1, at + Math.sign(dir)));
  if (next === at) return false;
  setPref('chatTextSize', CHAT_TEXT_SIZES[next]);
  return true;
}
export const canStepChatTextSize = (dir) => {
  const at = CHAT_TEXT_SIZES.indexOf(chatTextSize());
  return dir < 0 ? at > 0 : at < CHAT_TEXT_SIZES.length - 1;
};

/** The font-family for a chat face, or null for the game text's own (Same, or My font with no name yet). */
export function chatFontStack(id = chatFont(), system = textFontSystem()) {
  if (id === CHAT_FONT_SAME) return null;
  if (id === 'game') return PIXEL_STACK;
  return wordStack(id, system);
}

export function chatFontCss(id = chatFont(), system = textFontSystem()) {
  const stack = chatFontStack(id, system);
  if (!stack) return '';
  const smooth = id === 'game' ? 'none' : 'auto';
  // The id in :not() lifts this rule over the body-wide !important rule of the text-font sheet.
  const sel = '.dfchat:not(#dfchat-face), .dfchat:not(#dfchat-face) *';
  return `${fontFaceCss(id)}${sel} { font-family: ${stack} !important; -webkit-font-smoothing: ${smooth} !important; }\n`;
}

/** What the look was mounted from, so a frame that changes nothing writes nothing. */
export const chatLookKey = (mirrorText = false) => `${chatFont()}|${chatTextSize()}|${textFontSystem()}|${mirrorText ? getPref('textFont') : ''}`;

/**
 * Mount the chat font and size on `doc`. `mirrorText` also mounts the game text-font sheet there.
 * The pop-out window has no text-font sheet of its own, so Same as game text needs it.
 * @param {Document} doc @param {{ mirrorText?: boolean }} [o]
 */
export function mountChatLook(doc, { mirrorText = false } = {}) {
  if (!doc?.head) return false;
  if (mirrorText) mountTextFont(doc);
  const css = chatFontCss();
  let st = doc.getElementById(CHAT_FONT_STYLE_ID);
  if (!css) { st?.remove(); }
  else {
    if (!st) { st = doc.createElement('style'); st.id = CHAT_FONT_STYLE_ID; doc.head.append(st); }
    if (st.textContent !== css) st.textContent = css;
  }
  const size = chatTextSize();
  const style = doc.documentElement?.style;
  if (size === CHAT_TEXT_SIZE_DEFAULT) style?.removeProperty('--dfchat-scale');
  else style?.setProperty('--dfchat-scale', String(chatScale(size)));
  return true;
}

export function unmountChatLook(doc) {
  doc?.getElementById?.(CHAT_FONT_STYLE_ID)?.remove();
  doc?.documentElement?.style?.removeProperty('--dfchat-scale');
}
