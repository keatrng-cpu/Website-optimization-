# Passcode-gated dashboard — adaptation checklist

Templates: `assets/dashboard-data.js` (single-table compute reader — e.g. a property/portfolio tracker),
`assets/dashboard-multitable-data.js` (reads many tables with rate-limit throttling — e.g. a command
center), and `assets/dashboard.html` (the mobile UI shell). One data function + one HTML file.

## The data function
- **Gate:** compare the `x-desk-key` header to `process.env.DESK_KEY` (default constant is a
  placeholder — set the real one via env, or change the constant before first deploy). Use the
  constant-time `safeEqual`. No data returns without the passcode.
- **Compute every number in code.** `dashboard-data.js` shows the pattern: read raw inputs from
  Airtable, compute the metrics deterministically (mortgage math, cap rate, DSCR, roll-ups), round,
  return compact JSON. The LLM is not in this path at all — dashboards must be exact.
- **Multi-table = throttle.** Airtable rate-limits at **5 requests/sec/base**. Reading >4 tables in
  parallel will 429 and blank sections. `dashboard-multitable-data.js` runs reads in **waves of 4 with
  a ~1.1s gap** and uses `Promise.allSettled` so one failed table degrades to `[]`, not a crash.
- **Freshness stamp.** Return a `lastUpdated`/`lastHeartbeat` so the UI can flag stale data (e.g. a
  data source that's asleep) instead of showing old numbers as current.

## The HTML shell
- Lock screen → passcode stored in `localStorage` → fetch with the header → render → auto-refresh on an
  interval. `noindex`. Reuse ONE passcode + one `localStorage` key across a user's private tools so
  unlocking one unlocks the hub.
- Render functions color-code (green positive / red negative) and badge (pass/fail thresholds). Keep it
  mobile-first — these get opened on a phone.
- The HTML shell is public but carries no data; nothing sensitive renders until the server returns it
  behind the gate.

## Adapt
1. Rename the function + point it at your table(s); replace the compute block with your metrics.
2. Set `DESK_KEY` (env or constant) to a real random passcode; tell the user the passcode + URL.
3. In `dashboard.html`, swap the brand/theme, the section markup, and the "add a record" Airtable link.
4. Deploy, unlock, verify a seeded row computes correctly, then clear the seed.
