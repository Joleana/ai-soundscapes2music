// src/components/SoundIcon.js
import { useRef, useEffect } from 'react';
import { useLoader } from '@react-three/fiber';
import { TextureLoader } from 'three';
import analyzeSound from '../lib/AnalyzeSound';

export function SoundIcon({ position, soundUrl, iconUrl, onAnalysisComplete }) {
  const audioRef = useRef(null);
  const texture = useLoader(TextureLoader, iconUrl);

  useEffect(() => {
    audioRef.current = new Audio(soundUrl);
    audioRef.current.preload = 'auto';
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current.load();
      }
    };
  }, [soundUrl]);

  const handleClick = async () => {
    audioRef.current?.currentTime && (audioRef.current.currentTime = 0);
    audioRef.current?.play();
    try {
      const result = await analyzeSound(soundUrl); // pass URL directly
      onAnalysisComplete?.(result);
    } catch (err) {
      console.error('Error analyzing sound:', err);
    }
  };

  return (
    <mesh position={position} onClick={handleClick}>
      <planeGeometry args={[1.2, 1.2]} />
      <meshBasicMaterial map={texture} transparent />
    </mesh>
  );
}
