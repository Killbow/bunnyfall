// MapsFile and BlocksFile import only this leaf; worldDataReplacement.js installs itself here, which avoids an
// import cycle with the readers. Unset, every ask returns no replacement.
let _door = null;
export function setWorldDataDoor(door) { _door = door ?? null; }
export const worldDataDoor = () => _door;
