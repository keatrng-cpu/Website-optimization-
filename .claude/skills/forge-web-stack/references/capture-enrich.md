# Capture form → save + AI-enrich — adaptation checklist

Templates: `assets/capture-enrich.js` (save + score/summary/draft) and `assets/capture-with-proposal.js`
(intake wizard → on-screen proposal). Both use **save-first, enrich-second**.

## The architecture (why it's shaped this way)
1. **Compute deterministic values first** (any ROI/score/metric) in plain JS.
2. **Create the Airtable record immediately** with those values + a baseline summary. The lead is now
   safe even if the next step is slow or fails.
3. **Run the model** (score/summary/draft/proposal) within the remaining time budget.
4. **PATCH the AI fields onto the record.** If enrichment times out on a cold start, the row still has
   contact info + the correct numbers + a baseline — nothing is lost, and the owner can re-enrich later.

## Adapt
- **Map fields.** In the function, build the Airtable `fields` object; include a field only when its
  value is non-empty. Numbers must be numbers, not strings. `Score`/`Status` single-selects: pass the
  option name string; the record create uses `typecast: true` so new options auto-create.
- **Front-end fallback ladder (never lose a lead).** The page posts to your capture function; if it
  can't confirm a save (`saved:false` or a network error), it falls back to a keyless relay
  (e.g. FormSubmit) and then to `mailto:`. A submission always reaches a human.
- **Score is deterministic, not the model's call.** If you show a priority/score the owner acts on,
  compute it from a code figure (e.g. value tier by $ recovered), so a high-value lead is never
  underrated by model mood. Let the model write the *summary and the draft reply*, not the score.

## Airtable via MCP vs REST
- The **function** talks to Airtable over REST using field **names** in the JSON body — readable and
  stable.
- When you (the builder) create the table or seed rows via the **Airtable MCP**, it wants field **IDs**
  (`fld…`). Grab them from the `create_table` / `list_tables_for_base` response.
- Always verify end-to-end: POST a test lead → confirm the row + AI fields in Airtable → delete the
  test row.
