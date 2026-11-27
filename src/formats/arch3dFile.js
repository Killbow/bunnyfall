// Matches Daggerfall Unity's Arch3dFile.cs output, quirks included: mesh bounds start at 0, so `size` always spans
// the origin.

import { BsaFile, DIRECTORY_TYPES } from './bsaFile.js';
import { computeFaceUVCoordinates } from './faceUVTool.js';
import { ARCH3D_PATCH } from './arch3dPatch.js';
import { HeldRecords } from './heldRecords.js';

const CORNER_BUFFER_LENGTH = 16;
const UNIQUE_TEXTURE_BUFFER_LENGTH = 32;
const SUB_MESH_BUFFER_LENGTH = 32;
const PLANE_BUFFER_LENGTH = 512;
const POINT_BUFFER_LENGTH = 16;
const CALCULATED_UV_BUFFER_LENGTH = 24;

const POINT_DIVISOR = 256.0;
const TEXTURE_DIVISOR = 16.0;

export const MESH_VERSIONS = Object.freeze({
  Unknown: 0,
  Version25: 25,
  Version26: 26,
  Version27: 27,
});

export const UV_GENERATION_METHODS = Object.freeze({
  Unknown: 0,
  TriangleOnly: 1,
  ModifiedMatrixGenerator: 2,
});

function emptyMesh() {
  return {
    objectId: 0,
    radius: 0,
    size: { x: 0, y: 0, z: 0 },
    centre: { x: 0, y: 0, z: 0 },
    totalVertices: 0,
    totalTriangles: 0,
    subMeshes: null,
  };
}

function getVersion(version) {
  if (version === 'v2.7') return MESH_VERSIONS.Version27;
  if (version === 'v2.6') return MESH_VERSIONS.Version26;
  if (version === 'v2.5') return MESH_VERSIONS.Version25;
  return MESH_VERSIONS.Unknown;
}

export function uvUnpack(u) {
  if (u > -14336 && u < 14336 && u !== -7168) return u;

  let nextMult = u - 1;
  nextMult = nextMult >> 13;
  ++nextMult;
  nextMult = nextMult << 13;
  const prevMult = nextMult - 8192;
  const mult = u - prevMult < nextMult - u ? prevMult : nextMult;

  return u - mult;
}

function recordAt(bsa, pos) {
  let lo = 0;
  let hi = bsa.count - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const start = bsa.getRecordPosition(mid);
    if (pos < start) hi = mid - 1;
    else if (pos >= start + bsa.getRecordLength(mid)) lo = mid + 1;
    else return mid;
  }
  return -1;
}

function indexPatch(bsa) {
  const byRecord = new Map();
  for (const [offset, data] of ARCH3D_PATCH) {
    for (let i = 0; i < data.length;) {
      const record = recordAt(bsa, offset + i);
      if (record === -1) { i++; continue; }
      const start = bsa.getRecordPosition(record);
      const n = Math.min(data.length - i, start + bsa.getRecordLength(record) - (offset + i));
      if (!byRecord.has(record)) byRecord.set(record, []);
      byRecord.get(record).push([offset + i - start, data.slice(i, i + n)]);
      i += n;
    }
  }
  return byRecord;
}

export const MODELS_HELD_MAX = 256;

export class Arch3dFile {
  constructor() {
    this._bsa = null;
    this._records = null;
    this._patch = null;
    this._recordIndexLookup = new Map();
    this.autoDiscard = true;
    this._lastRecord = -1;
    this._held = new HeldRecords(MODELS_HELD_MAX, (record) => { this._records[record] = null; });

    this._cornerPointBuffer = new Array(CORNER_BUFFER_LENGTH);
    this._calculatedUVBuffer = new Array(CALCULATED_UV_BUFFER_LENGTH);
    this._subMeshBuffer = new Array(SUB_MESH_BUFFER_LENGTH);
  }

  static get filename() {
    return 'ARCH3D.BSA';
  }

  get count() {
    return this._bsa ? this._bsa.count : 0;
  }

  /**
   * @param {Uint8Array} bytes
   * @returns {boolean}
   */
  load(bytes) {
    this._bsa = new BsaFile(bytes);
    if (this._bsa.directoryType !== DIRECTORY_TYPES.NumberRecord) return false;
    this._records = new Array(this._bsa.count).fill(null);
    this._patch = indexPatch(this._bsa);
    return true;
  }

  getRecordIndex(id) {
    if (this._recordIndexLookup.has(id)) return this._recordIndexLookup.get(id);
    for (let i = 0; i < this.count; i++) {
      if (this._bsa.getRecordId(i) === id) {
        this._recordIndexLookup.set(id, i);
        return i;
      }
    }
    return -1;
  }

  getRecordId(record) {
    return this._bsa.getRecordId(record);
  }

  loadRecord(record) {
    if (record < 0 || record >= this.count) return false;

    if (this._records[record] !== null) {
      if (this.autoDiscard) this._held.hold(record);
      return true;
    }

    // `getRecordBytes` returns a copy, so patch writes never reach the archive buffer; `getRecordView` would mutate
    // it.
    const bytes = this._bsa.getRecordBytes(record);
    for (const [at, data] of this._patch.get(record) ?? []) {
      for (let i = 0; i < data.length; i++) bytes[at + i] = data[i];
    }
    const rec = {
      objectId: 0,
      version: MESH_VERSIONS.Unknown,
      bytes,
      header: null,
      pureMesh: null,
      dfMesh: emptyMesh(),
    };
    this._records[record] = rec;

    if (!this._read(record)) {
      this.discardRecord(record);
      return false;
    }

    if (!this._recordIndexLookup.has(rec.objectId)) {
      this._recordIndexLookup.set(rec.objectId, record);
    }

    this._lastRecord = record;
    if (this.autoDiscard) this._held.hold(record);
    return true;
  }

  discardRecord(record) {
    if (record < 0 || record >= this.count) return;
    this._records[record] = null;
    this._held.forget(record);
  }

  getMesh(record) {
    if (!this.loadRecord(record)) return emptyMesh();
    return this._records[record].dfMesh;
  }

  _read(record) {
    try {
      this._readHeader(record);
      const rec = this._records[record];
      rec.objectId = this._bsa.getRecordId(record);
      rec.version = getVersion(rec.header.version);
      if (!this._readMesh(record)) return false;
      if (!this._decomposeMesh(record)) return false;
    } catch (e) {
      return false;
    }
    return true;
  }

  _readHeader(record) {
    const rec = this._records[record];
    const v = new DataView(rec.bytes.buffer, rec.bytes.byteOffset, rec.bytes.byteLength);
    rec.view = v;
    let version = '';
    for (let i = 0; i < 4 && rec.bytes[i] !== 0; i++) version += String.fromCharCode(rec.bytes[i]);
    rec.header = {
      version,
      pointCount: v.getInt32(4, true),
      planeCount: v.getInt32(8, true),
      radius: v.getUint32(12, true),
      planeDataOffset: v.getInt32(24, true),
      objectDataOffset: v.getInt32(28, true),
      objectDataCount: v.getInt32(32, true),
      unknown2: v.getUint32(36, true),
      pointListOffset: v.getInt32(48, true),
      normalListOffset: v.getInt32(52, true),
      unknown3: v.getUint32(56, true),
      planeListOffset: v.getInt32(60, true),
    };
  }

  _readMesh(record) {
    const rec = this._records[record];
    const v = rec.view;
    const faceCount = rec.header.planeCount;
    const recordId = rec.objectId;
    const version = rec.version;

    const uniqueTextureBuffer = [];
    const planes = new Array(faceCount);

    let normalPos = rec.header.normalListOffset;
    let pos = rec.header.planeListOffset;
    let minX = 0, maxX = 0, minY = 0, maxY = 0, minZ = 0, maxZ = 0;
    let size = { x: 0, y: 0, z: 0 };
    let centre = { x: 0, y: 0, z: 0 };

    for (let plane = 0; plane < faceCount; plane++) {
      const header = {
        position: pos,
        planePointCount: rec.bytes[pos],
        unknown1: rec.bytes[pos + 1],
        texture: v.getUint16(pos + 2, true),
        unknown2: v.getUint32(pos + 4, true),
      };
      pos += 8;

      const nx = v.getInt32(normalPos, true);
      const ny = v.getInt32(normalPos + 4, true);
      const nz = v.getInt32(normalPos + 8, true);
      normalPos += 12;

      const textureArchive = header.texture >> 7;
      const textureRecord = header.texture & 0x7f;
      let foundTexture = false;
      for (let i = 0; i < uniqueTextureBuffer.length; i++) {
        if (
          uniqueTextureBuffer[i].archive === textureArchive &&
          uniqueTextureBuffer[i].record === textureRecord
        ) {
          foundTexture = true;
          break;
        }
      }
      if (!foundTexture) {
        if (uniqueTextureBuffer.length >= UNIQUE_TEXTURE_BUFFER_LENGTH) {
          throw new RangeError('uniqueTextureBuffer overflow');
        }
        uniqueTextureBuffer.push({ archive: textureArchive, record: textureRecord });
      }

      const pointCount = header.planePointCount;
      const points = new Array(pointCount);
      for (let point = 0; point < pointCount; point++) {
        const pointOffset = v.getInt32(pos, true);
        let u = v.getInt16(pos + 4, true);
        let uv = v.getInt16(pos + 6, true);
        pos += 8;

        if (point < 3 && recordId < 905) {
          u = uvUnpack(u);
          uv = uvUnpack(uv);
        }

        let pointPosition = rec.header.pointListOffset;
        switch (version) {
          case MESH_VERSIONS.Version27:
          case MESH_VERSIONS.Version26:
            pointPosition += pointOffset;
            break;
          case MESH_VERSIONS.Version25:
            pointPosition += pointOffset * 3;
            break;
        }

        const x = v.getInt32(pointPosition, true);
        const y = v.getInt32(pointPosition + 4, true);
        const z = v.getInt32(pointPosition + 8, true);

        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;

        points[point] = { x, y, z, nx, ny, nz, u, v: uv };
      }

      const pdPos = rec.header.planeDataOffset + plane * 24;
      const planeData = rec.bytes.slice(pdPos, pdPos + 24);

      planes[plane] = {
        header,
        textureIndex: { archive: textureArchive, record: textureRecord },
        planeData,
        points,
      };

      size = {
        x: maxX / POINT_DIVISOR - minX / POINT_DIVISOR,
        y: maxY / POINT_DIVISOR - minY / POINT_DIVISOR,
        z: maxZ / POINT_DIVISOR - minZ / POINT_DIVISOR,
      };
      centre = { x: size.x / 2, y: size.y / 2, z: size.z / 2 };
    }

    rec.pureMesh = { uniqueTextures: uniqueTextureBuffer, planes, size, centre };

    for (let i = 0; i < uniqueTextureBuffer.length; i++) {
      this._subMeshBuffer[i] = {
        textureArchive: uniqueTextureBuffer[i].archive,
        textureRecord: uniqueTextureBuffer[i].record,
        planeCount: 0,
        planeBuffer: new Array(PLANE_BUFFER_LENGTH),
      };
    }

    return true;
  }

  _decomposeMesh(record) {
    const rec = this._records[record];
    const uniqueTextureCount = rec.pureMesh.uniqueTextures.length;
    const dfMesh = emptyMesh();
    dfMesh.subMeshes = new Array(uniqueTextureCount);
    dfMesh.objectId = rec.objectId;
    dfMesh.radius = rec.header.radius / POINT_DIVISOR;

    const planeCount = rec.pureMesh.planes.length;
    for (let plane = 0; plane < planeCount; plane++) {
      const p = rec.pureMesh.planes[plane];
      const subMeshIndex = this._getSubMesh(
        rec.pureMesh,
        p.textureIndex.archive,
        p.textureIndex.record
      );
      this._writePlane(subMeshIndex, p);
    }

    let totalTriangles = 0;
    for (let submesh = 0; submesh < uniqueTextureCount; submesh++) {
      const buf = this._subMeshBuffer[submesh];
      const sm = {
        textureArchive: buf.textureArchive,
        textureRecord: buf.textureRecord,
        totalTriangles: 0,
        planes: new Array(buf.planeCount),
      };
      for (let plane = 0; plane < buf.planeCount; plane++) {
        const pb = buf.planeBuffer[plane];
        dfMesh.totalVertices += pb.pointCount;
        sm.totalTriangles += pb.pointCount - 2;
        sm.planes[plane] = {
          points: pb.pointBuffer.slice(0, pb.pointCount),
          uvGenerationMethod: pb.uvGenerationMethod,
        };
      }
      totalTriangles += sm.totalTriangles;
      dfMesh.subMeshes[submesh] = sm;
    }

    dfMesh.totalTriangles = totalTriangles;
    dfMesh.size = rec.pureMesh.size;
    dfMesh.centre = rec.pureMesh.centre;
    rec.dfMesh = dfMesh;
    rec.pureMesh = null;
    rec.bytes = null;
    rec.view = null;
    return true;
  }

  _writePlane(subMeshIndex, planeIn) {
    if (planeIn.points.length > 3) return this._writeVariablePlane(subMeshIndex, planeIn);

    const buf = this._subMeshBuffer[subMeshIndex];
    if (buf.planeCount >= PLANE_BUFFER_LENGTH) throw new RangeError('planeBuffer overflow');
    const planeIndex = buf.planeCount;
    buf.planeBuffer[planeIndex] = {
      pointCount: 0,
      pointBuffer: new Array(POINT_BUFFER_LENGTH),
      uvGenerationMethod: UV_GENERATION_METHODS.Unknown,
    };
    buf.planeCount++;

    // In a 3-point plane, the stored UVs of points 1 and 2 are deltas from the previous point.
    planeIn.points[1].u += planeIn.points[0].u;
    planeIn.points[1].v += planeIn.points[0].v;
    planeIn.points[2].u += planeIn.points[1].u;
    planeIn.points[2].v += planeIn.points[1].v;

    this._writePoint(planeIn.points[0], buf.planeBuffer[planeIndex]);
    this._writePoint(planeIn.points[1], buf.planeBuffer[planeIndex]);
    this._writePoint(planeIn.points[2], buf.planeBuffer[planeIndex]);

    buf.planeBuffer[planeIndex].uvGenerationMethod = UV_GENERATION_METHODS.TriangleOnly;
    return planeIndex;
  }

  _writeVariablePlane(subMeshIndex, planeIn) {
    const buf = this._subMeshBuffer[subMeshIndex];
    if (buf.planeCount >= PLANE_BUFFER_LENGTH) throw new RangeError('planeBuffer overflow');
    const planeIndex = buf.planeCount;
    buf.planeBuffer[planeIndex] = {
      pointCount: 0,
      pointBuffer: new Array(POINT_BUFFER_LENGTH),
      uvGenerationMethod: UV_GENERATION_METHODS.Unknown,
    };
    buf.planeCount++;

    const cornerCount = this._getCornerPoints(planeIn.points);

    if (computeFaceUVCoordinates(planeIn.points, this._calculatedUVBuffer)) {
      for (let pt = 0; pt < planeIn.points.length; pt++) {
        planeIn.points[pt].u = this._calculatedUVBuffer[pt].u;
        planeIn.points[pt].v = this._calculatedUVBuffer[pt].v;
      }
      buf.planeBuffer[planeIndex].uvGenerationMethod =
        UV_GENERATION_METHODS.ModifiedMatrixGenerator;
    }

    let cornerPos = 0;
    this._writePoint(planeIn.points[this._cornerPointBuffer[cornerPos++]], buf.planeBuffer[planeIndex]);
    this._writePoint(planeIn.points[this._cornerPointBuffer[cornerPos++]], buf.planeBuffer[planeIndex]);
    this._writePoint(planeIn.points[this._cornerPointBuffer[cornerPos++]], buf.planeBuffer[planeIndex]);
    while (cornerPos < cornerCount) {
      this._writePoint(planeIn.points[this._cornerPointBuffer[cornerPos++]], buf.planeBuffer[planeIndex]);
    }

    return planeIndex;
  }

  _writePoint(srcPoint, dstPlane) {
    if (dstPlane.pointCount >= POINT_BUFFER_LENGTH) throw new RangeError('pointBuffer overflow');
    const pointPos = dstPlane.pointCount;
    dstPlane.pointBuffer[pointPos] = {
      x: srcPoint.x / POINT_DIVISOR,
      y: srcPoint.y / POINT_DIVISOR,
      z: srcPoint.z / POINT_DIVISOR,
      nx: srcPoint.nx / POINT_DIVISOR,
      ny: srcPoint.ny / POINT_DIVISOR,
      nz: srcPoint.nz / POINT_DIVISOR,
      u: srcPoint.u / TEXTURE_DIVISOR,
      v: srcPoint.v / TEXTURE_DIVISOR,
    };
    dstPlane.pointCount++;
    return pointPos;
  }

  _getSubMesh(mesh, textureArchive, textureRecord) {
    for (let i = 0; i < mesh.uniqueTextures.length; i++) {
      if (
        mesh.uniqueTextures[i].archive === textureArchive &&
        mesh.uniqueTextures[i].record === textureRecord
      ) {
        return i;
      }
    }
    throw new Error('GetSubMesh() index not found.');
  }

  _getCornerPoints(pointsIn) {
    let cornerCount = 0;
    const pointCount = pointsIn.length;
    for (let point = 0; point < pointCount; point++) {
      let a;
      let b;
      let c;
      let cornerIndex;
      if (point < pointCount - 2) {
        a = pointsIn[point];
        b = pointsIn[point + 1];
        c = pointsIn[point + 2];
        cornerIndex = point + 1;
      } else if (point < pointCount - 1) {
        a = pointsIn[point];
        b = pointsIn[point + 1];
        c = pointsIn[0];
        cornerIndex = point + 1;
      } else {
        a = pointsIn[point];
        b = pointsIn[0];
        c = pointsIn[1];
        cornerIndex = 0;
      }

      const l0x = b.x - a.x, l0y = b.y - a.y, l0z = b.z - a.z;
      const l1x = c.x - a.x, l1y = c.y - a.y, l1z = c.z - a.z;

      // A zero-length edge throws, matching DFU's `Vector3.Normalize`, so only that record fails to load.
      const m0 = Math.sqrt(l0x * l0x + l0y * l0y + l0z * l0z);
      const m1 = Math.sqrt(l1x * l1x + l1y * l1y + l1z * l1z);
      if (m0 === 0 || m1 === 0) {
        throw new Error('Can not normalize a vector when it\'s magnitude is zero');
      }
      const angle = Math.acos((l0x * l1x + l0y * l1y + l0z * l1z) / (m0 * m1));
      if (angle > 0.001) {
        if (cornerCount >= CORNER_BUFFER_LENGTH) throw new RangeError('cornerPointBuffer overflow');
        this._cornerPointBuffer[cornerCount++] = cornerIndex;
      }
    }

    return cornerCount;
  }
}
