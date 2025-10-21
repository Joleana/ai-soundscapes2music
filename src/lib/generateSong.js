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
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to generate');
  }
  const { url } = data || {};
  if (!url) {
    throw new Error('Model did not return an audio URL');
  }
  return url;
}
