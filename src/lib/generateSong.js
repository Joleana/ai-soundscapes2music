// src/lib/generateSong.js
export async function generateSong({ mood, noteText, sampleUrl }) {
  const res = await fetch('/api/generate-song', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mood,
      noteText: noteText || '',
      sampleUrl: sampleUrl || '',
      duration: 10
    })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to generate');
  }
  const { url } = await res.json();
  return url;
}
