// @ts-check

import { t, intlLocale } from '../ui/textManager.js';
import { POI_MESH_LIMITS } from './poiMesh.js';
import { POI_IMAGE_LIMITS } from './poiImage.js';

/** @type {Record<string, (a: any) => string>} */
const PROBLEM = {
  'not-object': () => t('poi.problem.notObject', 'This is not a POI document.'),
  'not-json': () => t('poi.problem.notJson', 'The document contains data that cannot be saved.'),
  'too-large': (a) => t('poi.problem.tooLarge', 'The document is too large ({bytes, number} bytes, max {max, number}).', a),
  version: () => t('poi.problem.version', 'Made for another version of the editor.'),
  id: () => t('poi.problem.id', 'Its ID is not valid.'),
  name: (a) => t('poi.problem.name', 'Give it a name of up to {max} characters.', a),
  about: (a) => t('poi.problem.about', 'The description is too long (at most {max} characters).', a),
  tags: (a) => t('poi.problem.tags', 'At most {max} tags.', a),
  tag: (a) => t('poi.problem.tag', 'Each tag must be 1 to {max} characters.', a),
  missing: () => t('poi.problem.missing', 'Its map location is missing.'),
  px: () => t('poi.problem.px', 'It is placed off the map to the east or west.'),
  py: () => t('poi.problem.py', 'It is placed off the map to the north or south.'),
  'in-pixel': () => t('poi.problem.inPixel', 'Its position is outside its map square.'),
  height: (a) => t('poi.problem.height', 'It is placed too high or too low (at most {max} m).', a),
  ground: () => t('poi.problem.ground', 'Choose how it is placed: on the ground or at a fixed height.'),
  quat: () => t('poi.problem.quat', 'Its rotation is not valid.'),
  size: (a) => t('poi.problem.size', 'Size must be between {min} and {max}.', a),
  'parts-none': () => t('poi.problem.partsNone', 'Add at least one part.'),
  'parts-many': (a) => t('poi.problem.partsMany', 'At most {max} parts.', a),
  key: () => t('poi.problem.key', 'A part\'s key is not valid.'),
  'key-twice': (a) => t('poi.problem.keyTwice', 'Two parts share the key {key}.', a),
  'part-name': (a) => t('poi.problem.partName', 'A part\'s name is too long (at most {max} characters).', a),
  'mesh-ref': () => t('poi.problem.meshRef', 'A part is missing a model.'),
  offset: (a) => t('poi.problem.offset', 'It is too far from the POI\'s origin (at most {max} m).', a),
  scale: (a) => t('poi.problem.scale', 'Scale on each axis must be between {min} and {max}.', a),
  'ref-missing': (a) => t('poi.problem.refMissing', 'It references {key}, which does not exist in this POI.', a),
  model: (a) => t('poi.problem.model', 'The model number must be between 1 and {max}.', a),
  groups: (a) => t('poi.problem.groups', 'At most {max} groups.', a),
  flats: (a) => t('poi.problem.flats', 'At most {max} flat pictures.', a),
  routes: (a) => t('poi.problem.routes', 'At most {max} routes.', a),
  waypoints: (a) => t('poi.problem.waypoints', 'A route can have at most {max} waypoints.', a),
  'waypoints-few': (a) => t('poi.problem.waypointsFew', 'A route needs at least {min} waypoints.', a),
  'route-mode': () => t('poi.problem.routeMode', 'Choose how the route repeats: loop, back and forth, or once.'),
  encounters: (a) => t('poi.problem.encounters', 'At most {max} encounters.', a),
  spawns: (a) => t('poi.problem.spawns', 'An encounter needs between 1 and {max} spawn points.', a),
  foe: () => t('poi.problem.foe', 'This creature does not exist in the game.'),
  'foes-many': (a) => t('poi.problem.foesMany', 'An encounter can spawn at most {max} creatures in total.', a),
  aggression: () => t('poi.problem.aggression', 'Choose whether the creatures are hostile or passive.'),
  pacifiable: () => t('poi.problem.pacifiable', 'Choose whether language skills can pacify these enemies.'),
  respawn: () => t('poi.problem.respawn', 'Choose when the creatures return.'),
  'complete-rule': () => t('poi.problem.completeRule', 'Choose how the encounter ends.'),
  interactives: (a) => t('poi.problem.interactives', 'At most {max} interactive objects.', a),
  'interactive-kind': () => t('poi.problem.interactiveKind', 'This kind of object does not exist.'),
  state: () => t('poi.problem.state', 'This state is not valid for this kind of object.'),
  'state-var': () => t('poi.problem.stateVar', 'An object\'s state can only use a persistent text variable (for everyone or per character).'),
  'wrong-kind': () => t('poi.problem.wrongKind', 'This kind of object cannot be used here.'),
  dialogues: (a) => t('poi.problem.dialogues', 'At most {max} dialogues.', a),
  nodes: (a) => t('poi.problem.nodes', 'A dialogue needs between 1 and {max} lines of speech.', a),
  options: (a) => t('poi.problem.options', 'A line of speech needs between 1 and {max} replies.', a),
  'node-unreachable': () => t('poi.problem.nodeUnreachable', 'No reply leads to this line of speech.'),
  text: (a) => t('poi.problem.text', 'The text must be 1 to {max} characters.', a),
  trades: (a) => t('poi.problem.trades', 'At most {max} trades.', a),
  recipes: (a) => t('poi.problem.recipes', 'A trade needs between 1 and {max} recipes.', a),
  stacks: (a) => t('poi.problem.stacks', 'At most {max} item stacks.', a),
  count: (a) => t('poi.problem.count', 'The number must be between 1 and {max}.', a),
  gold: (a) => t('poi.problem.gold', 'The gold amount must be a whole number up to {max}.', a),
  template: (a) => t('poi.problem.template', 'The item number must be between 0 and {max}.', a),
  'item-template': () => t('poi.problem.itemTemplate', 'This item does not exist in the game.'),
  'item-group': () => t('poi.problem.itemGroup', 'This item does not belong to that group.'),
  'item-material': () => t('poi.problem.itemMaterial', 'This item cannot be made of that material.'),
  'item-stack': () => t('poi.problem.itemStack', 'This kind of item cannot be given in a stack.'),
  'item-recipe': () => t('poi.problem.itemRecipe', 'Choose one of the available potions.'),
  'settle-var': (a) => t('poi.problem.settleVar', 'The server decides this, so its condition can only check persistent variables (for a character or the whole POI), not {key}.', a),
  'item-ref': () => t('poi.problem.itemRef', 'This picture needs an item.'),
  'no-reward': () => t('poi.problem.noReward', 'A recipe must give something: an item or gold.'),
  'free-unlimited': () => t('poi.problem.freeUnlimited', 'A recipe with no cost must have a usage limit.'),
  'limit-mode': () => t('poi.problem.limitMode', 'Choose how often this recipe can be used.'),
  stock: (a) => t('poi.problem.stock', 'The stock must be a whole number from 1 to {max}.', a),
  seconds: (a) => t('poi.problem.seconds', 'The time must be a whole number of seconds up to {max}.', a),
  variables: (a) => t('poi.problem.variables', 'At most {max} variables.', a),
  'var-type': () => t('poi.problem.varType', 'Variable type must be true or false, a number, or text.'),
  'var-scope': () => t('poi.problem.varScope', 'Choose who the variable belongs to.'),
  'var-value': (a) => t('poi.problem.varValue', 'This value is not valid for variable type {type}.', a),
  'set-var-one': () => t('poi.problem.setVarOne', 'Set a variable to a value, or add to it, not both.'),
  op: () => t('poi.problem.op', 'This comparison is not valid for this variable.'),
  events: (a) => t('poi.problem.events', 'At most {max} events.', a),
  actions: (a) => t('poi.problem.actions', 'An event can have at most {max} actions.', a),
  'actions-none': () => t('poi.problem.actionsNone', 'An event must have at least one action.'),
  conditions: (a) => t('poi.problem.conditions', 'A condition must have between 1 and {max} checks.', a),
  'too-deep': (a) => t('poi.problem.tooDeep', 'This is nested too deeply (at most {max} levels).', a),
  'event-unreachable': () => t('poi.problem.eventUnreachable', 'Nothing starts this event, so it would never run.'),
  'event-cycle': () => t('poi.problem.eventCycle', 'These events start each other without waiting, so they would never stop.'),
  'group-cycle': () => t('poi.problem.groupCycle', 'Groups cannot contain each other in a loop.'),
  'hidden-many': (a) => t('poi.problem.hiddenMany', 'At most {max} pieces of the room may be hidden.', a),
  'base-key': () => t('poi.problem.baseKey', 'This is not a valid piece of the room.'),
  'flat-kind': () => t('poi.problem.flatKind', 'This kind of picture does not match its item.'),
  'flat-ref': () => t('poi.problem.flatRef', 'This picture does not exist in the game.'),
  'figure-scale': () => t('poi.problem.figureScale', 'Pictures of people always use their default size.'),
  turn: (a) => t('poi.problem.turn', 'Rotation must be within {max} degrees.', a),
  layer: (a) => t('poi.problem.layer', 'The layer must be a whole number from -{max} to {max}.', a),
  pivot: () => t('poi.problem.pivot', 'The pivot must be two numbers from 0 to 1.'),
  collide: () => t('poi.problem.collide', 'Choose whether it is solid.'),
  bool: () => t('poi.problem.bool', 'A switch must be on or off.'),
  materials: (a) => t('poi.problem.materials', 'A part must have between 1 and {max} materials.', a),
  'texture-ref': () => t('poi.problem.textureRef', 'A material has an invalid image reference.'),
  color4: () => t('poi.problem.color4', 'A color is out of range.'),
  color3: () => t('poi.problem.color3', 'A light\'s color is out of range.'),
  'emissive-color': (a) => t('poi.problem.emissiveColor', 'The glow color must be between 0 and {max}.', a),
  alpha: () => t('poi.problem.alpha', 'Choose opaque, cutout, or see-through.'),
  cutoff: () => t('poi.problem.cutoff', 'The cutout threshold must be between 0 and 1.'),
  wrap: () => t('poi.problem.wrap', 'Choose repeat, clamp, or mirror for each axis of the image.'),
  filter: () => t('poi.problem.filter', 'Choose smooth or pixelated.'),
  uv: () => t('poi.problem.uv', 'Image placement is out of range.'),
  unknown: () => t('poi.problem.unknown', 'Contains a field the editor does not recognize.'),
  lights: (a) => t('poi.problem.lights', 'At most {max} lights.', a),
  npcs: (a) => t('poi.problem.npcs', 'At most {max} people.', a),
  lines: (a) => t('poi.problem.lines', 'At most {max} lines.', a),
  radius: (a) => t('poi.problem.radius', 'Light radius must be between {min} and {max} m.', a),
  intensity: (a) => t('poi.problem.intensity', 'A light\'s strength must be between 0 and {max}.', a),
  label: (a) => t('poi.problem.label', 'The map label is too long (at most {max} characters).', a),
  'not-uploaded': () => t('poi.problem.notUploaded', 'A model or picture it uses has not been uploaded.'),
  'not-a-mesh': () => t('poi.problem.notAMesh', 'It uses a picture where a model is required.'),
  'not-a-texture': () => t('poi.problem.notATexture', 'It uses a model where a picture is required.'),
  'material-count': (a) => t('poi.problem.materialCount', 'Its model has {want, plural, one {# material} other {# materials}}, but the part has {have}.', a),
  'budget-triangles': (a) => t('poi.problem.budgetTriangles', 'It draws {have, number} triangles, above the {max, number} limit. Simplify a model or use fewer parts.', a),
  'budget-vertices': (a) => t('poi.problem.budgetVertices', 'Its parts have {have, number} vertices in total, above the {max, number} limit. Simplify a model or use fewer parts.', a),
  'budget-bytes': (a) => t('poi.problem.budgetBytes', 'Its models and pictures total {have, number} MB, above the {max, number} MB limit.', { have: Math.ceil(a.have / 1048576), max: Math.floor(a.max / 1048576) }),
  'budget-pixels': (a) => t('poi.problem.budgetPixels', 'Its pictures total {have, number} megapixels, above the {max, number} megapixel limit. Use smaller or fewer pictures.', { have: Math.ceil(a.have / 1e6), max: Math.floor(a.max / 1e6) }),
  'budget-reach': (a) => t('poi.problem.budgetReach', 'It reaches {have, number} m from its origin, above the {max, number} m limit.', a),
};

/** @type {Record<string, (a: any) => string>} */
const GLTF = {
  'not-gltf': () => t('poi.gltf.notGltf', 'This is not a glTF 2.0 file.'),
  'not-gltf2': () => t('poi.gltf.notGltf2', 'This glTF file is not version 2.0. Export it again as glTF 2.0.'),
  'glb-chunk': () => t('poi.gltf.glbChunk', 'This .glb file is damaged: a part of it is missing or cut short.'),
  'glb-no-json': () => t('poi.gltf.glbNoJson', 'This .glb file has no scene in it.'),
  'glb-no-bin': () => t('poi.gltf.glbNoBin', 'This .glb file is missing its binary data.'),
  'data-uri': () => t('poi.gltf.dataUri', 'A file embedded in this model cannot be read.'),
  compressed: (a) => t('poi.gltf.compressed', 'This model is compressed ({ext}). Export it again with compression off.', a),
  extension: (a) => t('poi.gltf.extension', 'This model needs {ext}, which the editor does not support.', a),
  'file-missing': (a) => t('poi.gltf.fileMissing', 'This model needs the file {uri}. Choose it together with the .gltf.', a),
  missing: (a) => t('poi.gltf.missing', 'This model refers to {what, select, accessor {an accessor} bufferView {a buffer view} buffer {a buffer} image {an image} texture {a texture} node {a node} skin {a skin} joint {a joint} vertex {a vertex} other {a piece of itself}} that is not there.', a),
  'past-end': (a) => t('poi.gltf.pastEnd', 'This model\'s data is cut short: {what, select, accessor {an accessor} bufferView {a buffer view} other {a section}} extends past the end.', a),
  'node-cycle': () => t('poi.gltf.nodeCycle', 'This model\'s node tree loops back on itself.'),
  'accessor-type': () => t('poi.gltf.accessorType', 'This model stores a mesh attribute in a form glTF does not allow.'),
  'too-large': () => t('poi.gltf.tooLarge', 'This model is too large to import. Simplify it, or import it in pieces.'),
  'node-parents': () => t('poi.gltf.nodeParents', 'An object in this model\'s node tree has two parents.'),
  'too-many-parts': (a) => t('poi.gltf.tooManyParts', 'This model has {n, number} objects, and a POI holds at most {max} parts. Make it one part, or import it in pieces.', a),
  malformed: () => t('poi.gltf.malformed', 'This model\'s file is damaged or does not follow glTF 2.0. Export it again.'),
};

/** @type {Record<string, (a: any) => string>} */
const GLTF_WARN = {
  'points-lines': () => t('poi.gltfWarn.pointsLines', 'Points and lines were left out: only triangles are imported.'),
  'no-positions': () => t('poi.gltfWarn.noPositions', 'A mesh with no positions was left out.'),
  'vertex-colours': () => t('poi.gltfWarn.vertexColours', 'Vertex colors were not imported: bake them into a texture.'),
  maps: () => t('poi.gltfWarn.maps', 'Normal, occlusion, and metal/roughness maps were left out: the game does not draw them.'),
  skin: () => t('poi.gltfWarn.skin', 'A skinned model was imported in its saved pose.'),
  animation: () => t('poi.gltfWarn.animation', 'Animations were not imported.'),
  'camera-light': () => t('poi.gltfWarn.cameraLight', 'Cameras and lights in the file were left out: add lights in the editor.'),
  'no-uvs': () => t('poi.gltfWarn.noUvs', 'A textured material\'s mesh has no UVs: unwrap it in the UV editor.'),
  'emission-uv-set': () => t('poi.gltfWarn.emissionUvSet', 'A glow map uses a second UV set. It will be drawn with the first UV set.'),
  'image-format': () => t('poi.gltfWarn.imageFormat', 'A picture that is not PNG, JPEG, or WebP was left out.'),
  'emission-transform': () => t('poi.gltfWarn.emissionTransform', 'A glow map has different placement or tiling from the base texture. It will use the base texture\'s placement.'),
  instancing: () => t('poi.gltfWarn.instancing', 'Objects repeated by GPU instancing were imported once each. Export again with GPU instancing off.'),
  'extension-ignored': (a) => t('poi.gltfWarn.extensionIgnored', 'This model uses {ext}, which the editor does not support. Its extra data was skipped.', a),
};

/** @type {Record<string, (a: any) => string>} */
const MESH = {
  'too-many-vertices': (a) => t('poi.mesh.tooManyVertices', 'A part has too many vertices (at most {max, number}). Split it, or simplify it.', a),
  'too-many-indices': (a) => t('poi.mesh.tooManyIndices', 'A part has too many triangles (at most {max, number}). Split it, or simplify it.', a),
  'too-many-submeshes': (a) => t('poi.mesh.tooManySubmeshes', 'A part has too many materials (at most {max}).', a),
  'too-large': (a) => t('poi.mesh.tooLarge', 'A part is too large (at most {max} m from its origin).', a),
  'too-many-bytes': () => t('poi.mesh.tooManyBytes', 'A part\'s model file is too large.'),
  'not-finite': () => t('poi.mesh.notFinite', 'A part\'s model holds an invalid number (NaN or infinity). Export it again.'),
  'index-range': () => t('poi.mesh.indexRange', 'A part\'s model refers to a missing vertex. Export it again.'),
};

/** @type {Record<string, (a: any) => string>} */
const IMAGE = {
  'not-an-image': () => t('poi.image.notAnImage', 'Not a PNG, JPEG, or WebP picture.'),
  size: () => t('poi.image.size', 'The picture has no width or height.'),
  'too-large': (a) => t('poi.image.tooLarge', 'The picture is more than {max} pixels on a side.', a),
  'too-many-bytes': () => t('poi.image.tooManyBytes', 'The picture file is too large.'),
  jpeg: () => t('poi.image.jpeg', 'The JPEG file is damaged.'),
  webp: () => t('poi.image.webp', 'The WebP file is damaged.'),
};

/** @type {Record<string, (a: any) => string>} */
const DIFF = {
  new: (a) => t('poi.diff.new', 'A new POI: {parts, plural, one {# part} other {# parts}}, {lights, plural, one {# light} other {# lights}}.', a),
  retire: () => t('poi.diff.retire', 'Removed from the world.'),
  name: (a) => t('poi.diff.name', 'Renamed from "{from}" to "{to}".', a),
  about: () => t('poi.diff.about', 'Its description changed.'),
  tags: (a) => {
    const to = listText(Array.isArray(a.tags) ? a.tags : []);
    return to ? t('poi.diff.tags', 'Its tags are now: {to}.', { to }) : t('poi.diff.tagsNone', 'All tags were removed.');
  },
  moved: (a) => t('poi.diff.moved', 'Moved {m, number} m.', a),
  ground: (a) => (a.to === 'snap' ? t('poi.diff.groundSnap', 'Now sits on the ground.') : t('poi.diff.groundAbsolute', 'Now sits at a fixed height.')),
  turned: (a) => t('poi.diff.turned', 'Turned {deg, number}°.', a),
  sized: (a) => t('poi.diff.sized', 'Resized from {from, number} to {to, number}.', a),
  'part-added': (a) => t('poi.diff.partAdded', 'Part added: {name}.', a),
  'part-removed': (a) => t('poi.diff.partRemoved', 'Part removed: {name}.', a),
  'part-changed': (a) => t('poi.diff.partChanged', 'Part {name}: {what}.', { name: a.name, what: listText(a.what.map((w) => PART_WHAT[w]?.() ?? w)) }),
  upgraded: (a) => t('poi.diff.upgraded', 'Now saved in format version {to} (it was version {from}). That alone changes nothing in the game.', a),
  interior: () => t('poi.diff.interior', 'Its interior changed.'),
  collection: (a) => t('poi.diff.collection', 'Holds {count, plural, one {# {kind}} other {# {kind}}}.', { count: a.count, kind: KIND_WORD[a.kind]?.(a.count) ?? a.kind }),
  'item-added': (a) => t('poi.diff.itemAdded', '{kind} added: {name}.', { kind: KIND_ONE[a.kind]?.() ?? a.kind, name: a.name }),
  'item-removed': (a) => t('poi.diff.itemRemoved', '{kind} removed: {name}.', { kind: KIND_ONE[a.kind]?.() ?? a.kind, name: a.name }),
  'item-changed': (a) => t('poi.diff.itemChanged', '{kind} {name} changed: {what}.', { kind: KIND_ONE[a.kind]?.() ?? a.kind, name: a.name, what: listText(a.what) }),
  lights: (a) => t('poi.diff.lights', 'Its lights changed ({from} to {to}).', a),
  marker: (a) => (!a.show ? t('poi.diff.markerHidden', 'Map marker hidden.')
    : a.label ? t('poi.diff.markerShown', 'Map marker shown as "{label}".', a) : t('poi.diff.markerShownBare', 'Map marker shown without a label.')),
};
/**
 * @param {string[]} words
 */
function listText(words) {
  try { return new Intl.ListFormat(intlLocale(), { type: 'unit', style: 'short' }).format(words); } catch { return words.join(', '); }
}
/**
 * @param {string[]} words
 */
function andList(words) {
  try { return new Intl.ListFormat(intlLocale(), { type: 'conjunction' }).format(words); } catch {
    return words.length < 3 ? words.join(' and ') : `${words.slice(0, -1).join(', ')}, and ${words[words.length - 1]}`;
  }
}
const KIND_ONE = {
  npcs: () => t('poi.kind.npc', 'Person'), groups: () => t('poi.kind.group', 'Group'), flats: () => t('poi.kind.flat', 'Picture'),
  routes: () => t('poi.kind.route', 'Route'), encounters: () => t('poi.kind.encounter', 'Encounter'), interactives: () => t('poi.kind.interactive', 'Object'),
  dialogues: () => t('poi.kind.dialogue', 'Dialogue'), trades: () => t('poi.kind.trade', 'Trade'), variables: () => t('poi.kind.variable', 'Variable'), events: () => t('poi.kind.event', 'Event'),
};
const KIND_WORD = {
  npcs: (n) => t('poi.kinds.npcs', '{n, plural, one {person} other {people}}', { n }), groups: (n) => t('poi.kinds.groups', '{n, plural, one {group} other {groups}}', { n }),
  flats: (n) => t('poi.kinds.flats', '{n, plural, one {picture} other {pictures}}', { n }), routes: (n) => t('poi.kinds.routes', '{n, plural, one {route} other {routes}}', { n }),
  encounters: (n) => t('poi.kinds.encounters', '{n, plural, one {encounter} other {encounters}}', { n }), interactives: (n) => t('poi.kinds.interactives', '{n, plural, one {object} other {objects}}', { n }),
  dialogues: (n) => t('poi.kinds.dialogues', '{n, plural, one {dialogue} other {dialogues}}', { n }), trades: (n) => t('poi.kinds.trades', '{n, plural, one {trade} other {trades}}', { n }),
  variables: (n) => t('poi.kinds.variables', '{n, plural, one {variable} other {variables}}', { n }), events: (n) => t('poi.kinds.events', '{n, plural, one {event} other {events}}', { n }),
};
const PART_WHAT = {
  model: () => t('poi.diff.what.model', 'its model'),
  moved: () => t('poi.diff.what.moved', 'moved'),
  turned: () => t('poi.diff.what.turned', 'turned'),
  sized: () => t('poi.diff.what.sized', 'resized'),
  materials: () => t('poi.diff.what.materials', 'its materials'),
  solidity: () => t('poi.diff.what.solidity', 'its solidity or shadow'),
  name: () => t('poi.diff.what.name', 'its name'),
  layout: () => t('poi.diff.what.layout', 'its group, visibility, or lock'),
};

/** @type {Record<string, (a: any) => string>} */
const PACK = {
  'pack-not-a-pack': () => t('poi.pack.notAPack', 'This is not a POI pack.'),
  'pack-version': () => t('poi.pack.version', 'This pack was made by another version of the editor.'),
  'pack-too-large': () => t('poi.pack.tooLarge', 'This pack is too large.'),
  'pack-bad-poi': (a) => t('poi.pack.badPoi', 'A POI in the pack is not valid ({name}).', a),
  'pack-bad-entry': (a) => t('poi.pack.badEntry', 'A library entry in the pack is not valid ({name}).', a),
  'pack-asset-hash': () => t('poi.pack.assetHash', 'A model or picture in the pack failed its integrity check.'),
  'pack-asset-bad': () => t('poi.pack.assetBad', 'A model or picture in the pack is damaged.'),
  'pack-missing-asset': () => t('poi.pack.missingAsset', 'The pack is missing a model or picture it references.'),
  'pack-poi-twice': (a) => t('poi.pack.poiTwice', 'The pack contains two POIs with the same ID ({name}).', a),
  'pack-entry-twice': (a) => t('poi.pack.entryTwice', 'The pack contains two library entries with the same ID ({name}).', a),
};

const said = (table, fallback) => (code, args = {}) => {
  const f = table[code];
  return f ? f(args ?? {}) : fallback(code);
};
const unknownCode = (code) => t('poi.text.unknownCode', 'Something is wrong ({code}).', { code });

/** @param {{ code: string, [k: string]: any }} p */
export const problemText = (p) => said(PROBLEM, unknownCode)(p.code, p);
export const gltfErrorText = said(GLTF, unknownCode);
export const gltfWarningText = said(GLTF_WARN, unknownCode);
const MESH_MAX = { 'too-many-vertices': POI_MESH_LIMITS.vertices, 'too-many-indices': POI_MESH_LIMITS.indices / 3, 'too-many-submeshes': POI_MESH_LIMITS.submeshes, 'too-large': POI_MESH_LIMITS.extent };
/**
 * @param {string} code
 */
export const meshErrorText = (code) => said(MESH, () => t('poi.mesh.malformed', 'A part\'s model is malformed.'))(code, { max: MESH_MAX[code] });
/** @param {{ code: string, [k: string]: any }} c */
export const diffText = (c) => said(DIFF, unknownCode)(c.code, c);
/**
 * @param {ReturnType<typeof import('./poiEdit.js').poiHeldOf>} h
 * @param {string[]} [more]
 */
export function heldLines(h, more = []) {
  const word = (k, n) => KIND_WORD[k]?.(n) ?? k;
  const things = Object.entries(h.kinds).map(([k, n]) => t('poi.held.count', '{n, number} {kind}', { n, kind: word(k, n) }));
  if (h.interior) things.push(t('poi.held.interior', 'an interior'));
  const out = [];
  if (things.length) out.push(t('poi.held.kinds', 'It holds {list}.', { list: andList(things) }));
  if (h.linked) out.push(t('poi.held.linked', '{n, plural, one {# person has} other {# people have}} a route, dialogue, trade, reach, or condition.', { n: h.linked }));
  out.push(...more);
  if (out.length) out.push(t('poi.held.kept', 'This editor cannot change these yet. They are left as is when you save.'));
  return out;
}
/**
 * @param {number} n
 * @param {number} max
 */
export const flatCountText = (n, max) => t('poi.flat.countOf', 'Flat pictures: {n, number} of {max, number}.', { n, max });
/**
 * @param {{ bytes: number, max: number }} s
 * @param {number} v
 */
export const docSizeText = (s, v) => t('poi.editor.docSize', 'Size: {kib, number} of {max, number} KiB (format version {v}).', { kib: Math.ceil(s.bytes / 102.4) / 10, max: Math.round(s.max / 1024), v });

/** @param {{ code: string, [k: string]: any }} r */
export const packErrorText = (r) => said(PACK, unknownCode)(r.code, r);
/** @param {string} code */
export const imageErrorText = (code) => said(IMAGE, unknownCode)(code, { max: POI_IMAGE_LIMITS.side });
/**
 * @param {boolean} passes
 */
export const assetsUncheckedText = (passes) => (passes
  ? t('poi.editor.uncheckedRetry', 'A model or image failed to load, so it could not be checked yet. Trying again shortly.')
  : t('poi.editor.unchecked', 'A model or image failed to load, so it could not be checked.'));

/**
 * @param {any} d
 * @param {{ path: string, passes: boolean }[]} unloaded
 * @param {(tag: string, cls?: string, text?: string | null) => any} el
 * @param {(text: string, fn: () => void) => any} btn
 * @param {() => void} retry
 */
export function uncheckedRows(d, unloaded, el, btn, retry) {
  const out = unloaded.slice(0, 6).map(({ path, passes }) => el('div', 'dfpoi-warn', `${problemWhere(path, d)}: ${assetsUncheckedText(passes)}`));
  if (unloaded.some((u) => !u.passes)) out.push(btn(t('poi.editor.checkAgain', 'Check again'), retry));
  return out;
}

/**
 * @param {string} path
 * @param {any} [doc]
 */
export function problemWhere(path, doc = null) {
  const bits = [];
  const part = /^parts\[(\d+)\]/.exec(path);
  if (part) {
    const p = doc?.parts?.[Number(part[1])];
    const name = (p?.name || p?.key) ?? null;
    bits.push(name ? t('poi.where.partNamed', 'Part {name}', { name }) : t('poi.where.part', 'Part {n}', { n: Number(part[1]) + 1 }));
    const mat = /\.materials\[(\d+)\]/.exec(path);
    if (mat) bits.push(t('poi.where.material', 'material {n}', { n: Number(mat[1]) + 1 }));
  }
  const coll = /^(npcs|groups|flats|routes|encounters|interactives|dialogues|trades|variables|events)\[(\d+)\]/.exec(path);
  if (coll) {
    const o = doc?.[coll[1]]?.[Number(coll[2])];
    const name = (o?.name || o?.key) ?? null;
    const kind = KIND_ONE[/** @type {keyof typeof KIND_ONE} */ (coll[1])]();
    bits.push(name ? `${kind} ${name}` : `${kind} ${Number(coll[2]) + 1}`);
  }
  const light = /^lights\[(\d+)\]/.exec(path);
  if (light) bits.push(t('poi.where.light', 'Light {n}', { n: Number(light[1]) + 1 }));
  const tag = /^tags\[(\d+)\]/.exec(path);
  if (tag) bits.push(t('poi.where.tag', 'Tag {n}', { n: Number(tag[1]) + 1 }));
  if (path === 'thumb') bits.push(t('poi.where.thumb', 'Library image'));
  return bits.join(' · ');
}
