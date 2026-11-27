// @ts-check

export const SEA_ZOOM_REACH = 3;
export const SEA_ZOOM_RATIO = 1.5;

export function seaZoomReach(halfExtent) {
  return Number.isFinite(halfExtent) && halfExtent > 0 ? halfExtent * SEA_ZOOM_REACH : 0;
}

export function seaZoomStep(distance, clicks, footFar, far) {
  const d = distance * SEA_ZOOM_RATIO ** -clicks;
  return Math.min(far, Math.max(footFar, d));
}
