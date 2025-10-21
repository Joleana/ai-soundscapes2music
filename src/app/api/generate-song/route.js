export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import Replicate from 'replicate';

// MusicGen (with optional melody conditioning via input_audio)
const MUSICGEN_VERSION = 'meta/musicgen:7a76a8258b23fae65c5a22debb8841d1d7e816b75c2f24218cd2bd8573787906';
// ^ if this version hash is wrong for your account/model, swap to the exact one you see on Replicate.

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN, // no TS non-null assertion
});

export async function POST(req) {
  try {
    const { mood = 'upbeat', noteText = '', sampleUrl = '', duration = 10 } = await req.json();

    const promptMap = {
      slow:   'slow, gentle, sparse instrumentation',
      fast:   'fast, energetic, driving rhythm',
      moody:  'moody, atmospheric, minor key, pads',
      upbeat: 'upbeat, bright, catchy melody',
    };
    const style = promptMap[mood] || promptMap.upbeat;

    const prompt = [
      style,
      noteText ? `center around the note ${noteText}` : '',
      'no vocals, clean mix',
    ].filter(Boolean).join(', ');

    const input = {
      prompt,
      duration: Math.min(Math.max(1, duration), 30), // clamp 1..30
      output_format: 'wav',
      classifier_free_guidance: 4,
      temperature: 1.0,
      top_k: 250,
      top_p: 0,
    };
    if (sampleUrl) input.input_audio = sampleUrl; // must be a public URL Replicate can fetch

    const output = await replicate.run(MUSICGEN_VERSION, { input });

    // Some models return a string URL; some return arrays/objects—normalize it:
    const url =
      typeof output === 'string'
        ? output
        : Array.isArray(output)
          ? (output[0]?.audio || output[0] || null)
          : (output?.audio || output?.url || null);

    if (!url) return NextResponse.json({ error: 'No audio URL from model' }, { status: 500 });

    return NextResponse.json({ url });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err?.message || 'Failed to generate' }, { status: 500 });
  }
}
