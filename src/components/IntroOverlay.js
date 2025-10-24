'use client';
import React from 'react';

const LS_KEY = 'ai_sound_intro_v2';

export default function IntroOverlay() {
  const [open, setOpen] = React.useState(!localStorage.getItem(LS_KEY));

  React.useEffect(() => {
    document.body.style.backgroundColor = open ? '#000' : '#000'; // keep scene background black
  }, [open]);

  const handleClose = () => {
    localStorage.setItem(LS_KEY, '1');
    setOpen(false);
  };

  const handleReopen = () => setOpen(true);

  // small floating info button to reopen overlay
  const InfoButton = () => (
    <button
      onClick={handleReopen}
      title="Project info"
      style={{
        position: 'fixed',
        top: 10,
        right: 10,
        zIndex: 50,
        background: 'rgba(30,30,30,0.7)',
        color: '#fff',
        border: '1px solid #333',
        borderRadius: '50%',
        width: 36,
        height: 36,
        cursor: 'pointer',
        fontSize: 18,
        lineHeight: '34px',
        textAlign: 'center',
      }}
    >
      i
    </button>
  );

  if (!open) return <InfoButton />;

  return (
    <div
      aria-modal="true"
      role="dialog"
      aria-labelledby="intro-title"
      aria-describedby="intro-desc"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.85)',
        color: '#e8ebff',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        style={{
          width: 'min(900px, 95vw)',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: '#0f1222',
          border: '1px solid #28304a',
          borderRadius: 16,
          padding: 28,
          boxShadow: '0 10px 40px rgba(0,0,0,0.45)',
        }}
      >
        <h1 id="intro-title" style={{ fontSize: 24, fontWeight: 800, marginTop: 0 }}>
          AI & Sound — Soundscapes to Music
        </h1>

        <p id="intro-desc" style={{ lineHeight: 1.6, color: '#cfd5ff' }}>
          This project was developed for the <b>AI and Advanced Sound</b> course at the
          Media University of Applied Science. It explores how everyday auditory
          experiences can be interpreted by artificial intelligence and mapped onto
          the musical domain. The aim is both academic and creative — to give users an
          intuitive feel for how non-musical sounds (a dog bark, footsteps, a bird call)
          can relate to musical pitch, and how an AI model can extend that sound into a
          short musical composition.
        </p>

        <p style={{ lineHeight: 1.6, color: '#cfd5ff' }}>
          The application uses the <b>Meta MusicGen</b> model hosted on
          <b> Replicate</b>, a state-of-the-art transformer that generates new audio
          conditioned on a given example clip and text prompt. When you click
          <em>Generate 10 s clip</em> in AI Jam, the model receives the actual audio file
          from your chosen object together with its analyzed musical note and a mood
          descriptor. Generation takes several seconds while the request is processed on
          the cloud, so please be patient — it’s composing in real time!
        </p>

        <p style={{ lineHeight: 1.6, color: '#cfd5ff' }}>
          Each sound is first analyzed locally. The field called <b>Method</b> in the
          analysis card describes the algorithm used: an autocorrelation-based pitch
          detector with filtering and median smoothing that estimates the most stable
          fundamental frequency of the sound’s resonant tail.
        </p>

        <div
          style={{
            background: '#0b0e1a',
            border: '1px solid #1e2640',
            borderRadius: 10,
            padding: 14,
            marginTop: 18,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Navigation</div>
          <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.6 }}>
            <li><b>↑ ↓ ← →</b> to walk around the scene.</li>
            <li><b>Shift + Arrow</b> to move faster.</li>
            <li>Click a 3D object to play and analyze its sound.</li>
            <li>The piano at the bottom lights the detected note.</li>
          </ul>
        </div>

        <div
          style={{
            background: '#0b0e1a',
            border: '1px solid #1e2640',
            borderRadius: 10,
            padding: 14,
            marginTop: 16,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>AI Jam</div>
          <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.6 }}>
            <li>Select a mood (<i>slow</i>, <i>fast</i>, <i>moody</i>, <i>upbeat</i>).</li>
            <li>Press <b>Generate 10 s clip</b> to create an AI-based continuation.</li>
            <li>Wait a few seconds — the model is generating your unique audio!</li>
          </ul>
        </div>

        <p style={{ fontSize: 12, color: '#93a2ff', marginTop: 14 }}>
          © 2025 AI & Sound Project · For educational and creative exploration.
        </p>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
          <button
            onClick={handleClose}
            style={{
              padding: '8px 16px',
              borderRadius: 8,
              border: '1px solid #0e7a5d',
              background: '#10b981',
              color: '#07231e',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
