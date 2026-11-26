// @ts-check
// main.js sets the renderer once at boot for the menu's portrait wells, which hold no renderer of their own.

/** @type {any} */
let renderer = null;

export function setPortraitRenderer(r) { renderer = r ?? null; }

export const portraitRenderer = () => renderer;
