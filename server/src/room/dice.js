// Dice for the relay: 32 uniform bits a draw from the runtime CSPRNG, and a [0,1) draw on them.

export const rand32 = () => crypto.getRandomValues(new Uint32Array(1))[0];
export const rand01 = () => rand32() / 4294967296;
