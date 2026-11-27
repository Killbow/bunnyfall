
export const ARRIVAL_BUFFER = 800;

export const OVERSHOOT_YAW_DEGREES = 5;

// Keeps the mod's form, atan2 of (from - to) plus 180, so bearings fall in (0, 360] with 0 north and 90 east, which
// the overshoot test compares.
export function calculateYaw(fromX, fromZ, toX, toZ) {
  const angleRad = Math.atan2(fromX - toX, fromZ - toZ);
  return angleRad * 180 / Math.PI + 180;
}

export function rectContains(rect, x, z) {
  return x >= rect.xMin && x < rect.xMax && z >= rect.zMin && z < rect.zMax;
}

export function rectDistance(rect, x, z) {
  const dx = Math.max(rect.xMin - x, 0, x - rect.xMax);
  const dz = Math.max(rect.zMin - z, 0, z - rect.zMax);
  return Math.hypot(dx, dz);
}

export const rectOf = (x, z, w, h) => ({ xMin: x, zMin: z, xMax: x + w, zMax: z + h });

export const rectMinMax = (xMin, zMin, xMax, zMax) => ({ xMin, zMin, xMax, zMax });

export function rectCentre(rect) {
  return {
    x: Math.trunc((rect.xMin + rect.xMax) / 2),
    z: Math.trunc((rect.zMin + rect.zMax) / 2),
  };
}

export const LANE_LOOK_MIN = 512;
export const LANE_LOOK_MAX = 4096;
export const LANE_LOOK_STEPS = 3;
// Floor on the force cut applied when the distance to the run end is shorter than the previous step; a sudden hitch
// in this frame is not cut.
export const LANE_CORNER_FORCE_MIN = 0.25;

export function lanePursuit(x, z, lane, look) {
  const dx = lane.bx - lane.ax, dz = lane.bz - lane.az, len = Math.hypot(dx, dz);
  if (!(len > 0)) return { t: 1, x: lane.bx, z: lane.bz };
  const t = ((x - lane.ax) * dx + (z - lane.az) * dz) / (len * len);
  const u = Math.max(0, Math.min(1, t + look / len));
  return { t, x: lane.ax + dx * u, z: lane.az + dz * u };
}

function segDistance(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  const u = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
  return Math.hypot(x - (ax + dx * u), z - (az + dz * u));
}

// The run also advances when the body is nearer the next run, because past a turn sharper than a right angle the
// body still projects inside this one.
export function pathPursuit(x, z, path, seg, look) {
  const last = path.length - 2;
  let k = Math.max(0, Math.min(last, seg | 0));
  let t = 0;
  for (;;) {
    const [ax, az] = path[k], [bx, bz] = path[k + 1];
    t = lanePursuit(x, z, { ax, az, bx, bz }, 0).t;
    if (k < last && (t >= 1 || segDistance(x, z, bx, bz, path[k + 2][0], path[k + 2][1]) < segDistance(x, z, ax, az, bx, bz))) { k++; continue; }
    break;
  }
  let i = k, at = Math.max(0, Math.min(1, t)), left = look;
  for (;;) {
    const [ax, az] = path[i], [bx, bz] = path[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const rest = (1 - at) * len;
    if (left <= rest || i === last) {
      const u = len > 0 ? Math.min(1, at + left / len) : 1;
      return { seg: k, t, x: ax + (bx - ax) * u, z: az + (bz - az) * u, end: t >= 1 };
    }
    left -= rest; i++; at = 0;
  }
}

const NO_PIXEL = Number.MAX_SAFE_INTEGER;

export class TravelAutopilot {
  constructor(targetPixel, targetRect, speedMultiplier = 1, { grow = false, isLocation = false, edgeArrival = false, lane = null, path = null, lookMin = LANE_LOOK_MIN, lookMax = LANE_LOOK_MAX } = {}) {
    this.isLocation = !!isLocation;
    this.edgeArrival = !!edgeArrival;
    this.onArrival = null;
    // The yaw is zeroed only here, never in `initTargetRect`, because an interrupt right after a leg re-init reads
    // the latched bearing to face the walking direction.
    this.yaw = 0;
    this.pitch = 0;
    this.initTargetRect(targetPixel, targetRect, speedMultiplier, { grow, lane, path, lookMin, lookMax });
  }

  initTargetRect(targetPixel, targetRect, speedMultiplier, { grow = false, lane = null, path = null, lookMin = LANE_LOOK_MIN, lookMax = LANE_LOOK_MAX } = {}) {
    this.destinationMapPixel = { x: targetPixel.x, y: targetPixel.y };
    this.destinationCentre = rectCentre(targetRect);
    this.destinationWorldRect = grow
      ? { xMin: targetRect.xMin - ARRIVAL_BUFFER, xMax: targetRect.xMax + ARRIVAL_BUFFER,
        zMin: targetRect.zMin - ARRIVAL_BUFFER, zMax: targetRect.zMax + ARRIVAL_BUFFER }
      : { ...targetRect };
    this.speedMultiplier = speedMultiplier;
    this.lastPlayerMapPixel = { x: NO_PIXEL, y: NO_PIXEL };
    this.inDestinationMapPixel = false;
    this.pitch = 0;
    this.path = path?.length >= 2 ? path.map((q) => [q[0] ?? q.x, q[1] ?? q.z]) : lane ? [[lane.ax, lane.az], [lane.bx, lane.bz]] : null;
    this.seg = 0;
    this.lookMin = lookMin;
    this.lookMax = Math.max(lookMin, lookMax);
    this.lastAt = null;
  }

  update({ worldX, worldZ, mapPixelX, mapPixelY }) {
    if (this.path) return this.laneUpdate(worldX, worldZ);
    // A location eight blocks across fills its map pixel, so its arrival buffer lies wholly in the neighbor pixels
    // and needs this test outside the pixel.
    if (this.edgeArrival && !this.inDestinationMapPixel && rectContains(this.destinationWorldRect, worldX, worldZ)) {
      if (this.isLocation) this.mouseLookAtDestination();
      this.onArrival?.();
      return { yaw: this.yaw, pitch: this.pitch, forward: 0, arrived: true };
    }
    if (this.inDestinationMapPixel && this.isPlayerInArrivalRect(worldX, worldZ)) {
      if (this.isLocation) this.mouseLookAtDestination();
      this.onArrival?.();
      return { yaw: this.yaw, pitch: this.pitch, forward: 0, arrived: true };
    }
    if (mapPixelX !== this.lastPlayerMapPixel.x || mapPixelY !== this.lastPlayerMapPixel.y) {
      this.lastPlayerMapPixel = { x: mapPixelX, y: mapPixelY };
      this.setNewYaw(worldX, worldZ);
      this.inDestinationMapPixel = mapPixelX === this.destinationMapPixel.x && mapPixelY === this.destinationMapPixel.y;
    }
    return { yaw: this.yaw, pitch: this.pitch, forward: this.speedMultiplier, arrived: false };
  }

  // A location arrives only inside its rect on the last run, because the line ends at the pixel middle, which can
  // lie outside a dungeon placed off the middle.
  laneUpdate(worldX, worldZ) {
    const step = this.lastAt ? Math.hypot(worldX - this.lastAt.x, worldZ - this.lastAt.z) : 0;
    this.lastAt = { x: worldX, z: worldZ };
    const look = Math.max(this.lookMin, Math.min(this.lookMax, LANE_LOOK_STEPS * step));
    const p = pathPursuit(worldX, worldZ, this.path, this.seg, look);
    this.seg = p.seg;
    const lastRun = p.seg >= this.path.length - 2;
    if ((lastRun && rectContains(this.destinationWorldRect, worldX, worldZ)) || (p.end && !this.isLocation)) {
      if (this.isLocation) this.mouseLookAtDestination();
      this.onArrival?.();
      return { yaw: this.yaw, pitch: this.pitch, forward: 0, arrived: true };
    }
    this.yaw = calculateYaw(worldX, worldZ, p.x, p.z);
    const [ex, ez] = this.path[p.seg + 1], toEnd = Math.hypot(ex - worldX, ez - worldZ);
    const cut = step > 0 && toEnd < step && p.t < 1 ? Math.max(LANE_CORNER_FORCE_MIN, toEnd / step) : 1;
    return { yaw: this.yaw, pitch: this.pitch, forward: this.speedMultiplier * cut, arrived: false };
  }

  get runYaw() {
    if (!this.path) return null;
    const [ax, az] = this.path[this.seg], [bx, bz] = this.path[this.seg + 1];
    return ax === bx && az === bz ? null : calculateYaw(ax, az, bx, bz);
  }

  get steerTarget() {
    if (!this.path) return this.destinationCentre;
    const q = this.path[Math.min(this.seg + 1, this.path.length - 1)];
    return { x: q[0], z: q[1] };
  }

  isPlayerInArrivalRect(worldX, worldZ) {
    const yaw = calculateYaw(worldX, worldZ, this.destinationCentre.x, this.destinationCentre.z);
    const dy = Math.abs(yaw - this.yaw);
    if (dy > OVERSHOOT_YAW_DEGREES) return true;
    this.yaw = yaw;
    return rectContains(this.destinationWorldRect, worldX, worldZ);
  }

  setNewYaw(worldX, worldZ) {
    this.yaw = calculateYaw(worldX, worldZ, this.destinationCentre.x, this.destinationCentre.z);
  }

  mouseLookAtDestination() {
    this.pitch = 0;
    return { yaw: this.yaw, pitch: 0 };
  }
}

export function travelLookaheadFor({ speed = 0, dt = 0, scale = 1, maxFrameDt = 0.25, floor = 64, margin = 1.5 }) {
  return Math.max(floor, speed * Math.min(dt, maxFrameDt) * Math.max(1, scale) * margin);
}

// Holds the force only while the streamer has work in flight, so ground that never builds does not freeze the
// journey.
export function travelDriveForward({ feet, yaw, lookahead, heightAt, streaming, forward }) {
  const ahead = [feet[0] + Math.sin(yaw) * lookahead, feet[2] + Math.cos(yaw) * lookahead];
  const standing = Number.isFinite(heightAt(feet[0], feet[2])) && Number.isFinite(heightAt(ahead[0], ahead[1]));
  return (!standing && streaming) ? 0 : forward;
}
