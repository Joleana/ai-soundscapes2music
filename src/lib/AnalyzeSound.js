// src/lib/AnalyzeSound.js
const A4 = 440;
const NOTES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

function freqToMidi(freq) {
  return Math.round(69 + 12 * Math.log2(freq / A4));
}
function midiToNote(midi) {
  const name = NOTES[(midi % 12 + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${name}${octave}`;
}

async function decodeToMonoBuffer(input) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  let arrayBuffer;
  if (input instanceof Blob) arrayBuffer = await input.arrayBuffer();
  else if (input instanceof ArrayBuffer) arrayBuffer = input;
  else if (typeof input === 'string') {
    const res = await fetch(input);
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

// classic autocorrelation (difference function)
function autoCorrelate(buf, sampleRate) {
  const SIZE = buf.length;
  const MAX_SAMPLES = Math.floor(SIZE / 2);
  let bestOffset = -1;
  let bestCorr = 0;
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.01) return -1;

  let lastCorr = 1;
  for (let offset = 2; offset < MAX_SAMPLES; offset++) {
    let corr = 0;
    for (let i = 0; i < MAX_SAMPLES; i++) {
      corr += Math.abs(buf[i] - buf[i + offset]);
    }
    corr = 1 - corr / MAX_SAMPLES;
    if (corr > 0.9 && corr > lastCorr) {
      bestCorr = corr;
      bestOffset = offset;
    } else if (bestCorr > 0.92 && corr < bestCorr) {
      break;
    }
    lastCorr = corr;
  }
  if (bestOffset === -1) return -1;
  return sampleRate / bestOffset;
}

// very rough fallback for noisy/percussive sounds
function zeroCrossingFreq(buf, sampleRate) {
  let crossings = 0;
  for (let i = 1; i < buf.length; i++) {
    if ((buf[i - 1] >= 0 && buf[i] < 0) || (buf[i - 1] < 0 && buf[i] >= 0)) crossings++;
  }
  const seconds = buf.length / sampleRate;
  const freq = (crossings / 2) / seconds; // two crossings per cycle
  if (!isFinite(freq) || freq < 40 || freq > 4000) return -1;
  return freq;
}

export default async function analyzeSound(input) {
  const { data, sampleRate } = await decodeToMonoBuffer(input);

  // Try several windows to avoid silence/transients
  const positions = [0.10, 0.40, 0.70];
  const windowSec = 1.2;
  const winLen = Math.min(Math.floor(sampleRate * windowSec), data.length);
  let best = { freq: -1, corr: 0 };

  for (const p of positions) {
    const start = Math.max(0, Math.min(data.length - winLen, Math.floor(data.length * p)));
    const slice = data.subarray(start, start + winLen);
    const f = autoCorrelate(slice, sampleRate);
    if (f > 0) {
      // heuristic “correlation strength”: higher for midrange freqs on stable slices
      const strength = Math.min(1, f / 2000);
      if (strength > best.corr) best = { freq: f, corr: strength };
    }
  }

  let freq = best.freq;

  // Fallback for noisy samples
  if (freq <= 0) {
    const start = Math.floor(data.length * 0.25);
    const slice = data.subarray(start, Math.min(data.length, start + winLen));
    const zc = zeroCrossingFreq(slice, sampleRate);
    if (zc > 0) {
      freq = zc;
    }
  }

  if (!(freq > 0) || !isFinite(freq)) {
    return { frequency: 0, midi: null, note: null, method: 'autocorrelation+zc' };
  }

  const midi = freqToMidi(freq);
  const note = midiToNote(midi);
  return { frequency: freq, midi, note, method: freq === best.freq ? 'autocorrelation' : 'zero-crossing' };
}
