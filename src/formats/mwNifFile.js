// Reads Morrowind NIF files, version 4.0.0.2 only. Records at this version carry no size field, so one unknown
// record type leaves the rest of the stream unreadable. The reader throws with the type name and record index.

export const MW_NIF_VERSION = 0x04000002;

class NifStream {
  /** @param {Uint8Array} bytes */
  constructor(bytes) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.pos = 0;
  }
  u8() {
    return this.view.getUint8(this.pos++);
  }
  u16() {
    const v = this.view.getUint16(this.pos, true);
    this.pos += 2;
    return v;
  }
  i16() {
    const v = this.view.getInt16(this.pos, true);
    this.pos += 2;
    return v;
  }
  u32() {
    const v = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return v;
  }
  i32() {
    const v = this.view.getInt32(this.pos, true);
    this.pos += 4;
    return v;
  }
  f32() {
    const v = this.view.getFloat32(this.pos, true);
    this.pos += 4;
    return v;
  }
  bool() {
    return this.u32() !== 0;
  }
  string() {
    const len = this.u32();
    if (len > 0xffff || this.pos + len > this.bytes.byteLength) {
      throw new Error(`NIF: implausible string length ${len} at ${this.pos - 4}`);
    }
    let s = '';
    for (let i = 0; i < len; i++) s += String.fromCharCode(this.bytes[this.pos + i]);
    this.pos += len;
    return s;
  }
  vec2() {
    return [this.f32(), this.f32()];
  }
  vec3() {
    return [this.f32(), this.f32(), this.f32()];
  }
  vec4() {
    return [this.f32(), this.f32(), this.f32(), this.f32()];
  }
  mat33() {
    const m = new Float32Array(9);
    for (let i = 0; i < 9; i++) m[i] = this.f32();
    return m;
  }
  ref() {
    return this.i32();
  }
  refList() {
    const n = this.u32();
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = this.ref();
    return out;
  }
  f32Array(n) {
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = this.f32();
    return out;
  }
  u16Array(n) {
    const out = new Uint16Array(n);
    for (let i = 0; i < n; i++) out[i] = this.u16();
    return out;
  }
  u8Array(n) {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[i] = this.u8();
    return out;
  }
}

export const KEY_TYPE = Object.freeze({
  linear: 1,
  quadratic: 2,
  tbc: 3,
  xyz: 4,
  constant: 5,
});

function readTimeController(s, rec) {
  rec.next = s.ref();
  rec.flags = s.u16();
  rec.frequency = s.f32();
  rec.phase = s.f32();
  rec.startTime = s.f32();
  rec.stopTime = s.f32();
  rec.target = s.ref();
}

// Quadratic keys store the value, then the in tangent, then the out tangent, matching OpenMW's readQuadratic.
function readKeyGroupOf(s, val) {
  const count = s.u32();
  const group = { type: 0, keys: [] };
  if (count === 0) return group;
  group.type = s.u32();
  for (let i = 0; i < count; i++) {
    const key = { time: s.f32(), value: val() };
    if (group.type === KEY_TYPE.quadratic) {
      key.inTan = val();
      key.outTan = val();
    } else if (group.type === KEY_TYPE.tbc) {
      key.tbc = [s.f32(), s.f32(), s.f32()];
    }
    group.keys.push(key);
  }
  return group;
}

function readKeyGroup(s, dim) {
  return readKeyGroupOf(s, dim === 1 ? () => s.f32() : () => s.f32Array(dim));
}

function readObjectNET(s, rec) {
  rec.name = s.string();
  rec.extra = s.ref();
  rec.controller = s.ref();
}

function readAVObject(s, rec) {
  readObjectNET(s, rec);
  rec.flags = s.u16();
  rec.translation = s.vec3();
  rec.rotation = s.mat33();
  rec.scale = s.f32();
  rec.velocity = s.vec3();
  rec.properties = s.refList();
  rec.bounds = s.bool() ? readBoundingVolume(s) : null;
}

function readBoundingVolume(s) {
  const type = s.u32();
  if (type === 0) {
    return { type: 'sphere', center: s.vec3(), radius: s.f32() };
  }
  if (type === 1) {
    return { type: 'box', center: s.vec3(), axes: s.mat33(), extents: s.vec3() };
  }
  throw new Error(`NIF: unimplemented bounding volume type ${type}`);
}

function readNode(s, rec) {
  readAVObject(s, rec);
  rec.children = s.refList();
  rec.effects = s.refList();
}

const NI_NODE_TYPES = new Set([
  'NiNode', 'RootCollisionNode', 'NiBSAnimationNode', 'NiBSParticleNode',
  'AvoidNode', 'NiBillboardNode', 'NiSwitchNode', 'NiLODNode', 'NiSortAdjustNode',
]);

// Matches OpenMW: when record 0 is a node not named Bip01, the parser resets its transform to identity, so every
// consumer sees it. A Bip01 root keeps its transform for skeletons.
function discardRootTransform(records) {
  const rec = records[0];
  if (!rec || !NI_NODE_TYPES.has(rec.type)) return;
  if (String(rec.name || '').toLowerCase() === 'bip01') return;
  rec.translation = [0, 0, 0];
  rec.rotation = Float32Array.from([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  rec.scale = 1;
}

function readGeometryData(s, rec) {
  rec.numVertices = s.u16();
  rec.vertices = s.bool() ? s.f32Array(rec.numVertices * 3) : null;
  rec.normals = s.bool() ? s.f32Array(rec.numVertices * 3) : null;
  rec.center = s.vec3();
  rec.radius = s.f32();
  rec.colors = s.bool() ? s.f32Array(rec.numVertices * 4) : null;
  const declaredUVs = s.u16();
  const numUVs = s.bool() ? declaredUVs : 0;
  rec.uvSets = [];
  for (let i = 0; i < numUVs; i++) rec.uvSets.push(s.f32Array(rec.numVertices * 2));
}

function readExtraData(s, rec) {
  rec.next = s.ref();
  rec.recordSize = s.u32();
}

// At 4.0.0.2 the affected-node list holds raw uint32 pointers, not record refs, so they are stored as written and
// never dereferenced.
function readDynamicEffect(s, rec) {
  readAVObject(s, rec);
  const count = s.u32();
  rec.affectedNodePointers = new Array(count);
  for (let i = 0; i < count; i++) rec.affectedNodePointers[i] = s.u32();
}

function readLight(s, rec) {
  readDynamicEffect(s, rec);
  rec.dimmer = s.f32();
  rec.ambient = s.vec3();
  rec.diffuse = s.vec3();
  rec.specular = s.vec3();
}

function readPointLight(s, rec) {
  readLight(s, rec);
  rec.constantAttenuation = s.f32();
  rec.linearAttenuation = s.f32();
  rec.quadraticAttenuation = s.f32();
}

function readParticleModifier(s, rec) {
  rec.next = s.ref();
  rec.controller = s.ref();
}

function readParticleCollider(s, rec) {
  readParticleModifier(s, rec);
  rec.bounce = s.f32();
}

function readPlane(s) {
  return { normal: s.vec3(), constant: s.f32() };
}

function readParticlesData(s, rec) {
  readGeometryData(s, rec);
  rec.numParticles = s.u16();
  rec.particleRadius = s.f32();
  rec.numActive = s.u16();
  rec.sizes = s.bool() ? s.f32Array(rec.numVertices) : null;
}

function readParticleSystemController(s, rec) {
  readTimeController(s, rec);
  rec.speed = s.f32();
  rec.speedVariation = s.f32();
  rec.declination = s.f32();
  rec.declinationVariation = s.f32();
  rec.planarAngle = s.f32();
  rec.planarAngleVariation = s.f32();
  rec.initialNormal = s.vec3();
  rec.initialColor = s.vec4();
  rec.initialSize = s.f32();
  rec.emitStartTime = s.f32();
  rec.emitStopTime = s.f32();
  rec.resetParticleSystem = s.u8();
  rec.birthRate = s.f32();
  rec.lifetime = s.f32();
  rec.lifetimeVariation = s.f32();
  rec.useBirthRate = s.u8();
  rec.spawnOnDeath = s.u8();
  rec.emitterDimensions = s.vec3();
  rec.emitter = s.ref();
  rec.numSpawnGenerations = s.u16();
  rec.percentageSpawned = s.f32();
  rec.spawnMultiplier = s.u16();
  rec.spawnSpeedChaos = s.f32();
  rec.spawnDirChaos = s.f32();
  const numParticles = s.u16();
  rec.numValid = s.u16();
  rec.particles = [];
  for (let i = 0; i < numParticles; i++) {
    rec.particles.push({
      velocity: s.vec3(),
      rotationAxis: s.vec3(),
      age: s.f32(),
      lifeSpan: s.f32(),
      lastUpdate: s.f32(),
      spawnGeneration: s.u16(),
      code: s.u16(),
    });
  }
  rec.emitterModifier = s.ref();
  rec.particleModifier = s.ref();
  rec.particleCollider = s.ref();
  rec.staticTargetBound = s.u8();
}

function readBoneLODController(s, rec) {
  readTimeController(s, rec);
  rec.lod = s.u32();
  const numLODs = s.u32();
  rec.numNodeGroups = s.u32();
  rec.nodeGroups = [];
  for (let i = 0; i < numLODs; i++) rec.nodeGroups.push(s.refList());
}

const READERS = {
  NiNode: readNode,
  RootCollisionNode: readNode,
  NiBSAnimationNode: readNode,
  NiBSParticleNode: readNode,
  AvoidNode: readNode,
  NiBillboardNode: readNode,

  NiTriShape(s, rec) {
    readAVObject(s, rec);
    rec.data = s.ref();
    rec.skin = s.ref();
  },

  NiTriShapeData(s, rec) {
    readGeometryData(s, rec);
    rec.numTriangles = s.u16();
    const numIndices = s.u32();
    rec.triangles = s.u16Array(numIndices);
    const numMatchGroups = s.u16();
    rec.matchGroups = [];
    for (let i = 0; i < numMatchGroups; i++) {
      rec.matchGroups.push(s.u16Array(s.u16()));
    }
  },

  NiSkinInstance(s, rec) {
    rec.data = s.ref();
    rec.skeletonRoot = s.ref();
    rec.bones = s.refList();
  },

  NiSkinData(s, rec) {
    rec.transform = { rotation: s.mat33(), translation: s.vec3(), scale: s.f32() };
    const numBones = s.u32();
    rec.partitions = s.ref();
    rec.bones = [];
    for (let i = 0; i < numBones; i++) {
      const bone = {
        transform: { rotation: s.mat33(), translation: s.vec3(), scale: s.f32() },
        center: s.vec3(),
        radius: s.f32(),
        indices: null,
        weights: null,
      };
      const numVerts = s.u16();
      bone.indices = new Uint16Array(numVerts);
      bone.weights = new Float32Array(numVerts);
      for (let v = 0; v < numVerts; v++) {
        bone.indices[v] = s.u16();
        bone.weights[v] = s.f32();
      }
      rec.bones.push(bone);
    }
  },

  NiMaterialProperty(s, rec) {
    readObjectNET(s, rec);
    rec.flags = s.u16();
    rec.ambient = s.vec3();
    rec.diffuse = s.vec3();
    rec.specular = s.vec3();
    rec.emissive = s.vec3();
    rec.glossiness = s.f32();
    rec.alpha = s.f32();
  },

  NiTexturingProperty(s, rec) {
    readObjectNET(s, rec);
    rec.flags = s.u16();
    rec.applyMode = s.u32();
    const count = s.u32();
    rec.textures = [];
    for (let i = 0; i < count; i++) {
      if (!s.bool()) {
        rec.textures.push(null);
        continue;
      }
      const tex = {
        source: s.ref(),
        clampMode: s.u32(),
        filterMode: s.u32(),
        uvSet: s.u32(),
        ps2L: s.i16(),
        ps2K: s.i16(),
        unknown: s.u16(),
      };
      if (i === TEX_SLOT.bump) {
        tex.lumaScale = s.f32();
        tex.lumaOffset = s.f32();
        tex.matrix = s.f32Array(4);
      }
      rec.textures.push(tex);
    }
  },

  NiSourceTexture(s, rec) {
    readObjectNET(s, rec);
    rec.external = s.u8() !== 0;
    if (rec.external) {
      rec.fileName = s.string();
      rec.pixelData = -1;
    } else {
      // Below version 10.0.1.4 this byte is `hasData`, and the pixel-data ref follows only when it is non-zero.
      // Reading the ref unconditionally over-reads four bytes.
      rec.hasData = s.u8() !== 0;
      rec.pixelData = rec.hasData ? s.ref() : -1;
      rec.fileName = null;
    }
    rec.pixelLayout = s.u32();
    rec.useMipmaps = s.u32();
    rec.alphaFormat = s.u32();
    rec.isStatic = s.u8();
  },

  NiAlphaProperty(s, rec) {
    readObjectNET(s, rec);
    rec.flags = s.u16();
    rec.threshold = s.u8();
  },

  NiZBufferProperty(s, rec) {
    readObjectNET(s, rec);
    rec.flags = s.u16();
  },

  NiShadeProperty(s, rec) {
    readObjectNET(s, rec);
    rec.flags = s.u16();
  },

  NiDitherProperty(s, rec) {
    readObjectNET(s, rec);
    rec.flags = s.u16();
  },

  NiSpecularProperty(s, rec) {
    readObjectNET(s, rec);
    rec.flags = s.u16();
  },

  NiWireframeProperty(s, rec) {
    readObjectNET(s, rec);
    rec.flags = s.u16();
  },

  NiVertexColorProperty(s, rec) {
    readObjectNET(s, rec);
    rec.flags = s.u16();
    rec.vertexMode = s.u32();
    rec.lightingMode = s.u32();
  },

  NiStencilProperty(s, rec) {
    readObjectNET(s, rec);
    rec.flags = s.u16();
    rec.enabled = s.u8();
    rec.compareFunc = s.u32();
    rec.stencilRef = s.u32();
    rec.mask = s.u32();
    rec.failAction = s.u32();
    rec.zfailAction = s.u32();
    rec.zpassAction = s.u32();
    rec.drawMode = s.u32();
  },

  NiCamera(s, rec) {
    readAVObject(s, rec);
    rec.frustum = {
      left: s.f32(), right: s.f32(), top: s.f32(), bottom: s.f32(), near: s.f32(), far: s.f32(),
    };
    rec.viewport = { left: s.f32(), right: s.f32(), top: s.f32(), bottom: s.f32() };
    rec.lodAdjust = s.f32();
    rec.scene = s.ref();
    rec.screenPolygons = s.u32();
  },

  NiStringExtraData(s, rec) {
    rec.next = s.ref();
    rec.recordSize = s.u32();
    rec.string = s.string();
  },

  NiTextKeyExtraData(s, rec) {
    rec.next = s.ref();
    rec.recordSize = s.u32();
    const numKeys = s.u32();
    rec.keys = [];
    for (let i = 0; i < numKeys; i++) rec.keys.push({ time: s.f32(), text: s.string() });
  },

  // In a .kf file, the extra chain holds the text keys, then one NiStringExtraData per controller naming its target
  // bone, in the same order as the controller chain.
  NiSequenceStreamHelper(s, rec) {
    readObjectNET(s, rec);
  },

  NiKeyframeController(s, rec) {
    readTimeController(s, rec);
    rec.data = s.ref();
  },

  NiKeyframeData(s, rec) {
    const numRot = s.u32();
    rec.rotationType = 0;
    rec.rotationKeys = [];
    rec.xyzRotations = null;
    if (numRot > 0) {
      rec.rotationType = s.u32();
      if (rec.rotationType === KEY_TYPE.xyz) {
        rec.axisOrder = s.u32();
        rec.xyzRotations = [readKeyGroup(s, 1), readKeyGroup(s, 1), readKeyGroup(s, 1)];
      } else {
        for (let i = 0; i < numRot; i++) {
          // Quaternion keys store w, x, y, z in that order.
          const key = { time: s.f32(), value: [s.f32(), s.f32(), s.f32(), s.f32()] };
          if (rec.rotationType === KEY_TYPE.tbc) key.tbc = [s.f32(), s.f32(), s.f32()];
          rec.rotationKeys.push(key);
        }
      }
    }
    rec.translations = readKeyGroup(s, 3);
    rec.scales = readKeyGroup(s, 1);
  },

  NiCollisionSwitch: readNode,

  NiSwitchNode(s, rec) {
    readNode(s, rec);
    rec.index = s.u32();
  },

  NiLODNode(s, rec) {
    readNode(s, rec);
    rec.index = s.u32();
    rec.lodCenter = s.vec3();
    const count = s.u32();
    rec.lodLevels = [];
    for (let i = 0; i < count; i++) rec.lodLevels.push({ near: s.f32(), far: s.f32() });
  },

  NiSortAdjustNode(s, rec) {
    readNode(s, rec);
    rec.sortingMode = s.u32();
    rec.accumulator = s.ref();
  },

  NiTriStrips(s, rec) {
    readAVObject(s, rec);
    rec.data = s.ref();
    rec.skin = s.ref();
  },

  NiTriStripsData(s, rec) {
    readGeometryData(s, rec);
    rec.numTriangles = s.u16();
    const numStrips = s.u16();
    rec.stripLengths = s.u16Array(numStrips);
    rec.strips = [];
    for (let i = 0; i < numStrips; i++) rec.strips.push(s.u16Array(rec.stripLengths[i]));
  },

  NiLines(s, rec) {
    readAVObject(s, rec);
    rec.data = s.ref();
    rec.skin = s.ref();
  },

  NiLinesData(s, rec) {
    readGeometryData(s, rec);
    rec.lines = new Uint8Array(rec.numVertices);
    for (let i = 0; i < rec.numVertices; i++) rec.lines[i] = s.bool() ? 1 : 0;
  },

  NiParticles(s, rec) {
    readAVObject(s, rec);
    rec.data = s.ref();
    rec.skin = s.ref();
  },

  NiAutoNormalParticles(s, rec) {
    readAVObject(s, rec);
    rec.data = s.ref();
    rec.skin = s.ref();
  },

  NiRotatingParticles(s, rec) {
    readAVObject(s, rec);
    rec.data = s.ref();
    rec.skin = s.ref();
  },

  NiParticlesData: readParticlesData,
  NiAutoNormalParticlesData: readParticlesData,

  NiRotatingParticlesData(s, rec) {
    readParticlesData(s, rec);
    rec.rotations = s.bool() ? s.f32Array(rec.numVertices * 4) : null;
  },

  NiGravity(s, rec) {
    readParticleModifier(s, rec);
    rec.decay = s.f32();
    rec.force = s.f32();
    rec.fieldType = s.u32();
    rec.position = s.vec3();
    rec.direction = s.vec3();
  },

  NiParticleBomb(s, rec) {
    readParticleModifier(s, rec);
    rec.decay = s.f32();
    rec.duration = s.f32();
    rec.deltaV = s.f32();
    rec.start = s.f32();
    rec.decayType = s.u32();
    rec.position = s.vec3();
    rec.direction = s.vec3();
  },

  NiParticleColorModifier(s, rec) {
    readParticleModifier(s, rec);
    rec.colorData = s.ref();
  },

  NiParticleGrowFade(s, rec) {
    readParticleModifier(s, rec);
    rec.grow = s.f32();
    rec.fade = s.f32();
  },

  NiParticleRotation(s, rec) {
    readParticleModifier(s, rec);
    rec.randomInitialAxis = s.u8();
    rec.initialAxis = s.vec3();
    rec.rotationSpeed = s.f32();
  },

  NiPlanarCollider(s, rec) {
    readParticleCollider(s, rec);
    rec.height = s.f32();
    rec.width = s.f32();
    rec.position = s.vec3();
    rec.xVector = s.vec3();
    rec.yVector = s.vec3();
    rec.plane = readPlane(s);
  },

  NiSphericalCollider(s, rec) {
    readParticleCollider(s, rec);
    rec.radius = s.f32();
    rec.position = s.vec3();
  },

  NiParticleSystemController: readParticleSystemController,
  NiBSPArrayController: readParticleSystemController,

  NiAlphaController(s, rec) {
    readTimeController(s, rec);
    rec.data = s.ref();
  },

  NiMaterialColorController(s, rec) {
    readTimeController(s, rec);
    rec.data = s.ref();
  },

  NiVisController(s, rec) {
    readTimeController(s, rec);
    rec.data = s.ref();
  },

  NiRollController(s, rec) {
    readTimeController(s, rec);
    rec.data = s.ref();
  },

  NiLightColorController(s, rec) {
    readTimeController(s, rec);
    rec.data = s.ref();
  },

  NiLightRadiusController: readTimeController,

  NiFlipController(s, rec) {
    readTimeController(s, rec);
    rec.textureSlot = s.u32();
    rec.accumTime = s.f32();
    rec.delta = s.f32();
    rec.sources = s.refList();
  },

  NiGeomMorpherController(s, rec) {
    readTimeController(s, rec);
    rec.data = s.ref();
    rec.alwaysUpdate = s.u8();
  },

  NiUVController(s, rec) {
    readTimeController(s, rec);
    rec.textureSet = s.u16();
    rec.data = s.ref();
  },

  NiLookAtController(s, rec) {
    readTimeController(s, rec);
    rec.lookAt = s.ref();
  },

  NiPathController(s, rec) {
    readTimeController(s, rec);
    rec.bankDir = s.i32();
    rec.maxBankAngle = s.f32();
    rec.smoothing = s.f32();
    rec.followAxis = s.i16();
    rec.pathData = s.ref();
    rec.percentData = s.ref();
  },

  NiBoneLODController: readBoneLODController,
  NiBSBoneLODController: readBoneLODController,

  NiFloatData(s, rec) {
    rec.data = readKeyGroup(s, 1);
  },

  NiPosData(s, rec) {
    rec.data = readKeyGroup(s, 3);
  },

  NiColorData(s, rec) {
    rec.data = readKeyGroup(s, 4);
  },

  // Bool keys are four-byte ints at this version, unlike the one-byte values of NiVisData.
  NiBoolData(s, rec) {
    rec.data = readKeyGroupOf(s, () => (s.bool() ? 1 : 0));
  },

  NiUVData(s, rec) {
    rec.groups = [
      readKeyGroup(s, 1),
      readKeyGroup(s, 1),
      readKeyGroup(s, 1),
      readKeyGroup(s, 1),
    ];
  },

  // Not a KeyGroup: NiVisData writes no interpolation type between the count and the keys, and each value is one
  // byte.
  NiVisData(s, rec) {
    const count = s.u32();
    rec.keys = [];
    for (let i = 0; i < count; i++) rec.keys.push({ time: s.f32(), value: s.u8() });
  },

  // Unlike a KeyGroup, each morph writes its interpolation type even when the key count is zero.
  NiMorphData(s, rec) {
    const numMorphs = s.u32();
    rec.numVertices = s.u32();
    rec.relativeTargets = s.u8();
    rec.morphs = [];
    for (let i = 0; i < numMorphs; i++) {
      const count = s.u32();
      const type = s.u32();
      const keys = [];
      for (let k = 0; k < count; k++) {
        const key = { time: s.f32(), value: s.f32() };
        if (type === KEY_TYPE.quadratic) {
          key.inTan = s.f32();
          key.outTan = s.f32();
        } else if (type === KEY_TYPE.tbc) {
          key.tbc = [s.f32(), s.f32(), s.f32()];
        }
        keys.push(key);
      }
      rec.morphs.push({ keys: { type, keys }, vectors: s.f32Array(rec.numVertices * 3) });
    }
  },

  // Reads exactly `numEntries` RGBA entries, as OpenMW does and the retail files hold, even though nif.xml implies
  // a fixed 16 or 256.
  NiPalette(s, rec) {
    rec.hasAlpha = s.u8();
    rec.numEntries = s.u32();
    rec.palette = s.u8Array(rec.numEntries * 4);
  },

  NiPixelData(s, rec) {
    rec.pixelFormat = s.u32();
    rec.redMask = s.u32();
    rec.greenMask = s.u32();
    rec.blueMask = s.u32();
    rec.alphaMask = s.u32();
    rec.bitsPerPixel = s.u32();
    rec.oldFastCompare = s.u8Array(8);
    rec.palette = s.ref();
    const numMipmaps = s.u32();
    rec.bytesPerPixel = s.u32();
    rec.mipmaps = [];
    for (let i = 0; i < numMipmaps; i++) {
      rec.mipmaps.push({ width: s.u32(), height: s.u32(), offset: s.u32() });
    }
    rec.pixels = s.u8Array(s.u32());
  },

  NiAmbientLight: readLight,
  NiDirectionalLight: readLight,
  NiPointLight: readPointLight,

  NiSpotLight(s, rec) {
    readPointLight(s, rec);
    rec.outerSpotAngle = s.f32();
    rec.exponent = s.f32();
  },

  NiTextureEffect(s, rec) {
    readDynamicEffect(s, rec);
    rec.modelProjectionMatrix = s.mat33();
    rec.modelProjectionTranslation = s.vec3();
    rec.textureFiltering = s.u32();
    rec.textureClamping = s.u32();
    rec.textureType = s.u32();
    rec.coordinateGenerationType = s.u32();
    rec.sourceTexture = s.ref();
    rec.enablePlane = s.u8();
    rec.plane = readPlane(s);
    rec.ps2L = s.i16();
    rec.ps2K = s.i16();
    rec.unknown = s.u16();
  },

  NiFogProperty(s, rec) {
    readObjectNET(s, rec);
    rec.flags = s.u16();
    rec.fogDepth = s.f32();
    rec.fogColor = s.vec3();
  },

  NiExtraData(s, rec) {
    readExtraData(s, rec);
    rec.data = s.u8Array(rec.recordSize);
  },

  NiVertWeightsExtraData(s, rec) {
    readExtraData(s, rec);
    rec.weights = s.f32Array(s.u16());
  },

  NiBinaryExtraData(s, rec) {
    readExtraData(s, rec);
    rec.data = s.u8Array(s.u32());
  },

  NiBooleanExtraData(s, rec) {
    readExtraData(s, rec);
    rec.booleanData = s.u8();
  },

  NiIntegerExtraData(s, rec) {
    readExtraData(s, rec);
    rec.integerData = s.u32();
  },

  NiVectorExtraData(s, rec) {
    readExtraData(s, rec);
    rec.vectorData = s.vec4();
  },

  NiStringsExtraData(s, rec) {
    readExtraData(s, rec);
    const count = s.u32();
    rec.strings = [];
    for (let i = 0; i < count; i++) rec.strings.push(s.string());
  },

  NiSequence(s, rec) {
    rec.name = s.string();
    rec.accumRootName = s.string();
    rec.textKeys = s.ref();
    const count = s.u32();
    rec.blocks = [];
    for (let i = 0; i < count; i++) {
      rec.blocks.push({ targetName: s.string(), controller: s.ref() });
    }
  },
};

export const TEX_SLOT = Object.freeze({
  base: 0,
  dark: 1,
  detail: 2,
  gloss: 3,
  glow: 4,
  bump: 5,
  decal0: 6,
});

/**
 * @param {Uint8Array} bytes
 * @returns {{version:number, records:object[], roots:number[]}}
 */
export function parseNif(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('parseNif expects a Uint8Array');
  const s = new NifStream(bytes);

  let nl = -1;
  for (let i = 0; i < Math.min(64, bytes.byteLength); i++) {
    if (bytes[i] === 0x0a) {
      nl = i;
      break;
    }
  }
  if (nl < 0) throw new Error('NIF: missing header line');
  let header = '';
  for (let i = 0; i < nl; i++) header += String.fromCharCode(bytes[i]);
  if (!header.startsWith('NetImmerse File Format')) {
    throw new Error(`NIF: bad header "${header}"`);
  }
  s.pos = nl + 1;

  const version = s.u32();
  if (version !== MW_NIF_VERSION) {
    throw new Error(
      `NIF: unsupported version 0x${version.toString(16)} (Morrowind 0x4000002 only)`,
    );
  }
  const recordCount = s.u32();
  const records = new Array(recordCount);
  for (let i = 0; i < recordCount; i++) {
    const type = s.string();
    const reader = READERS[type];
    if (!reader) {
      throw new Error(`NIF: unimplemented record type "${type}" (record ${i})`);
    }
    const rec = { type };
    const at = s.pos;
    try {
      reader(s, rec);
    } catch (err) {
      throw new Error(`NIF: record ${i} "${type}" at byte ${at}: ${err.message}`);
    }
    records[i] = rec;
  }
  discardRootTransform(records);
  const roots = [];
  const rootCount = s.u32();
  for (let i = 0; i < rootCount; i++) roots.push(s.ref());
  if (s.pos !== bytes.byteLength) {
    throw new Error(`NIF: ${bytes.byteLength - s.pos} trailing bytes after footer`);
  }
  return { version, records, roots };
}

/**
 * @param {{records:object[]}} nif
 * @param {number} ref
 */
export function deref(nif, ref) {
  if (ref < 0) return null;
  const rec = nif.records[ref];
  if (!rec) throw new Error(`NIF: dangling ref ${ref}`);
  return rec;
}
