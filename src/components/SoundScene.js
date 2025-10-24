// src/components/SoundScene.js
'use client';

import React, { Suspense, useEffect, useRef, useMemo, useState } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

import { SoundModel } from './SoundModel';
import analyzeSound from '../lib/AnalyzeSound';
import { objects as baseObjects } from '../lib/registry';

import { Piano, MidiNumbers } from 'react-piano';
import 'react-piano/dist/styles.css';

import { generateSong } from '../lib/generateSong';

import Soundfont from 'soundfont-player';


// ====== tunables ======
const GROUND_Y = 0.0;
const EYE_HEIGHT = 0.6;  // 👈 camera eye height above ground plane
const SKY_Y = 30; // max altitude when flying


// ------- tiny scatter only if missing positions (kept minimal) -------
function useScatteredObjects(src) {
  return useMemo(() => {
    const missing = src.filter(o => !o.position);
    let i = 0;
    const positions = missing.map(() => [ (i++ - 2) * 8, 0, -10 - i * 4 ]);
    let p = 0;
    return src.map(o => o.position ? o : { ...o, position: positions[p++] || [0,0,-12] });
  }, [src]);
}

// ------- one-time camera init so ground sits at bottom -------
function InitCamera({ controlsRef }) {
  const { camera } = useThree();
  useEffect(() => {
    const c = controlsRef.current;

    // ✅ simple, clean setup — ground visible with slope & good horizon
    camera.position.set(0, 3.5, 24);
    camera.updateProjectionMatrix();

    if (c) {
      c.target.set(0, 0.01, -1);   // look slightly down and into the scene

      // 👇 Add this block — limits zoom range so ground stays fixed
      // const dist = c.object.position.distanceTo(c.target);
      // c.minDistance = dist * 0.95;   // can zoom in a tiny bit
      // c.maxDistance = dist * 1.01;   // can zoom out a tiny bit
      // c.zoomSpeed   = 0.3;           // slows down pinch/scroll zoom

      c.update();
    } else {
      camera.lookAt(new THREE.Vector3(0, 0.2, -75));
    }
  }, [camera, controlsRef]);
  return null;
}


// Q/E: pure pitch in-place (rotate camera quaternion), no translation.
function KeyLook({ controlsRef, pitchRate = 50.0, minPolar = 0.01, maxPolar = Math.PI - 0.2 }) {
  const pressed = React.useRef({ KeyQ: false, KeyE: false });
  const { clock, camera } = useThree();
  useEffect(() => {
    const down = (e) => { if (e.code in pressed.current) { pressed.current[e.code] = true; e.preventDefault(); } };
    const up   = (e) => { if (e.code in pressed.current) { pressed.current[e.code] = false; e.preventDefault(); } };
    window.addEventListener('keydown', down, { passive: false });
    window.addEventListener('keyup', up,   { passive: false });
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  useFrame(() => {
    const c = controlsRef.current;
    if (!c || (!pressed.current.KeyQ && !pressed.current.KeyE)) return;
    const dt = Math.min(0.05, clock.getDelta());

    // current forward & right vectors from camera
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
    const right   = new THREE.Vector3().crossVectors(forward, camera.up).normalize();

    // figure out current polar (phi) angle to clamp
    const phiNow = new THREE.Spherical().setFromVector3(forward.clone().negate()).phi;
    let delta = 0;
    if (pressed.current.KeyQ) delta = -pitchRate * dt; // look up
    if (pressed.current.KeyE) delta =  +pitchRate * dt; // look down
    const phiNext = THREE.MathUtils.clamp(phiNow + (pressed.current.KeyQ ? -pitchRate*dt : +pitchRate*dt), minPolar, maxPolar);
    // If clamped, adjust delta so we don’t overshoot
    const targetDelta = phiNext - phiNow;
    if (Math.abs(targetDelta) < Math.abs(delta)) delta = targetDelta;
    if (Math.abs(delta) < 1e-6) return;

    // rotate camera around its RIGHT axis by 'delta' (pure pitch)
    const q = new THREE.Quaternion().setFromAxisAngle(right, delta);
    camera.quaternion.premultiply(q);
    camera.updateMatrixWorld(true);

    // update controls' target to match new gaze, WITHOUT controls.update()
    const lookDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
    c.target.copy(camera.position).add(lookDir.multiplyScalar(10)); // 10 = any comfortable focus distance
    // do not call c.update() here; that would re-position the camera
  });
  return null;
}

// Arrows: walk/strafe; +/- : fly up/down. Shift = sprint.
// Ground height stays at the initial camera Y; never below it; capped at SKY_Y.
function Walker({ controlsRef, speed = 300.0, damping = 0.9, sprintMultiplier = 2.0 }) {
  const { camera, clock } = useThree();
  const keys = React.useRef({
    ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false,
    ShiftLeft: false, ShiftRight: false,
    FlyUp: false, FlyDown: false,   // '+' / '-'
    Reset: false,
  });
  const vel = React.useRef(new THREE.Vector3());
  const baseY = React.useRef(null); // initial walking altitude

  useEffect(() => {
    const setKey = (e, isDown) => {
      if (e.code in keys.current) keys.current[e.code] = isDown;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') keys.current[e.code] = isDown;
      // plus / minus (top row or numpad)
      if (e.code === 'Equal' || e.code === 'NumpadAdd' || e.key === '+') keys.current.FlyUp = isDown;
      if (e.code === 'Minus' || e.code === 'NumpadSubtract' || e.key === '-') keys.current.FlyDown = isDown;
      if (e.code === 'KeyR') keys.current.Reset = isDown;
      if (e.code.startsWith('Arrow') || ['Equal','Minus','NumpadAdd','NumpadSubtract','KeyR'].includes(e.code)) e.preventDefault();
    };
    const down = (e) => setKey(e, true);
    const up   = (e) => setKey(e, false);
    window.addEventListener('keydown', down, { passive: false });
    window.addEventListener('keyup', up, { passive: false });
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  useFrame(() => {
    if (baseY.current == null) baseY.current = camera.position.y; // lock “ground” to your current composition Y

    const dt = Math.min(0.033, clock.getDelta());
    const sprint = (keys.current.ShiftLeft || keys.current.ShiftRight) ? sprintMultiplier : 1.0;
    const c = controlsRef.current;

    // forward/right based on where you're looking
    const forward = new THREE.Vector3(
      (c ? c.target.x : 0) - camera.position.x,
      (c ? c.target.y : 0) - camera.position.y,
      (c ? c.target.z : -1) - camera.position.z
    ).normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0,1,0)).normalize();

    // inputs
    if (keys.current.Reset) {
      // snap to walking height, zero velocity, face “forward” with a slight down-tilt
      vel.current.set(0, 0, 0);
      camera.position.y = baseY.current ?? camera.position.y;
      const c = controlsRef.current;
      if (c) {
        c.target.set(camera.position.x, 0.2, camera.position.z - 10);
        c.update();
      }
      keys.current.Reset = false;
      return; // skip the rest this frame
    }

    let iF = 0, iR = 0, iY = 0;
    if (keys.current.ArrowUp)    iF += 1;
    if (keys.current.ArrowDown)  iF -= 1;
    if (keys.current.ArrowLeft)  iR -= 1;
    if (keys.current.ArrowRight) iR += 1;
    if (keys.current.FlyUp)      iY += 1;   // '+'
    if (keys.current.FlyDown)    iY -= 1;   // '-'
    const anyMove = iF !== 0 || iR !== 0 || iY !== 0;
    if (!anyMove) {
      // No movement keys: do not touch camera or controls at all.
      // KeyLook will handle tilt; floor scroll uses camera.position (unchanged).
      vel.current.set(0, 0, 0);
      camera.position.y = baseY.current;  // keep eye on “ground”
      return;
    }

    // are we flying (any vertical intent or already off ground)?
    const offGround = camera.position.y > baseY.current + 0.01;
    const flyMode = offGround || iY !== 0;

    // desired direction
    const dir = new THREE.Vector3();
    if (flyMode) {
      const horizRight = new THREE.Vector3(right.x, 0, right.z).normalize();
      dir.addScaledVector(forward, iF);
      dir.addScaledVector(horizRight, iR);
      dir.y += iY; // vertical
    } else {
      const flatFwd = new THREE.Vector3(forward.x, 0, forward.z).normalize();
      const flatRight = new THREE.Vector3(right.x, 0, right.z).normalize();
      dir.addScaledVector(flatFwd, iF);
      dir.addScaledVector(flatRight, iR);
    }
    if (dir.lengthSq() > 0) dir.normalize();

    // integrate velocity + damping
    const accel = speed * sprint;
    if (anyMove) {
      vel.current.x = (vel.current.x + dir.x * accel * dt) * damping;
      vel.current.y = (vel.current.y + dir.y * accel * dt) * damping;
      vel.current.z = (vel.current.z + dir.z * accel * dt) * damping;
      camera.position.x += vel.current.x;
      camera.position.z += vel.current.z;
    } else {
      // absolutely no drift when only tilting with Q/E
      vel.current.set(0, 0, 0);
    }

    if (flyMode && anyMove) {
      camera.position.y = THREE.MathUtils.clamp(camera.position.y + vel.current.y, baseY.current, SKY_Y);
    } else {
      camera.position.y = baseY.current; // walk at fixed composition height
    }

    if (c) {
      if (anyMove) {
        c.target.x += vel.current.x;
        c.target.z += vel.current.z;
        // keep your nice slight downward aim while walking; natural while flying
        if (flyMode && anyMove) c.target.y += vel.current.y;
      }
      c.update();
    }
  });

  return null;
}


function TronFloor({
  size = 160,         // world size of the tile that follows you
  cell = 2.0,         // size of one grid cell in world units
  color = '#69e3ff',  // line color
  bg = '#3f4347',     // base floor color (matches your gray)
  y = 0               // floor height (keep 0)
}) {
  const meshRef = React.useRef();
  const matRef  = React.useRef();
  const { camera, gl } = useThree();

  // make a tiny grid texture once, set it to repeat
  const texture = React.useMemo(() => {
    const px = 256;
    const c = document.createElement('canvas');
    c.width = c.height = px;
    const ctx = c.getContext('2d');

    // background
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, px, px);

    // glowing grid lines
    ctx.strokeStyle = color;
    ctx.lineWidth = 6;
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;

    // border cell (left+top only; repetition makes full grid)
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(px, 0);
    ctx.moveTo(0, 0); ctx.lineTo(0, px);
    ctx.stroke();

    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = gl.capabilities.getMaxAnisotropy?.() ?? 1;
    return tex;
  }, [bg, color, gl]);

  // follow the camera so horizon never ends, but scroll UVs so lines slide
  useFrame(() => {
    if (!meshRef.current || !matRef.current) return;

    // keep plane centered under user
    meshRef.current.position.x = camera.position.x;
    meshRef.current.position.z = camera.position.z;

    // scroll texture by world position -> lines move under you
    // scale world meters -> UV space using 'cell' size
    const offX = camera.position.x / cell;
    const offY = -camera.position.z / cell; // plane is XZ; v uses Z
    matRef.current.map.offset.set(offX, offY);

    // tile enough to cover the plane
    const reps = size / cell;
    matRef.current.map.repeat.set(reps, reps);
    matRef.current.needsUpdate = false;
  });

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]} receiveShadow>
      <planeGeometry args={[size, size]} />
      <meshBasicMaterial
        ref={matRef}
        map={texture}
        transparent
        opacity={1}
        depthWrite={true}
      />
    </mesh>
  );
}

// --- piano + analysis UI state & helpers ---
const A4 = 440;
const midiToFreq = (m) => A4 * Math.pow(2, (m - 69) / 12);

function useAudio() {
  const ctxRef = React.useRef(null);
  const ensure = () => {
    if (!ctxRef.current) {
      ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    } else if (ctxRef.current.state === 'suspended') {
      ctxRef.current.resume();
    }
    return ctxRef.current;
  };
  return { ensure };
}


export default function SoundScene() {
  // ----- analysis + piano UI -----
  const [popupData, setPopupData] = React.useState(null);
  const [showPiano, setShowPiano] = React.useState(false);
  const [activeNotes, setActiveNotes] = React.useState([]);
  const pianoWrapRef = React.useRef(null);
  const [pianoWidth, setPianoWidth] = React.useState(720);
  const { ensure } = useAudio();

  // ----- AI jam UI -----
  const [mood, setMood] = React.useState('upbeat');
  const [lastSampleUrl, setLastSampleUrl] = React.useState('');
  const [lastNoteText, setLastNoteText] = React.useState(''); // <- distinct from piano range
  const [genUrl, setGenUrl] = React.useState('');
  const [isGen, setIsGen] = React.useState(false);
  const [genErr, setGenErr] = React.useState('');

  const audioRef = React.useRef(null);
  const [autoPlayNext, setAutoPlayNext] = React.useState(true);

  // responsive piano width + unlock audio on first tap
  useEffect(() => {
    const onResize = () =>
      setPianoWidth(Math.min(720, pianoWrapRef.current?.offsetWidth ?? 720));
    onResize();
    window.addEventListener('resize', onResize);
    const unlock = () => ensure();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointerdown', unlock);
    };
  }, [ensure]);

  const [piano, setPiano] = React.useState(null);
  const audioCtxRef = React.useRef(null);

  useEffect(() => {
    // create AudioContext once
    audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();

    // load the instrument asynchronously
    Soundfont.instrument(audioCtxRef.current, 'electric_piano_2')
      .then(inst => setPiano(inst))
      .catch(err => console.error('Failed to load piano soundfont:', err));
  }, []);

  // compact, readable keyboard range
  const firstMidi = MidiNumbers.fromNote('c2');
  const lastMidi  = MidiNumbers.fromNote('c7');

  const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

  const playBeepForMidi = (midi) => {
    if (!piano) return; // not ready yet
    // ensure AudioContext is running (autoplay policies)
    const ctx = audioCtxRef.current;
    if (ctx && ctx.state === 'suspended') ctx.resume();

    // play a short note (duration in seconds)
    piano.play(midi, ctx.currentTime + 0.1, { duration: 2.0, gain: 0.25 });
  };

  // analyze + light piano feedback + set AI inputs
  const playAndAnalyze = async (soundUrl) => {
    const audio = new Audio(soundUrl);
    audio.preload = 'auto';
    audio.currentTime = 0;
    audio.play().catch(() => {});
    try {
      const data = await analyzeSound(soundUrl); // {frequency, midi, note, method}
      setPopupData(data);
      setShowPiano(true);

      // feed AI inputs
      setLastSampleUrl(soundUrl);                 // e.g. "/sounds/foo.wav"
      setLastNoteText(data?.note || '');         // e.g. "A4" (optional for prompt)

      if (Number.isFinite(data?.midi)) {
        const clamped = Math.max(firstMidi, Math.min(lastMidi, data.midi));
        setActiveNotes([clamped]);
        setTimeout(() => setActiveNotes([]), 1200);
      } else {
        setActiveNotes([]);
      }
    } catch {
      setActiveNotes([]);
      // still set sample so user can generate even if analysis failed
      setLastSampleUrl(soundUrl);
      setLastNoteText('');
    }
  };

  // generate with Replicate (uses lastSampleUrl + lastNoteText)
  const onGenerate = async () => {
    setGenErr('');
    setIsGen(true);

    // capture the user gesture *before* the async call (helps autoplay policies)
    setAutoPlayNext(true);

    // clear any previous clip
    setGenUrl(null);

    try {
      const origin = window.location.origin;
      const absoluteSampleUrl = lastSampleUrl
        ? `${origin}${lastSampleUrl.startsWith('/') ? '' : '/'}${lastSampleUrl}`
        : '';

      const url = await generateSong({
        mood,
        noteText: lastNoteText || '',
        sampleUrl: absoluteSampleUrl || ''
      });

      if (!url || typeof url !== 'string') {
        throw new Error('Model did not return an audio URL');
      }

      // cache-bust so the <audio> definitely reloads on repeated generations
      const busted = `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`;
      setGenUrl(busted);

      // no manual el.play() here — your canplay effect + autoPlayNext handles it
    } catch (e) {
      console.error('Generate failed:', e);
      setAutoPlayNext(false);         // avoid trying to play nothing
      setGenErr(e?.message || 'Failed to generate');
    } finally {
      setIsGen(false);
    }
  };


  React.useEffect(() => {
    if (!genUrl || !autoPlayNext || !audioRef.current) return;
    const el = audioRef.current;
    const onCanPlay = () => {
      el.play().catch(() => {});
    };
    const onError = () => {
      console.error('Audio element error:', el.error, 'src=', el.currentSrc || genUrl);
    };
    el.addEventListener('canplay', onCanPlay);
    el.addEventListener('error', onError);
    // load ensures the new src is committed before play()
    el.load();
    return () => {
      el.removeEventListener('canplay', onCanPlay);
      el.removeEventListener('error', onError);
    };
  }, [genUrl, autoPlayNext]);


  const controlsRef = useRef(null);
  const objects = useScatteredObjects(baseObjects);

  return (
    <div id="scene-root" style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh' }}>
      <Suspense fallback={null}>
        <Canvas
          camera={{ position: [0, EYE_HEIGHT, 5], fov: 125 }}
          gl={{ powerPreference: 'high-performance' }}
          style={{ width: '100vw', height: '100vh', display: 'block' }}
        >
          {/* Lights */}
          <ambientLight intensity={0.65} />
          <directionalLight position={[8, 14, 6]} intensity={1.0} />

          {/* Sky + fog */}
          <color attach="background" args={['#0b0f14']} />
          <fog attach="fog" args={['#0b1620', 15, 45]} />

          {/* Controls */}
          <OrbitControls
            ref={controlsRef}
            enablePan={false}
            enableDamping
            dampingFactor={0.08}
            minPolarAngle={0.001}
            maxPolarAngle={Math.PI - 0.2}
            enableKeys={false}
            enableZoom={false}
          />

          <InitCamera controlsRef={controlsRef} />
          <Walker controlsRef={controlsRef} />
          <KeyLook controlsRef={controlsRef} />

          {/* Ground */}
          <TronFloor size={160} cell={2.0} />

          {/* Objects */}
          {objects.map((o) => (
            <SoundModel
              key={o.id}
              modelUrl={o.modelUrl}
              position={o.position}
              rotation={o.rotation}
              scale={o.scale}
              onClick={() => playAndAnalyze(o.soundUrl)}
            />
          ))}
        </Canvas>
        {/* === AI Jam panel (bottom-left) === */}
        <div
          style={{
            position: 'absolute', left: 12, bottom: 12, zIndex: 10,
            display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 360
          }}
          className="pointer-events-auto"
        >
          <div style={{
            background: 'rgba(12,14,20,0.7)', color: '#fff',
            borderRadius: 12, padding: 12, backdropFilter: 'blur(6px)'
          }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>AI Jam</div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {['slow','fast','moody','upbeat'].map(m => (
                <button
                  key={m}
                  onClick={() => setMood(m)}
                  style={{
                    padding: '6px 10px', borderRadius: 8, border: '1px solid #2c3340',
                    background: mood === m ? '#2563eb' : '#111827', color: '#fff', cursor: 'pointer'
                  }}
                >
                  {m}
                </button>
              ))}
            </div>

            <div style={{ fontSize: 12, opacity: 0.9, marginBottom: 8 }}>
              {lastSampleUrl
                ? <>Source: <code style={{ opacity: 0.9 }}>{lastSampleUrl}</code>
                    {lastNoteText ? <> • Note: <strong>{lastNoteText}</strong></> : null}
                  </>
                : <>Click a 3D object to pick a source sound</>}
            </div>

            <button
              onClick={onGenerate}
              disabled={isGen || !lastSampleUrl}
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 8,
                border: '1px solid #2c3340', background: '#10b981',
                color: '#0b1220', fontWeight: 700, cursor: 'pointer',
                opacity: isGen || !lastSampleUrl ? 0.6 : 1
              }}
            >
              {isGen ? 'Generating…' : 'Generate 10s clip'}
            </button>

            {genErr ? <div style={{ color: '#fca5a5', marginTop: 8, fontSize: 12 }}>{genErr}</div> : null}
            {genUrl ? (
              <div style={{ marginTop: 10 }}>
                <audio ref={audioRef} controls src={genUrl || ''} preload="auto" style={{ width: '100%' }}/>
                {/* Manual fallback button if autoplay was blocked */}
                <button onClick={() => audioRef.current?.play()} style={{ marginTop: 6, padding: '6px 10px', borderRadius: 8 }}> ▶︎ Play result </button>
              </div>
            ) : null}
          </div>
        </div>

        {/* --- Bottom overlay: analysis card + piano --- */}
        <div
          className="pointer-events-none"
          style={{
            position: 'absolute',
            left: 0, right: 0, bottom: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
            padding: '12px',
          }}
        >
          {/* Analysis card */}
          {popupData && (
            <div
              className="pointer-events-auto"
              style={{
                width: '100%',
                maxWidth: 720,
                background: '#ede9fe',
                color: '#3b0764',
                borderRadius: 12,
                boxShadow: '0 6px 24px rgba(0,0,0,0.25)',
                padding: '10px 12px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <h2 style={{ fontWeight: 700, fontSize: 16 }}>🎵 Sound Analysis</h2>
                <button
                  className="pointer-events-auto"
                  onClick={() => setPopupData(null)}
                  style={{ fontSize: 12, background: '#7c3aed', color: 'white', borderRadius: 8, padding: '4px 8px' }}
                >
                  Close
                </button>
              </div>
              {popupData.frequency ? (
                <div style={{ fontSize: 13, marginTop: 6 }}>
                  <div><b>Frequency:</b> {popupData.frequency.toFixed(2)} Hz</div>
                  <div><b>Note:</b> {popupData.note}</div>
                  <div><b>Method:</b> {popupData.method}</div>
                </div>
              ) : (
                <div style={{ fontSize: 13, marginTop: 6 }}>Couldn’t detect a stable pitch.</div>
              )}
            </div>
          )}

          {/* Piano */}
          {showPiano && (
            <div
              ref={pianoWrapRef}
              className="pointer-events-auto"
              style={{
                width: '100%',
                maxWidth: 720,
                background: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: 10,
                overflow: 'hidden',
                boxShadow: '0 6px 24px rgba(0,0,0,0.25)'
              }}
            >
              <Piano
                noteRange={{ first: firstMidi, last: lastMidi }}
                width={pianoWidth}
                activeNotes={activeNotes}
                playNote={(midi) => { setActiveNotes([midi]); playBeepForMidi(midi); }}
                stopNote={() => setActiveNotes([])}
                renderNoteLabel={({ midiNumber }) => {
                  const { note} = MidiNumbers.getAttributes(midiNumber);
                  return <div style={{ fontSize: 10, color: '#111' }}>{note}</div>;
                }}
              />
            </div>
          )}
        </div>
      </Suspense>
    </div>
  );
}

