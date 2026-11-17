import { hasSpikeAccess, notFound } from "../_guard";

// Temporary spike route (task 2.1). Removed in task 2.3.
export const dynamic = "force-dynamic";

/**
 * Echoes client IP candidates. Next.js route handlers do not expose the socket address
 * directly, so it is reported from headers only where available.
 */
export async function GET(request: Request) {
  if (!hasSpikeAccess(request)) return notFound();

  const h = request.headers;
  const xff = h.get("x-forwarded-for");
  return Response.json({
    xForwardedFor: xff,
    xForwardedForEntries: xff ? xff.split(",").map((s) => s.trim()) : [],
    xRealIp: h.get("x-real-ip"),
    cfConnectingIp: h.get("cf-connecting-ip"),
    trueClientIp: h.get("true-client-ip"),
    forwarded: h.get("forwarded"),
    xForwardedProto: h.get("x-forwarded-proto"),
    // The socket address is not available to App Router handlers; the spike reports this explicitly.
    socketAddress: "unavailable in App Router route handlers (see README)",
  });
}
