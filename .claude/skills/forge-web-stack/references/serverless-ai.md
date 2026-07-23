# Serverless AI function — adaptation checklist

`assets/capture-enrich.js` is the fullest worked example. For a NON-persisting AI feature (a chat box,
an instant analysis) you only need the top half: the helpers + one `callClaude`. Copy it, then:

## Adapt
1. **Keep the helpers verbatim:** `fetchWithTimeout`, `createdMs`, `pickModel`, `callClaude`, `clean`.
   They solve model-discovery, timeouts, and input hygiene correctly — don't rewrite them.
2. **Write the system prompt.** This is where your feature's behavior lives. Bake in the guardrails
   from `guardrails.md` (no invented numbers, no advice, prompt-injection notice). Ask for a rigid,
   easy-to-parse output — labeled lines (`SUMMARY:` / `SCORE:` / `DRAFT:`) parse far more reliably than
   JSON from an LLM. Parse by splitting on newline and matching label prefixes.
3. **Wire inputs** through `clean(value, maxLen)` — never trust raw field text; treat it as data to
   assess, never instructions.
4. **Budget the time.** Discovery + generation must fit under ~9.2s. If you also write to Airtable,
   reserve ~2s for the write (see capture-enrich).
5. **Return 200 always.** Missing `ANTHROPIC_API_KEY`, upstream 4xx/5xx, or a timeout → a friendly
   degraded payload, never a 500. The user should get a graceful fallback, not an error.

## Gotchas
- **Never hardcode a model id in the request.** Retired ids 404 silently. `pickModel()` discovers the
  newest `sonnet` live and caches it; a constant is only the last-resort fallback.
- Set `max_tokens` deliberately — too low truncates the draft mid-sentence.
- Cold starts are slower (fresh container pays model discovery). If enrichment sometimes doesn't
  finish, the save-first pattern (capture-enrich) guarantees the record still lands.

## Test it live (do this before saying "done")
`fetch('/.netlify/functions/<name>', {method:'POST', headers:{'Content-Type':'application/json'},
body: JSON.stringify({...})}).then(r=>r.json())` — confirm `ok`, confirm the prose reads right, and
confirm NO number in the prose is stated as fact (numbers belong in dedicated fields computed in code).
