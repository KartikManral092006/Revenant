# Render spike (historical)

> **Historical.** The spike routes (`app/api/spike/`), `spike/child.mjs` and the `SPIKE_TOKEN` variable were removed in task 2.3. The measured results are recorded in design.md, "Known Risks and Open Items" (items 2, 3, 10, 16, 17). The steps below are kept for reference only and no longer work.

These routes answered design.md open items 2, 3, 10, 16 and 17.

All routes return 404 unless the request has header `x-spike-token` equal to the `SPIKE_TOKEN` environment variable. If `SPIKE_TOKEN` is unset, every route returns 404.

## Deploy

1. Set `SPIKE_TOKEN` in Render's environment settings (a long random string). Do not commit it.
2. Push this branch and deploy the web service (`npm run build`, `npm start`, Node 22).
3. Set `export H='x-spike-token: <token>'` and `export URL=https://<service>.onrender.com`.

## Routes and what to send back

| Item | Command | Notes |
| --- | --- | --- |
| 2, 3 | `curl -s -H "$H" "$URL/api/spike/permission?mb=64"` | Node version, working permission flag, heap limit, fs write denied, memory cap enforced |
| 10 | `curl -s -H "$H" "$URL/api/spike/timing?spawns=10&calls=100"` | 1000 synthetic calls; also try `spawns=50&calls=20`. Check Render's CPU and memory in the dashboard |
| 16 | `curl -s -H "$H" "$URL/api/spike/ip"` | Run it from a known IP, and again with `-H 'X-Forwarded-For: 1.2.3.4'`. Report which entry is your real IP |
| 17 | `curl -sN -H "$H" "$URL/api/spike/stream?lines=10&delay=1000"` | Lines should appear one per second. If all arrive at the end, the proxy buffers |

Also paste the Render instance type (RAM, CPU) for item 2.

The `socketAddress` is not available to App Router route handlers, so the IP route reports header candidates only.

Local run: `SPIKE_TOKEN=test npm run dev`, then use `http://localhost:3000` as `$URL`.
