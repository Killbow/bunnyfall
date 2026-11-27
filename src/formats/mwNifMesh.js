
import { deref, TEX_SLOT } from './mwNifFile.js';

export const NODE_TYPES = new Set([
  'NiNode',
  'NiBSAnimationNode',
  'NiBSParticleNode',
  'NiBillboardNode',
  'AvoidNode',
  'NiSwitchNode',
  'NiLODNode',
  'NiSortAdjustNode',
  'NiCollisionSwitch',
]);

// A switch shows only the child at its stored index. A flattened scene has no camera, so a LOD node shows the level
// that covers distance 0 at its center, or nothing when none does.
export function selectedChild(rec) {
  if (rec.type === 'NiLODNode') {
    const levels = rec.lodLevels;
    if (Array.isArray(levels)) {
      for (let i = 0; i < levels.length; i++) {
        if (levels[i].near <= 0 && levels[i].far > 0) return i;
      }
      if (levels.length) return -1;
    }
    return 0;
  }
  if (rec.type === 'NiSwitchNode') return Number.isInteger(rec.index) ? rec.index : 0;
  return null;
}

// NiLines is left out on purpose: batches are triangle lists, so line shapes are dropped rather than drawn as
// triangles.
export const GEOMETRY_TYPES = new Set(['NiTriShape', 'NiTriStrips']);

export const PARTICLE_TYPES = new Set(['NiParticles', 'NiAutoNormalParticles', 'NiRotatingParticles']);
export const ANIM_FLAG_NODES = new Set(['NiBSAnimationNode', 'NiBSParticleNode']);

export function stripsToTriangles(data) {
  const out = [];
  for (const strip of data.strips ?? []) {
    if (!strip || strip.length < 3) continue;
    for (let i = 0; i + 2 < strip.length; i++) {
      const a = strip[i], b = strip[i + 1], c = strip[i + 2];
      if (a === b || b === c || a === c) continue;
      if (i & 1) out.push(b, a, c);
      else out.push(a, b, c);
    }
  }
  return Uint16Array.from(out);
}

export function mat33Mul(a, b) {
  const o = new Float32Array(9);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
    }
  }
  return o;
}

export function mat33Apply(m, x, y, z) {
  return [
    m[0] * x + m[1] * y + m[2] * z,
    m[3] * x + m[4] * y + m[5] * z,
    m[6] * x + m[7] * y + m[8] * z,
  ];
}

function bt3(t) {
  return [t[0], t[1], t[2]];
}

const IDENTITY = Object.freeze({
  rotation: Float32Array.from([1, 0, 0, 0, 1, 0, 0, 0, 1]),
  translation: [0, 0, 0],
  scale: 1,
});

export function composeTransform(p, node) {
  const rotation = mat33Mul(p.rotation, node.rotation);
  const [tx, ty, tz] = mat33Apply(
    p.rotation,
    node.translation[0] * p.scale,
    node.translation[1] * p.scale,
    node.translation[2] * p.scale,
  );
  return {
    rotation,
    translation: [p.translation[0] + tx, p.translation[1] + ty, p.translation[2] + tz],
    scale: p.scale * node.scale,
  };
}

export const VERTEX_COLOR_MODE = Object.freeze({
  None: 0, Emission: 1, AmbientAndDiffuse: 2, Ambient: 3, Diffuse: 4, Specular: 5,
});

export const VERT_MODE = Object.freeze({ SrcIgnore: 0, SrcEmissive: 1, SrcAmbDif: 2 });
export const LIGHT_MODE = Object.freeze({ Emissive: 0, EmiAmbDif: 1 });

export const DRAW_MODE = Object.freeze({ Default: 0, CounterClockwise: 1, Clockwise: 2, Both: 3 });

/**
 * Walks properties root first and nearest last, as OpenMW does. Most properties are nearest-wins, but a SrcAmbDif
 * light mode set by an ancestor persists, so a per-type map gives wrong results.
 * @param props
 * @param hasVertexColors
 */
export function resolveMaterial(nif, props, hasVertexColors = false) {
  const out = {
    name: null,
    diffuse: [1, 1, 1],
    ambient: [1, 1, 1],
    emissive: [0, 0, 0],
    // OpenMW zeroes specular for Morrowind-version files, so glossiness stays 0 and the parsed value is ignored.
    glossiness: 0,
    alpha: 1,
    textureFile: null,
    clampMode: 3,
    alphaBlend: false,
    alphaTest: false,
    alphaThreshold: 0,
    // Blend factors stay as indices into the NiAlphaProperty blend table, where 6 and 7 are source alpha and one
    // minus source alpha; renderers map them to GL.
    srcBlend: 6, dstBlend: 7,
    depthTest: true, depthWrite: true,
    vertexColorMode: hasVertexColors
      ? VERTEX_COLOR_MODE.AmbientAndDiffuse : VERTEX_COLOR_MODE.None,
    twoSided: false,
    clockwise: false,
  };
  let lightmode = LIGHT_MODE.EmiAmbDif;

  for (const prop of props) {
    switch (prop.type) {
      case 'NiMaterialProperty':
        out.name = prop.name || null;
        out.diffuse = prop.diffuse.slice();
        out.ambient = prop.ambient.slice();
        out.emissive = prop.emissive.slice();
        out.alpha = prop.alpha;
        break;
      case 'NiTexturingProperty': {
        const base = prop.textures[TEX_SLOT.base];
        if (base) {
          const src = deref(nif, base.source);
          if (src && src.external && src.fileName) {
            out.textureFile = src.fileName;
            out.clampMode = base.clampMode;
          }
        }
        break;
      }
      case 'NiAlphaProperty':
        out.alphaBlend = (prop.flags & 0x0001) !== 0;
        out.alphaTest = (prop.flags & 0x0200) !== 0;
        out.alphaThreshold = prop.threshold;
        out.srcBlend = (prop.flags >> 1) & 0xF;
        out.dstBlend = (prop.flags >> 5) & 0xF;
        break;
      case 'NiZBufferProperty':
        out.depthTest = (prop.flags & 0x1) !== 0;
        out.depthWrite = (prop.flags & 0x2) !== 0;
        break;
      case 'NiVertexColorProperty':
        if (prop.vertexMode === VERT_MODE.SrcIgnore) {
          out.vertexColorMode = VERTEX_COLOR_MODE.None;
        } else if (prop.vertexMode === VERT_MODE.SrcEmissive) {
          out.vertexColorMode = VERTEX_COLOR_MODE.Emission;
        } else if (prop.vertexMode === VERT_MODE.SrcAmbDif) {
          lightmode = prop.lightingMode;
          out.vertexColorMode = lightmode === LIGHT_MODE.Emissive
            ? VERTEX_COLOR_MODE.None : VERTEX_COLOR_MODE.AmbientAndDiffuse;
        }
        break;
      case 'NiStencilProperty':
        // OpenMW applies the draw mode even when stenciling is off, so `enabled` is not checked here.
        out.clockwise = prop.drawMode === DRAW_MODE.Clockwise;
        out.twoSided = prop.drawMode === DRAW_MODE.Both;
        break;
      default:
        break;
    }
  }

  if (lightmode === LIGHT_MODE.Emissive) {
    out.diffuse = [0, 0, 0];
    out.ambient = [0, 0, 0];
  }
  if (!hasVertexColors) {
    switch (out.vertexColorMode) {
      case VERTEX_COLOR_MODE.Diffuse:
      case VERTEX_COLOR_MODE.AmbientAndDiffuse:
        out.diffuse = [1, 1, 1];
        if (out.vertexColorMode === VERTEX_COLOR_MODE.AmbientAndDiffuse) out.ambient = [1, 1, 1];
        break;
      case VERTEX_COLOR_MODE.Ambient:
        out.ambient = [1, 1, 1];
        break;
      case VERTEX_COLOR_MODE.Emission:
        out.emissive = [1, 1, 1];
        break;
      default:
        break;
    }
    out.vertexColorMode = VERTEX_COLOR_MODE.None;
  }
  return out;
}

/**
 * OpenMW substitutes the vertex color for the channel the mode names rather than multiplying the material by it.
 * @param material
 * @param colors
 * @param i
 * @returns
 */
export function diffuseAt(material, colors, i) {
  const m = material ? material.vertexColorMode : VERTEX_COLOR_MODE.None;
  if (colors && (m === VERTEX_COLOR_MODE.AmbientAndDiffuse || m === VERTEX_COLOR_MODE.Diffuse)) {
    return [colors[i * 4], colors[i * 4 + 1], colors[i * 4 + 2]];
  }
  return material ? material.diffuse : [1, 1, 1];
}

/**
 * @param material
 * @param colors
 * @param i
 * @returns
 */
export function emissiveAt(material, colors, i) {
  const m = material ? material.vertexColorMode : VERTEX_COLOR_MODE.None;
  if (colors && m === VERTEX_COLOR_MODE.Emission) {
    return [colors[i * 4], colors[i * 4 + 1], colors[i * 4 + 2]];
  }
  return material?.emissive ?? [0, 0, 0];
}

// Matches OpenMW: the MRK comparison is exact and case-sensitive, and only the root node's extra-data chain counts.
export function hasMarkerFlag(nif, rec) {
  for (let ref = rec ? rec.extra : -1; ref >= 0;) {
    const e = deref(nif, ref);
    if (!e) break;
    if (e.type === 'NiStringExtraData' && e.string === 'MRK') return true;
    ref = e.next ?? -1;
  }
  return false;
}

const ciStartsWith = (name, prefix) => String(name || '').toLowerCase().startsWith(prefix);

// Only the editor-marker skip depends on MRK; `shadow` and `tri shadow` shapes are always skipped, as in OpenMW.
export function skipGeometryName(name, hasMarkers) {
  if (hasMarkers && ciStartsWith(name, 'tri editormarker')) return true;
  return ciStartsWith(name, 'shadow') || ciStartsWith(name, 'tri shadow');
}

export function flattenNif(nif, opts = {}) {
  const includeHidden = opts.includeHidden === true;
  const underNode = opts.underNode ? String(opts.underNode).toLowerCase() : null;
  const excludeNode = opts.excludeNode ? String(opts.excludeNode).toLowerCase() : null;
  const batches = [];

  function emit(shape, world, props, chain, animFlags, parentRef = -1) {
    const data = deref(nif, shape.data);
    if (!data || !data.vertices) return;
    let indices;
    if (shape.type === 'NiTriStrips') {
      indices = stripsToTriangles(data);
      if (!indices.length) return;
    } else {
      indices = Uint16Array.from(data.triangles);
    }
    const skinned = shape.skin >= 0;
    const n = data.numVertices;
    const positions = new Float32Array(n * 3);
    let normals = null;
    if (skinned) {
      // Skinned vertices stay as authored for the bones to place. The shape's own transform travels as
      // `shapeTransform` and applies after the blend, as in OpenMW's RigGeometry.
      positions.set(data.vertices);
      if (data.normals) normals = Float32Array.from(data.normals);
    } else {
      for (let i = 0; i < n; i++) {
        const [x, y, z] = mat33Apply(
          world.rotation,
          data.vertices[i * 3] * world.scale,
          data.vertices[i * 3 + 1] * world.scale,
          data.vertices[i * 3 + 2] * world.scale,
        );
        positions[i * 3] = x + world.translation[0];
        positions[i * 3 + 1] = y + world.translation[1];
        positions[i * 3 + 2] = z + world.translation[2];
      }
      if (data.normals) {
        normals = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
          const [x, y, z] = mat33Apply(
            world.rotation,
            data.normals[i * 3],
            data.normals[i * 3 + 1],
            data.normals[i * 3 + 2],
          );
          normals[i * 3] = x;
          normals[i * 3 + 1] = y;
          normals[i * 3 + 2] = z;
        }
      }
    }
    let skin = null;
    if (skinned) {
      const si = deref(nif, shape.skin);
      const sd = deref(nif, si.data);
      skin = {
        skeletonRoot: si.skeletonRoot,
        rootBone: si.skeletonRoot,
        transform: sd.transform,
        shapeTransform: {
          rotation: shape.rotation ?? [1, 0, 0, 0, 1, 0, 0, 0, 1],
          translation: shape.translation ?? [0, 0, 0],
          scale: shape.scale ?? 1,
        },
        bones: si.bones.map((ref, i) => ({
          ref,
          name: (deref(nif, ref)?.name || '').toLowerCase(),
          invBind: {
            a: (() => {
              const bt = sd.bones[i].transform;
              const a = new Float32Array(9);
              for (let k = 0; k < 9; k++) a[k] = bt.rotation[k] * bt.scale;
              return a;
            })(),
            t: bt3(sd.bones[i].transform.translation),
          },
          indices: sd.bones[i].indices,
          weights: sd.bones[i].weights,
        })),
      };
    }
    batches.push({
      name: shape.name || '',
      ref: shape,
      chain,
      animFlags,
      local: data.vertices,
      localNormals: data.normals ?? null,
      skinned,
      skin,
      positions,
      normals,
      uvs: data.uvSets.length ? Float32Array.from(data.uvSets[0]) : null,
      colors: data.colors ? Float32Array.from(data.colors) : null,
      indices,
      material: resolveMaterial(nif, props, !!data.colors),
      parentRef,
    });
  }

  let hasMarkers = false;

  function walk(ref, world, props, isRoot = false, inside = !underNode, animFlags = 0, chain = [], parentRef = -1) {
    const rec = deref(nif, ref);
    if (!rec) return;
    const nextChain = [...chain, rec];
    if (ANIM_FLAG_NODES.has(rec.type)) animFlags = rec.flags | 0;
    const lname = String(rec.name || '').toLowerCase();
    if (excludeNode && lname === excludeNode) return;
    if (underNode && lname === underNode) inside = true;
    // A node named Bounding Box is skipped with its subtree, except at the root, as in OpenMW, so a file whose root
    // has that name still loads.
    if (!isRoot && String(rec.name || '').toLowerCase() === 'bounding box') return;
    if (rec.type === 'RootCollisionNode') return;
    if (!includeHidden && (rec.flags & 0x0001) !== 0) return;
    if (isRoot) hasMarkers = hasMarkerFlag(nif, rec);

    const nextWorld = composeTransform(world, rec);
    let nextProps = props;
    if (rec.properties && rec.properties.length) {
      nextProps = props.slice();
      for (const pRef of rec.properties) {
        const prop = deref(nif, pRef);
        if (prop) nextProps.push(prop);
      }
    }
    if (GEOMETRY_TYPES.has(rec.type)) {
      if (inside && !skipGeometryName(rec.name, hasMarkers)) emit(rec, nextWorld, nextProps, nextChain, animFlags, parentRef);
      return;
    }
    if (PARTICLE_TYPES.has(rec.type)) {
      if (inside && opts.effects && !skipGeometryName(rec.name, hasMarkers)) {
        opts.effects.push({ ref, rec, world: nextWorld, props: nextProps, animFlags, parentRef });
      }
      return;
    }
    if (NODE_TYPES.has(rec.type) && rec.children) {
      const only = selectedChild(rec);
      if (only !== null) {
        const child = rec.children[only];
        if (child !== undefined && child >= 0) walk(child, nextWorld, nextProps, false, inside, animFlags, nextChain, ref);
        return;
      }
      for (const child of rec.children) {
        if (child >= 0) walk(child, nextWorld, nextProps, false, inside, animFlags, nextChain, ref);
      }
    }
  }

  for (const root of nif.roots) {
    if (root >= 0) walk(root, IDENTITY, [], true);
  }
  return batches;
}
