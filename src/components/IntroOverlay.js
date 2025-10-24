'use client';
import React from 'react';

const LS_KEY = 'ai_sound_intro_v1';

export default function IntroOverlay({ alwaysShow = false }) {
  const [open, setOpen] = React.useState(alwaysShow || !localStorage.getItem(LS_KEY));
  const dialogRef = React.useRef(null);
  const firstBtnRef = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    const prev = document.activeElement;
    firstBtnRef.current?.focus();

    const onKey = (e) => {
      if (e.key === 'Escape') { handleClose(); }
      // simple focus trap
      if (e.key === 'Tab' && dialogRef.current) {
        const f = dialogRef.current.querySelectorAll('button, [href], input, textarea, [tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); prev && prev.focus?.(); };
  }, [open]);

  const handleClose = (dontShow = true) => {
    if (dontShow) localStorage.setItem(LS_KEY, '1');
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div
      aria-modal="true"
      role="dialog"
      aria-labelledby="intro-title"
      aria-describedby="intro-desc"
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div
        ref={dialogRef}
        style={{
          width: 'min(680px, 92vw)',
          background: '#0f1222', color: '#e8ebff',
          border: '1px solid #28304a', borderRadius: 14,
          boxShadow: '0 10px 40px rgba(0,0,0,0.45)',
          padding: 20
        }}
      >
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12 }}>
          <h1 id="intro-title" style={{ margin:0, fontSize: 20, fontWeight: 800 }}>AI & Sound — Soundscapes to Music</h1>
          <button
            onClick={() => handleClose(false)}
            aria-label="Close"
            style={{ background:'transparent', border:'none', color:'#9fb3ff', fontSize:20, cursor:'pointer' }}
          >×</button>
        </div>

        <p id="intro-desc" style={{ margin:'10px 0 16px', lineHeight:1.5, color:'#bdc7ff' }}>
          Explore how everyday sounds map to musical notes and generate new music from them.
          Click a 3D object to hear its sound and see its note. Then use <b>AI Jam</b> to create a short clip inspired by that sound and mood.
        </p>

        <div style={{
          display:'grid', gridTemplateColumns:'1fr 1fr', gap:12,
          background:'#0b0e1a', border:'1px solid #1e2640', borderRadius:10, padding:12
        }}>
          <div>
            <div style={{ fontWeight:700, marginBottom:6 }}>How to navigate</div>
            <ul style={{ margin:0, paddingLeft:18, lineHeight:1.6 }}>
              <li><b>Click</b> objects to play & analyze.</li>
              <li><b>Arrow Keys</b> walk • <b>Q/E</b> look up/down.</li>
              <li><b>+</b>/<b>−</b> fly up/down • <b>R</b> reset view.</li>
              <li>Piano at bottom lights the detected note.</li>
            </ul>
          </div>
          <div>
            <div style={{ fontWeight:700, marginBottom:6 }}>AI Jam</div>
            <ul style={{ margin:0, paddingLeft:18, lineHeight:1.6 }}>
              <li>Pick a mood: <i>slow</i>, <i>fast</i>, <i>moody</i>, <i>upbeat</i>.</li>
              <li>Click <b>Generate 10s clip</b>.</li>
              <li>We send the actual sound file + a note hint to the model.</li>
            </ul>
          </div>
        </div>

        <div style={{ fontSize:12, color:'#93a2ff', marginTop:10 }}>
          Tip: Some sounds are noisy (like crunch). The analyzer looks at the resonant tail and may fold octaves so it lands on the visible keyboard.
        </div>

        <div style={{ display:'flex', gap:8, marginTop:14, justifyContent:'flex-end' }}>
          <button
            ref={firstBtnRef}
            onClick={() => handleClose(false)}
            style={{
              padding:'8px 12px', borderRadius:8, border:'1px solid #2a3560',
              background:'#1a2240', color:'#e8ebff', cursor:'pointer'
            }}
          >Close (show again)</button>
          <button
            onClick={() => handleClose(true)}
            style={{
              padding:'8px 12px', borderRadius:8, border:'1px solid #0e7a5d',
              background:'#10b981', color:'#07231e', fontWeight:700, cursor:'pointer'
            }}
          >Got it</button>
        </div>
      </div>
    </div>
  );
}
