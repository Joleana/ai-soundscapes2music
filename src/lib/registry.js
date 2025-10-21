// src/lib/registry.js
// Add/edit objects here. All are .glb models + an audio file.

export const objects = [
  {
    id: 'dog',
    modelUrl: '/models/dog.glb',
    soundUrl: '/sounds/dog.flac',
    position: [-2.5, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  },
  {
    id: 'crunch',
    modelUrl: '/models/crunch.glb',
    soundUrl: '/sounds/crunch.wav',
    position: [0, 0, 0],
    rotation: [0, Math.PI / 8, 0],
    scale: [1, 1, 1],
  },
  // {
  //   id: 'footsteps',
  //   modelUrl: '/models/footsteps.glb',
  //   soundUrl: '/sounds/footsteps.wav',
  //   position: [2.5, 0, 0],
  //   rotation: [0, -Math.PI / 12, 0],
  //   scale: [1, 1, 1],
  // },
];
