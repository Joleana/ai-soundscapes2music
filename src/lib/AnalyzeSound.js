// src/lib/AnalyzeSound.js
const A4 = 440;
const NOTES = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];

function freqToMidi(freq) {
  return Math.round(69 + 12 * Math.log2(freq / A4));
}
function midiToNote(midi) {
  const name = NOTES[(midi % 12 + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${name}${octave}`;
}

function median(arr) {
  const a = arr.slice().sort((x,y)=>x-y);
  const n = a.length;
  if (!n) return 0;
  return n % 2 ? a[(n-1)/2] : 0.5*(a[n/2-1]+a[n/2]);
}
function stdev(arr) {
  if (!arr.length) return 0;
  const m = arr.reduce((s,x)=>s+x,0)/arr.length;
  const v = arr.reduce((s,x)=>s+(x-m)*(x-m),0)/arr.length;
  return Math.sqrt(v);
}
function hzFromCents(hz, cents) {
  return hz * (Math.pow(2, cents/1200) - 1);
}

function foldHzToMidiRange(hz, firstMidi, lastMidi, preferLower = true) {
  if (!(hz > 0)) return null;
  let m = Math.round(69 + 12 * Math.log2(hz / 440)); // base MIDI
  while (m > lastMidi) m -= 12;  // fold down
  while (m < firstMidi) m += 12; // fold up
  if (preferLower && m - 12 >= firstMidi) m -= 12; // gentle low bias
  return m;
}


async function decodeToMonoBuffer(input) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  let arrayBuffer;
  if (input instanceof Blob) arrayBuffer = await input.arrayBuffer();
  else if (input instanceof ArrayBuffer) arrayBuffer = input;
  else if (typeof input === 'string') {
    const res = await fetch(input, { cache: 'no-store' });
    arrayBuffer = await res.arrayBuffer();
  } else {
    throw new Error('Unsupported audio input');
  }
  const decoded = await ctx.decodeAudioData(arrayBuffer);
  const mono = decoded.numberOfChannels > 1
    ? (() => {
        const L = decoded.getChannelData(0);
        const R = decoded.getChannelData(1);
        const out = new Float32Array(decoded.length);
        for (let i = 0; i < decoded.length; i++) out[i] = 0.5 * (L[i] + R[i]);
        return out;
      })()
    : decoded.getChannelData(0);
  return { data: mono, sampleRate: decoded.sampleRate };
}

/** Pick a good analysis window: ~150ms after strongest onset, 300–400ms long */
function pickPostOnsetWindow(float32, sampleRate) {
  const frame = Math.round(0.02 * sampleRate); // 20 ms
  const hop   = Math.round(0.01 * sampleRate); // 10 ms
  let bestIdx = 0, bestRms = 0;

  for (let i = 0; i + frame < float32.length; i += hop) {
    let s = 0;
    for (let j = 0; j < frame; j++) s += float32[i+j]*float32[i+j];
    const rms = Math.sqrt(s / frame);
    if (rms > bestRms) { bestRms = rms; bestIdx = i; }
  }

  const start = Math.min(
    bestIdx + Math.round(0.15 * sampleRate), // +150ms after peak
    Math.max(0, float32.length - Math.round(0.4 * sampleRate))
  );
  const end = Math.min(float32.length, start + Math.round(0.4 * sampleRate)); // 400ms window
  return float32.slice(start, end);
}

/** Band-limit ONLY the analysis path: HPF 40Hz (remove drift) → LPF 1.5kHz (de-hiss) */
async function bandLimitForAnalysis(float32, sampleRate) {
  const length = float32.length;
  const offline = new OfflineAudioContext(1, length, sampleRate);

  const src = offline.createBufferSource();
  const buf = offline.createBuffer(1, length, sampleRate);
  buf.copyToChannel(float32, 0);
  src.buffer = buf;

  const hpf = offline.createBiquadFilter();
  hpf.type = 'highpass';
  hpf.frequency.value = 40;

  const lpf = offline.createBiquadFilter();
  lpf.type = 'lowpass';
  lpf.frequency.value = 1500;

  src.connect(hpf).connect(lpf).connect(offline.destination);
  src.start();

  const rendered = await offline.startRendering();
  return rendered.getChannelData(0).slice(0); // Float32Array
}

/** Autocorrelation pitch detection with parabolic interpolation and fundamental bias */
function autoCorrelate(frame, sampleRate) {
  const N = frame.length;

  // energy gate
  let energy = 0;
  for (let i = 0; i < N; i++) energy += frame[i] * frame[i];
  if (energy / N < 1e-5) return { hz: 0, confidence: 0 };

  // search range ~50..1000 Hz
  const minLag = Math.floor(sampleRate / 1000);
  const maxLag = Math.floor(sampleRate / 50);

  // mean-center
  let mean = 0;
  for (let i = 0; i < N; i++) mean += frame[i];
  mean /= N;

  // compute normalized correlation across lags
  const corrs = new Float32Array(maxLag + 1);
  let bestLag = -1, bestCorr = 0;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let num = 0, denom1 = 0, denom2 = 0;
    for (let i = 0; i + lag < N; i++) {
      const a = frame[i] - mean;
      const b = frame[i + lag] - mean;
      num   += a * b;
      denom1 += a * a;
      denom2 += b * b;
    }
    const denom = Math.sqrt(denom1 * denom2) || 1e-12;
    const corr = num / denom; // -1..1
    corrs[lag] = corr;
    if (corr > bestCorr) { bestCorr = corr; bestLag = lag; }
  }

  if (bestLag < 0) return { hz: 0, confidence: 0 };

  // --- Fundamental bias (safe): allow at most ~1 octave lower than best ---
  const TOL = 0.08; // require near-equal correlation
  const maxLowerLag = Math.min(maxLag, Math.round(bestLag * 1.9)); // clamp to < ~1 octave lower
  let chosenLag = bestLag;

  for (let lag = maxLowerLag; lag >= bestLag; lag--) {
    if (corrs[lag] >= bestCorr - TOL) { chosenLag = lag; break; }
  }

  // --- Parabolic interpolation around chosen lag for sub-bin precision ---
  const l = Math.max(chosenLag - 1, minLag);
  const r = Math.min(chosenLag + 1, maxLag);
  const cl = corrs[l], cc = corrs[chosenLag], cr = corrs[r];
  let lagInterp = chosenLag;
  const denom = (cl - 2 * cc + cr);
  if (Math.abs(denom) > 1e-6) {
    const offset = 0.5 * (cl - cr) / denom; // -1..1
    lagInterp = chosenLag + offset;
  }

  const hz = sampleRate / lagInterp;
  const usedCorr = corrs[chosenLag];
  const confidence = Math.max(0, Math.min(1, (usedCorr - 0.3) / 0.7));

  return { hz, confidence };
}



/** Fallback for very noisy frames */
function zeroCrossingFreq(buf, sampleRate) {
  let crossings = 0;
  for (let i = 1; i < buf.length; i++) {
    const a = buf[i - 1], b = buf[i];
    if ((a >= 0 && b < 0) || (a < 0 && b >= 0)) crossings++;
  }
  const seconds = buf.length / sampleRate;
  const freq = (crossings / 2) / seconds;
  if (!isFinite(freq) || freq < 40 || freq > 2000) return 0;
  return freq;
}

export default async function analyzeSound(input) {
  const { data, sampleRate } = await decodeToMonoBuffer(input);

  // 1) target the resonant tail rather than the noisy click
  const tail = pickPostOnsetWindow(data, sampleRate);

  // 2) band-limit ONLY for analysis (playback stays full-range)
  const filtered = await bandLimitForAnalysis(tail, sampleRate);

  // 3) estimate over multiple overlapping frames, then median + confidence gate
  const frames = [];
  const frameLen = Math.round(0.12 * sampleRate); // 120 ms
  const hop      = Math.round(0.03 * sampleRate); // 30 ms
  for (let i = 0; i + frameLen <= filtered.length; i += hop) {
    const slice = filtered.subarray(i, i + frameLen);
    const { hz, confidence } = autoCorrelate(slice, sampleRate);
    frames.push({ hz, confidence });
  }

  const good = frames.filter(f => f.confidence >= 0.6 && f.hz >= 40 && f.hz <= 2000);
  let freq = 0;

  if (good.length >= 3) {
    const medHz = median(good.map(g => g.hz));
    const spread = stdev(good.map(g => g.hz));
    // if the median is too wobbly (> ~50 cents), treat as unpitched
    if (spread <= hzFromCents(medHz, 50)) {
      freq = medHz;
    }
  }

  // 4) last-resort fallback for “almost tonal” noises
  if (freq === 0) {
    const zc = zeroCrossingFreq(filtered, sampleRate);
    if (zc) freq = zc;
  }

  if (!(freq > 0) || !isFinite(freq)) {
    return { frequency: 0, midi: null, note: null, method: 'unpitched' };
  }

  const FIRST_MIDI = 36; // C2
  const LAST_MIDI  = 96; // C7

  const foldedMidi = foldHzToMidiRange(freq, FIRST_MIDI, LAST_MIDI, true);

  // const midi = freqToMidi(freq);
  // const midi = foldedMidi;
  const midi = Number.isFinite(foldedMidi)
  ? foldedMidi
  : Math.round(69 + 12 * Math.log2(freq / 440));

  const note = midiToNote(midi);
  return { frequency: freq, midi, note, method: 'autocorr+median' };
}
