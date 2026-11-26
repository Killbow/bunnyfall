// @ts-check
import { drillHopper } from '../net/mine/mineDrill.js';
import { sightBlockedBy } from '../net/remotePlayers.js';
import { projectToScreen, worldRectPx } from '../player/tapRay.js';
import { multiply } from '../world/mat4.js';
import { materialImage } from './haulCards.js';
import { requestIcon } from './textureCanvas.js';

const READOUT_RANGE = 14;

/** @param {HTMLDivElement} root @param {string} ore */
function makeReadout(root, ore) {
  const el = root.ownerDocument.createElement('div');
  el.style.cssText = 'position:absolute;left:0;top:0;display:flex;align-items:center;gap:4px;padding:1px 5px 1px 3px;border-radius:5px;background:#18120ee8;color:#fff3d7;font:600 12px/18px system-ui,sans-serif;white-space:nowrap';
  const icon = root.ownerDocument.createElement('img');
  icon.alt = '';
  icon.style.cssText = 'width:16px;height:16px;object-fit:contain;image-rendering:pixelated';
  icon.hidden = true;
  const count = root.ownerDocument.createElement('span');
  el.append(icon, count);
  root.append(el);
  const image = materialImage(ore);
  if (image?.archive != null) {
    const readIcon = () => {
      const url = requestIcon(image.archive, image.record, { dye: image.dye, dyeTarget: image.dyeTarget, onReady: readIcon });
      if (url) { icon.src = url; icon.hidden = false; }
    };
    readIcon();
  }
  return { el, count };
}

export function createMineDrillReadout() {
  /** @type {HTMLDivElement | null} */
  let root = null;
  /** @type {Map<string, ReturnType<typeof makeReadout>>} */
  const labels = new Map();

  return {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {any} renderer
     * @param {number[]} eye
     * @param {any} collider
     * @param {Map<string, any>} rigs
     * @param {boolean} covered
     */
    draw(canvas, renderer, eye, collider, rigs, covered) {
      if (typeof document === 'undefined') return;
      if (root) root.hidden = covered || !rigs.size;
      if (covered || !rigs.size) return;
      const rect = canvas.getBoundingClientRect();
      const viewport = renderer.worldViewportRect;
      const bounds = worldRectPx(viewport, rect.width, rect.height);
      const proj = renderer._proj, view = renderer._view;
      const pv = multiply(proj, view);
      const now = Date.now() / 1000;
      for (const [key, rig] of rigs) {
        const point = rig.readoutAt;
        let label = labels.get(key);
        const near = Math.hypot(point[0] - eye[0], point[1] - eye[1], point[2] - eye[2]) <= READOUT_RANGE;
        const p = near ? projectToScreen(point, rect.width, rect.height, proj, view, viewport, false, pv) : null;
        if (!p?.front || p.x < bounds.x || p.y < bounds.y || p.x > bounds.x + bounds.w || p.y > bounds.y + bounds.h || sightBlockedBy(collider, eye, point)) {
          if (label) label.el.style.display = 'none';
          continue;
        }
        if (!root) {
          root = document.createElement('div');
          root.setAttribute('aria-hidden', 'true');
          root.style.cssText = 'position:fixed;inset:0;z-index:3;pointer-events:none;overflow:hidden';
          document.body.append(root);
        }
        if (!label) { label = makeReadout(root, rig.ore); labels.set(key, label); }
        label.el.style.display = 'flex';
        label.el.style.transform = `translate(${Math.round(rect.left + p.x)}px,${Math.round(rect.top + p.y)}px) translate(-50%,-100%)`;
        const count = String(drillHopper(rig.d, now));
        if (label.count.textContent !== count) label.count.textContent = count;
      }
    },
    /** @param {string} key */
    remove(key) {
      labels.get(key)?.el.remove();
      labels.delete(key);
    },
    dispose() {
      root?.remove();
      root = null;
      labels.clear();
    },
  };
}
