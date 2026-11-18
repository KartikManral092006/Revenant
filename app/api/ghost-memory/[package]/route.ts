import { NextResponse } from 'next/server';
import { listGraveyard } from '../../../../lib/graveyard/loader';
import { recordPackage } from '../../../../lib/ghost-memory/recorder';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Per-run wall clock for live Ghost Memory runs (design: 30 s). */
const LIVE_RUN_TIMEOUT_MS = 30_000;

const COVERAGE_NOTE =
  'API_Surface_Coverage is not measured on live runs. Coverage is shown from the stored recording, measured offline.';

/**
 * Live Ghost Memory run for an allowlisted Graveyard package. Unknown names get 404.
 * Streams NDJSON: `progress` lines, then one `result` (or `error`) line.
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

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
      let anyPartial = false;
      try {
        send({ type: 'progress', stage: 'start', package: manifest.name, runLimitMs: LIVE_RUN_TIMEOUT_MS });
        const recording = await recordPackage({
          manifest,
          limits: { runTimeoutMs: LIVE_RUN_TIMEOUT_MS },
          allowPartial: true,
          signal: request.signal,
          onProgress: (p) => {
            anyPartial ||= p.partial;
            send({ type: 'progress', stage: 'export', ...p });
          },
        });
        send({
          type: 'result',
          source: 'live',
          partial: anyPartial,
          coverage: null,
          coverageNote: COVERAGE_NOTE,
          recording,
        });
      } catch (err) {
        send({ type: 'error', message: err instanceof Error ? err.message : String(err) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' },
  });
}
