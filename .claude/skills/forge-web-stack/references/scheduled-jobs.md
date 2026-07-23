# Scheduled / automated jobs ("brains") — patterns + the headless gotcha

For recurring work — a premarket brief, a post-close report, a weekly reflection, a nightly digest.

## Two ways to schedule, pick by reliability need
1. **Scheduled Claude session** (`create_trigger` on the claude-code-remote MCP). A cron fires a FRESH
   Claude session with your prompt. Great for judgment-heavy work. **Gotcha:** a headless/cron session
   may NOT have the interactively-authenticated MCP connectors (Airtable, market-data, etc.) that your
   live session has — so a scheduled Claude session often can't read/write Airtable. Verify with one
   real fire before trusting it.
2. **Headless job on infra with stored creds** (a Netlify Scheduled Function, an n8n workflow, or a
   small always-on VPS with a systemd service). This runs deterministically with env-var credentials —
   the reliable home for anything that must pull data + write every day without a person present. If a
   scheduled Claude session can't reach your data, move the recurring pull+write here and call the
   Claude API (via `ANTHROPIC_API_KEY`) for the narrative.

## Design rules
- **Write to a store, surface on a dashboard.** The job writes rows (Airtable), the gated dashboard
  reads them. Keeps the "generate" and "view" concerns clean.
- **Deterministic numbers, model prose** — same accuracy mandate. Compute the stats in code; let the
  model explain, never predict/quote figures.
- **Active-learning loop (optional, powerful):** a weekly job reflects on the accumulated journal +
  outputs, extracts lessons into a `Lessons` table (Active flag), and the daily jobs READ active
  lessons and apply them — the system compounds instead of repeating.

## Cron / timezone
- Crons are UTC. Convert local→UTC at the offset in effect, and note DST: a fixed UTC cron drifts an
  hour when clocks change — plan to nudge it, or have the job self-check local time.
- Weekday-only market jobs: day-of-week `1-5`. Have the job no-op on holidays (check the date) rather
  than emit a bogus report.

## Long-running (e.g. an intraday engine, computer-off)
Serverless can't hold a websocket or run for hours; cron granularity is ~1 min. For continuous
real-time work, run the real program on a small always-on host (VPS/systemd) — don't reimplement a
validated engine in JS just to fit serverless; that creates a second, unvalidated engine. Rehome the
proven one.
