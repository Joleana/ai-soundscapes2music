from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import librosa
import numpy as np
import tempfile

app = FastAPI()

# Allow frontend (React) to communicate
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # React default dev port
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def freq_to_note(freq):
    if freq <= 0:
        return None
    notes = ['C', 'C#', 'D', 'D#', 'E', 'F',
             'F#', 'G', 'G#', 'A', 'A#', 'B']
    A4_freq = 440.0
    note_num = 12 * np.log2(freq / A4_freq) + 69
    note_index = int(round(note_num)) % 12
    octave = int(note_num // 12) - 1
    return f"{notes[note_index]}{octave}"

@app.post("/api/analyze")
async def analyze(audio_file: UploadFile = File(...)):
    with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as tmp:
        tmp.write(await audio_file.read())
        audio_path = tmp.name

    y, sr = librosa.load(audio_path, sr=None)
    f0, _, _ = librosa.pyin(y, fmin=librosa.note_to_hz('C1'), fmax=librosa.note_to_hz('C8'))

    f0_clean = f0[~np.isnan(f0)]

    if len(f0_clean) > 0:
        median_f0 = np.median(f0_clean)
        method = "pyin"
    else:
        # Backup method: use FFT to find dominant frequency
        D = np.abs(librosa.stft(y))
        freqs = librosa.fft_frequencies(sr=sr)
        magnitudes = D.mean(axis=1)
        peak_idx = magnitudes.argmax()
        median_f0 = freqs[peak_idx]
        method = "fft"

    note = freq_to_note(median_f0)

    return {
        "frequency": float(median_f0),
        "note": note,
        "method": method
    }
