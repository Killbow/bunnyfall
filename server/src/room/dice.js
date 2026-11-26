export const rand32 = () => crypto.getRandomValues(new Uint32Array(1))[0];
export const rand01 = () => rand32() / 4294967296;
