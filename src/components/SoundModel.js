// src/components/SoundModel.js
import React, { useRef, useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

export function SoundModel({
  modelUrl,
  position = [0, 0, 0],   // <-- default back to ground level
  rotation = [0, 0, 0],
  scale = [1, 1, 1],
  onClick,
}) {
  const group = useRef();
  const { scene } = useGLTF(modelUrl);

  // Compute how much to lift so the model's lowest point sits at y=0
  const yLift = useMemo(() => {
    if (!scene) return 0;
    const clone = scene.clone(true);
    const bbox = new THREE.Box3().setFromObject(clone);
    return -bbox.min.y || 0; // if min.y is negative, lift up by -min.y
  }, [scene]);

  return (
    <group
      ref={group}
      // lift only the Y; keep your provided X/Z, rotation, scale, and onClick intact
      position={[position[0], position[1] + yLift, position[2]]}
      rotation={rotation}
      scale={scale}
      onClick={onClick}
    >
      <primitive object={scene} />
    </group>
  );
}

useGLTF.preload && useGLTF.preload('/models/dog.glb');
useGLTF.preload && useGLTF.preload('/models/crunch.glb');
useGLTF.preload && useGLTF.preload('/models/footsteps.glb');
useGLTF.preload && useGLTF.preload('/models/bird.glb');
useGLTF.preload && useGLTF.preload('/models/heart.glb');
useGLTF.preload && useGLTF.preload('/models/telephone.glb');

