import { rand } from '../formats/dfRandom.js';
import { CLASSIC_UPDATE_INTERVAL } from '../characters/weaponStates.js';
import { ANIMAL_MAX_DISTANCE, AMBIENT_RANDOM_PLAY_MAX, SOUND } from './soundClips.js';
import { horseVolume, animalVolume } from './animalVolume.js';

// sourcesFn is read every tick because the streaming world rebuilds its sources against the floating origin.
export function createAnimalAmbience(audioApi, sourcesFn, randFn = rand) {
  let timer = 0;
  return {
    update(dt, eye) {
      timer += dt;
      while (timer >= CLASSIC_UPDATE_INTERVAL) {
        timer -= CLASSIC_UPDATE_INTERVAL;
        for (const a of sourcesFn()) {
          const dx = eye[0] - a.pos[0], dy = eye[1] - a.pos[1], dz = eye[2] - a.pos[2];
          if (dx * dx + dy * dy + dz * dz > ANIMAL_MAX_DISTANCE * ANIMAL_MAX_DISTANCE) continue;
          if (randFn() <= AMBIENT_RANDOM_PLAY_MAX) {
            audioApi.play3d(a.sound, a.pos, a.sound === SOUND.AnimalHorse ? horseVolume() : animalVolume(), { maxDistance: ANIMAL_MAX_DISTANCE });
          }
        }
      }
    },
  };
}
