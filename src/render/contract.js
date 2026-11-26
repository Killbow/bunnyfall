// @ts-check

// Every field is minted at birth (the shadow origin fields as NaN), so a batch keeps one hidden class for life.
/**
 * @typedef {object} BillboardBatch
 * @property {WebGLVertexArrayObject|null} vao
 * @property {number} indexCount
 * @property {number} archive
 * @property {number} record
 * @property {{w: number, h: number}} size
 * @property {WebGLBuffer[]} buffers
 * @property {number[]|null} [origin]
 * @property {number|null} [frame]
 * @property {number} [sway]
 * @property {number} [windfall]
 * @property {number[]} [tip]
 * @property {object|null} [conceal]
 * @property {number} [hitFlash]
 * @property {number} [eliteGlow]
 * @property {number} [eliteTime]
 * @property {ReadonlyArray<number> | null} [elitePad]
 * @property {ReadonlyArray<number>} [glint]
 * @property {ReadonlyArray<number> | null} [dissolve]
 * @property {number[] | null} [crack]
 * @property {ReadonlyArray<number> | null} [tint]
 * @property {number} [dye]
 * @property {Float32Array} [bounds]
 * @property {number} [_quads]
 * @property {ArrayLike<number>|null} [_scales]
 * @property {object|object[]|null} [lptProto]
 * @property {number} [farH]
 * @property {number} [sunLift]
 * @property {boolean} [_dyn]
 * @property {object|null} [_arena]
 * @property {number} [_q0]
 * @property {number} [_ibOff]
 * @property {object|null} [_place]
 * @property {Float32Array} [_moveScratch]
 * @property {number[]} [_box]
 * @property {boolean} [noShadow]
 * @property {boolean} [ghost]
 * @property {boolean} [selfCard]
 * @property {boolean} [castOnly]
 * @property {boolean} [_dead]
 * @property {boolean} [dwColumn]
 * @property {string} [_bbKey]
 * @property {number} [_bbKeyId]
 * @property {number|string} [_bbKeyRecord]
 * @property {number|null} [_bbKeyFrame]
 * @property {number} [_bbKeyArchive]
 * @property {number} [_shGen]
 * @property {number} [_shAx]
 * @property {number} [_shAy]
 * @property {number} [_shAz]
 * @property {boolean} [_shSeen]
 * @property {number} [_shOx]
 * @property {number} [_shOy]
 * @property {number} [_shOz]
 * @property {number} [_shFrame]
 * @property {number|string} [_shRec]
 * @property {boolean} [_shFlip]
 * @property {boolean} [_shDyn]
 * @property {boolean} [_shSway]
 * @property {number} [_shMovedAt]
 * @property {number} [_shId]
 * @property {boolean} [_shAnim]
 * @property {boolean} [_shIdler]
 */

/**
 * @typedef {object} MeshBundle
 * @property {WebGLVertexArrayObject|null} vao
 * @property {WebGLBuffer[]} buffers
 * @property {Array<object>} subMeshes
 * @property {string} [name]
 * @property {number} [modelId]
 * @property {{vao: WebGLVertexArrayObject, ebo: WebGLBuffer}|null} [_wire]
 * @property {Float32Array} [bounds]
 */

// Row 0 of colors is the bottom row, and only its RGBA8 bytes are promised: read them through asBytes.
/**
 * @typedef {object} Color32
 * @property {number} width
 * @property {number} height
 * @property {ArrayBufferView} colors
 */

// Archive and record are number|string because string pairs name art that has no classic archive.
/**
 * @typedef {object} RendererLike
 * @property {(archive: number|string, record: number|string, color32: Color32, opts?: object) => any} uploadTexture
 * @property {(archive: number|string, record: number|string) => void} [releaseTexture]
 * @property {(archive: number|string, record: number|string, size: {w: number, h: number}, centers: number[][], opts?: {dynamic?: boolean}) => BillboardBatch} createBillboardBatch
 * @property {(batch: BillboardBatch|null) => void} [destroyBillboardBatch]
 * @property {(batch: BillboardBatch|null, centers: number[][]) => boolean} [moveBillboardBatch]
 * @property {Map<string, any>} [textures]
 * @property {() => void} [beginCharacterSpriteBatch]
 * @property {() => number} [flushCharacterSpriteBatch]
 * @property {boolean} [characterSpriteBatchOpen]
 */

export {};
