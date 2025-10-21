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

    const prompt = [style, noteText ? `center around the note ${noteText}` : '', 'no vocals, clean mix']
      .filter(Boolean)
      .join(', ');

    const input = {
      prompt,
      duration: Math.min(Math.max(1, duration), 30), // clamp 1..30
      output_format: 'wav',
      classifier_free_guidance: 4,
      temperature: 1.0,
      top_k: 250,
      top_p: 0,
    };
    if (sampleUrl) input.input_audio = sampleUrl; // public HTTPS URL

    // 1) Try the simple path
    let output;
    try {
      output = await replicate.run(MUSICGEN_VERSION, { input });
    } catch (e) {
      console.error('[generate-song] run() threw:', e?.message || e);
    }

    // 2) If run() gave nothing ({} / null), fall back to Predictions API once
    if (
      !output ||
      (typeof output === 'object' && !Array.isArray(output) && Object.keys(output).length === 0)
    ) {
      try {
        const prediction = await replicate.predictions.create({
          version: MUSICGEN_VERSION,
          input,
        });

        // poll briefly until it resolves
        let p = prediction;
        const started = Date.now();
        const deadlineMs = 60_000; // 60s cap
        while (p.status === 'starting' || p.status === 'processing') {
          if (Date.now() - started > deadlineMs) break;
          await new Promise(r => setTimeout(r, 1500));
          p = await replicate.predictions.get(p.id);
        }

        if (p.status !== 'succeeded') {
          console.error('[generate-song] prediction failed:', p.status, p.error || '');
          return NextResponse.json({ error: p.error || `Prediction ${p.status}` }, { status: 500 });
        }
        output = p.output;
      } catch (e) {
        console.error('[generate-song] predictions.create/get threw:', e?.message || e);
        return NextResponse.json({ error: 'Replicate prediction failed' }, { status: 500 });
      }
    }

    // --- robust URL extractor (unchanged in spirit, just compact) ---
    function findFirstUrl(v, depth = 0) {
      if (depth > 5 || v == null) return null;
      if (typeof v === 'string') return /^https?:\/\//i.test(v) ? v : null;
      if (Array.isArray(v)) {
        for (const item of v) {
          const u = findFirstUrl(item, depth + 1);
          if (u) return u;
        }
        return null;
      }
      if (typeof v === 'object') {
        const preferred = ['audio', 'url', 'output', 'result', 'files'];
        for (const key of preferred) {
          if (key in v) {
            const u = findFirstUrl(v[key], depth + 1);
            if (u) return u;
          }
        }
        for (const k of Object.keys(v)) {
          const u = findFirstUrl(v[k], depth + 1);
          if (u) return u;
        }
      }
      return null;
    }

    const url = findFirstUrl(output);

    if (!url) {
      try {
        console.error(
          '[generate-song] No URL found. sampleUrl=',
          sampleUrl,
          ' outputPreview=',
          JSON.stringify(output)?.slice(0, 600)
        );
      } catch {}
      return NextResponse.json({ error: 'No audio URL from model' }, { status: 500 });
    }

    return NextResponse.json({ url });
  } catch (err) {
    console.error('[generate-song] Error:', err);
    return NextResponse.json({ error: err?.message || 'Failed to generate' }, { status: 500 });
  }
}


