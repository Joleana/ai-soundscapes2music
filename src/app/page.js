// src/app/page.js
'use client';
import dynamic from 'next/dynamic';
import 'react-piano/dist/styles.css';

const SoundScene = dynamic(() => import('../components/SoundScene'), { ssr: false });

export default function Home() {
  return (
    // ✅ explicit viewport units, no % anywhere
    <main style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <SoundScene />
    </main>
  );
}
