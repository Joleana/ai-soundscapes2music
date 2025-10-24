// src/lib/registry.js
// Add/edit objects here. All are .glb models + an audio file.

export const objects = [
  {
    id: 'dog',
    modelUrl: '/models/dog.glb',
    soundUrl: '/sounds/dog.flac',
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  },
  {
    id: 'crunch',
    modelUrl: '/models/crunch.glb',
    soundUrl: '/sounds/crunch.wav',
    rotation: [0, Math.PI / 8, 0],
    scale: [1, 1, 1],
  },
  {
    id: 'footsteps',
    modelUrl: '/models/footsteps.glb',
    soundUrl: '/sounds/footsteps.wav',
    rotation: [0, -Math.PI / 12, 0],
    scale: [3, 3, 3],
  },
  {
    id: 'bird',
    modelUrl: '/models/bird.glb',
    soundUrl: '/sounds/bird.wav',
    rotation: [0, -Math.PI / 12, 0],
    scale: [1, 1, 1],
  },
  {
    id: 'heart',
    modelUrl: '/models/heart.glb',
    soundUrl: '/sounds/heart.wav',
    rotation: [0, -Math.PI / 12, 0],
    scale: [30, 30, 30],
  },
  {
    id: 'telephone',
    modelUrl: '/models/telephone.glb',
    soundUrl: '/sounds/telephone.wav',
    rotation: [0, -Math.PI / 12, 0],
    scale: [1, 1, 1],
  }
];
