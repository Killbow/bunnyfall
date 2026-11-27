export function installParts(target, ...parts) {
  for (const part of parts) {
    for (const [k, d] of Object.entries(Object.getOwnPropertyDescriptors(part.prototype))) if (k !== 'constructor') Object.defineProperty(target.prototype, k, d);
  }
}
