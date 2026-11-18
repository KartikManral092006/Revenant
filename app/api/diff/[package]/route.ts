import { existsSync } from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { listGraveyard } from '../../../../lib/graveyard/loader';
import { effectiveN } from '../../../../lib/graveyard/manifest-schema';
import { generatorInputSource } from '../../../../lib/diff/cli';
import { loadRules } from '../../../../lib/diff/rules';
import { createDiffStream } from '../../../../lib/diff/stream';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** A package counts as fully resurrected once its rebuild entry point exists. */
function isResurrected(name: string, root: string = process.cwd()): boolean {
  return existsSync(path.join(root, 'resurrected', name, 'src', 'index.js'));
}

/**
 * Live sandboxed differential for a fully resurrected Graveyard package. Unknown names get 404,
 * packages without a rebuild get 409. The browser never runs package code (Req 7.6).
 * Streams NDJSON: `start`, `progress`, `mismatch`, then `end` (or `error`).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ package: string }> },
): Promise<Response> {
  const { package: name } = await params;
  const manifest = listGraveyard().find((m) => m.name === name);
  if (!manifest) {
    return NextResponse.json({ error: 'package is not in the Graveyard' }, { status: 404 });
  }
  if (!isResurrected(manifest.name)) {
    return NextResponse.json({ error: 'package is not resurrected' }, { status: 409 });
  }
  const n = effectiveN(manifest);
  const seed = manifest.generator.seed;
  const exportName = manifest.exportsUnderTest[0].name;
  let stream: ReadableStream<Uint8Array>;
  try {
    stream = createDiffStream({
      run: {
        package: manifest.name,
        exportName,
        callStyle: manifest.callStyle,
        inputs: generatorInputSource(manifest, exportName, n, seed),
        seed,
        n,
        rules: loadRules(manifest.name),
        signal: request.signal,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' },
  });
}
