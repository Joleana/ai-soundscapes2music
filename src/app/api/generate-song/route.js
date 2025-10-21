export const runtime = 'nodejs';
export const dynamic = 'force-dynamic'; // doesn’t get cache
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

    if (!process.env.REPLICATE_API_TOKEN) {
      console.warn('[generate-song] Missing REPLICATE_API_TOKEN');
      return NextResponse.json({ error: 'Missing REPLICATE_API_TOKEN' }, { status: 500 });
    }

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
    if (sampleUrl) input.input_audio = sampleUrl; // must be a public URL

    const output = await replicate.run(MUSICGEN_VERSION, { input });

    // --- normalize into a single string URL (minimal + robust) ---
    let urlCandidate = null;

    if (typeof output === 'string') {
      urlCandidate = output;
    } else if (Array.isArray(output)) {
      const first = output[0];
      urlCandidate = typeof first === 'string'
        ? first
        : (first?.audio || first?.url || null);
    } else if (output && typeof output === 'object') {
      // Common fields seen across versions
      const audioField = output.audio ?? output.url ?? output.output ?? output.result;
      if (Array.isArray(audioField)) {
        const first = audioField[0];
        urlCandidate = typeof first === 'string'
          ? first
          : (first?.audio || first?.url || null);
      } else {
        urlCandidate = audioField || null;
      }
    }

    const url = (Array.isArray(urlCandidate) ? urlCandidate[0] : urlCandidate) || null;

    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      // one concise log so we can see the real shape server-side
      try { console.error('[generate-song] Unrecognized output:', JSON.stringify(output).slice(0, 600)); } catch {}
      return NextResponse.json({ error: 'No audio URL from model' }, { status: 500 });
    }

    return NextResponse.json({ url });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: err?.message || 'Failed to generate' }, { status: 500 });
  }
}

