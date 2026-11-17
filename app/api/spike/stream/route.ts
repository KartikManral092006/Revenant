import { hasSpikeAccess, notFound } from "../_guard";

// Temporary spike route (task 2.1). Removed in task 2.3.
export const dynamic = "force-dynamic";

/** Streams NDJSON lines with a delay between them. Each line carries a server timestamp. */
export async function GET(request: Request) {
  if (!hasSpikeAccess(request)) return notFound();

  const params = new URL(request.url).searchParams;
  const lines = Math.min(Math.max(Number(params.get("lines") ?? 10) || 10, 1), 60);
  const delayMs = Math.min(Math.max(Number(params.get("delay") ?? 1000) || 1000, 50), 5000);
  const encoder = new TextEncoder();
  const started = Date.now();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for (let i = 0; i < lines; i++) {
          if (request.signal.aborted) break;
          const line = JSON.stringify({ i, serverElapsedMs: Date.now() - started, at: new Date().toISOString() });
          controller.enqueue(encoder.encode(line + "\n"));
          await new Promise((r) => setTimeout(r, delayMs));
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
