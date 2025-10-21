'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

// --- layout constants (tweak to taste) ---
const WHITE_W = 48;   // px
const WHITE_H = 160;  // px
const BLACK_W = 30;   // px
const BLACK_H = 100;  // px
const OCTAVES = [1, 2, 3, 4, 5, 6];
const WHITE_NOTES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const BLACK_AFTER = { C: 'C#', D: 'D#', E: null, F: 'F#', G: 'G#', A: 'A#', B: null };
const A4 = 440;

function noteToFreq(note) {
  // note like "G#4"
  const map = { C:0,'C#':1,D:2,'D#':3,E:4,F:5,'F#':6,G:7,'G#':8,A:9,'A#':10,B:11 };
  const m = note.match(/^([A-G]#?)(-?\d)$/i);
  if (!m) return null;
  const [, name, octS] = m;
  const octave = parseInt(octS, 10);
  const semitone = map[name.toUpperCase()];
  const midi = (octave + 1) * 12 + semitone; // MIDI standard
  return A4 * Math.pow(2, (midi - 69) / 12);
}

export default function PianoScale({ activeNote, onUserPlay }) {
  // WebAudio (simple oscillator beep)
  const ctxRef = useRef(null);
  const [isUnlocked, setUnlocked] = useState(false);

  useEffect(() => {
    const unlock = () => {
      if (!ctxRef.current) ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      if (ctxRef.current.state === 'suspended') ctxRef.current.resume();
      setUnlocked(true);
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  const playBeep = (note) => {
    const freq = noteToFreq(note);
    if (!freq) return;
    if (!ctxRef.current) ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = ctxRef.current;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.value = 0.0001;
    osc.connect(gain).connect(ctx.destination);

    const now = ctx.currentTime;
    osc.start(now);
    // quick attack/decay envelope
    gain.gain.exponentialRampToValueAtTime(0.2, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    osc.stop(now + 0.5);
  };

  const handleUserClick = (note) => {
    playBeep(note);
    onUserPlay?.(note); // notify parent (optional)
  };

  // total width for container
  const totalWhiteKeys = OCTAVES.length * WHITE_NOTES.length;
  const totalWidth = totalWhiteKeys * WHITE_W;

  const isActive = (note) => (activeNote && activeNote.toUpperCase()) === note.toUpperCase();

  // Precompute black key left offsets (sit between whites)
  const blackPositions = useMemo(() => {
    // For each white key index inside the whole keyboard, compute where the black key would sit.
    // Black key is centered between its white and the next white (slightly right).
    const positions = [];
    OCTAVES.forEach((oct, oIdx) => {
      WHITE_NOTES.forEach((name, i) => {
        const black = BLACK_AFTER[name];
        if (!black) return;
        const whiteIndex = oIdx * 7 + i;
        const leftOfThisWhite = whiteIndex * WHITE_W;
        const centerBetween = leftOfThisWhite + WHITE_W * 0.75;
        positions.push({
          fullNote: `${black}${oct}`,
          left: centerBetween - BLACK_W / 2,
        });
      });
    });
    return positions;
  }, []);

  return (
    <div
      className="relative bg-neutral-200 border border-neutral-300 rounded-lg mx-auto"
      style={{ width: Math.min(totalWidth, 10000), overflowX: 'auto' }}
    >
      {/* White key strip */}
      <div
        className="relative flex select-none"
        style={{ width: totalWidth, height: WHITE_H }}
      >
        {OCTAVES.map((oct) =>
          WHITE_NOTES.map((name) => {
            const full = `${name}${oct}`;
            return (
              <button
                key={full}
                title={full}
                onClick={() => handleUserClick(full)}
                className={`relative border border-neutral-600 rounded-sm
                            focus:outline-none active:brightness-90`}
                style={{
                  width: WHITE_W,
                  height: WHITE_H,
                  background: isActive(full) ? '#fde047' /* yellow-300 */ : '#fff',
                }}
              >
                <span
                  className="absolute bottom-1 left-0 right-0 text-[10px] text-neutral-800"
                  style={{ userSelect: 'none' }}
                >
                  {full}
                </span>
              </button>
            );
          })
        )}

        {/* Black keys overlay */}
        {blackPositions.map(({ fullNote, left }) => (
          <button
            key={fullNote}
            title={fullNote}
            onClick={(e) => { e.stopPropagation(); handleUserClick(fullNote); }}
            className="absolute rounded-sm border border-black focus:outline-none active:brightness-90"
            style={{
              left,
              top: 0,
              width: BLACK_W,
              height: BLACK_H,
              background: isActive(fullNote) ? '#b45309' /* amber-700 */ : '#000',
              zIndex: 10,
            }}
          />
        ))}
      </div>

      {!isUnlocked && (
        <div className="px-3 py-1 text-xs text-neutral-700 border-t border-neutral-300 bg-neutral-100">
          Click anywhere to enable audio (browser autoplay policy).
        </div>
      )}
    </div>
  );
}
