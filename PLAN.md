# HELIX — Local AI Business Suite (Sintra.ai rebuilt, local-first)

## 1. Research summary: how sintra.ai works

Sintra.ai sells "AI employees": 12 specialized chat agents, each with a persona,
role and prompt library, layered over an LLM:

| Helper | Role |
|--------|------|
| Buddy  | Business development |
| Cassie | Customer support |
| Commet | E-commerce |
| Dexter | Data analysis |
| Emmie  | Email marketing |
| Gigi   | Personal / business coaching |
| Milli  | Sales |
| Penn   | Copywriting |
| Scouty | Recruiting |
| Seomi  | SEO |
| Soshie | Social media |
| Vizzy  | Virtual assistant / operations |

Core platform mechanics:
- **Brain AI** — a per-business knowledge base (brand profile, facts, files,
  scraped pages). Injected into every helper conversation so answers are
  on-brand and business-aware.
- **Chat** — the primary interface; each helper is a themed chat with a
  role-specific system prompt.
- **Power-ups** — one-click structured deliverables (content plans, sales
  scripts, proposals, contracts, briefs).
- **Automations** — scheduled recurring tasks whose outputs land in an inbox.
- **Workspaces / teams** — multiple businesses under one account.
- Pricing: ~$97/mo subscription, cloud-only, your data lives on their servers.

## 2. Why HELIX is better (the "1000x" thesis)

1. **Local-first & private** — runs entirely on your machine; your business
   data never leaves it. No account, no subscription, no vendor lock-in.
2. **Zero dependencies** — pure Node.js (>=18) standard library. `npm start`
   works offline forever. Nothing to install, nothing to break.
3. **Bring your own model** — pluggable providers: Anthropic, OpenAI-compatible,
   Ollama (fully local LLM), plus a built-in **offline engine** so every
   feature works with no API key at all.
4. **It doesn't stop at chat** — Sintra generates text; HELIX ships outcomes:
   - **Website Studio**: generate, edit, and *actually publish* real websites,
     served live at `/sites/<slug>` from your machine.
   - **SEO auditor**: real on-page audits (title/meta/headings/images/word
     count/links) of your local sites or any URL, with scored reports.
   - **Marketing hub**: social content calendar + email campaign manager.
   - **Analytics**: real pageview tracking for the sites it publishes.
   - **Tasks board**: kanban with AI helpers as assignees that can *complete*
     tasks and attach deliverables.
5. **Everything exportable** — one-click full JSON export/import. Your data is
   a file you own.

## 3. Architecture

```
helix/
  package.json          # no runtime deps; scripts: start, test
  server/
    index.js            # HTTP server: static, API, published sites
    router.js           # tiny method+pattern router
    store.js            # JSON persistence (data/db.json), atomic writes
    helpers.js          # 12 helper personas + system prompts
    ai.js               # provider abstraction + fallback chain
    offline.js          # deterministic offline generation engine
    powerups.js         # power-up catalog + runner
    automations.js      # in-process scheduler (30s tick)
    sites.js            # website generator/renderer/publisher
    seo.js              # on-page SEO audit engine
    analytics.js        # pageview capture + rollups
  public/               # SPA (vanilla JS, hash router) — dashboard, chat,
                        # brain, tasks, power-ups, automations, sites,
                        # marketing, seo, analytics, settings
  test/api.test.js      # node:test end-to-end suite over the real server
  data/                 # runtime state (gitignored)
```

## 4. API surface

- `GET  /api/bootstrap` — helpers, settings (redacted), counts
- `GET/PUT /api/brain`, `GET/POST/DELETE /api/brain/knowledge[/:id]`
- `GET/POST /api/chats`, `GET/DELETE /api/chats/:id`, `POST /api/chats/:id/messages`
- `GET/POST/PATCH/DELETE /api/tasks[/:id]`, `POST /api/tasks/:id/run`
- `GET /api/powerups`, `POST /api/powerups/:id/run`
- `GET/DELETE /api/documents[/:id]`
- `GET/POST/PATCH/DELETE /api/automations[/:id]`, `POST /api/automations/:id/run`
- `GET/POST/PATCH/DELETE /api/sites[/:id]`, `POST /api/sites/:id/generate`, live at `GET /sites/:slug`
- `GET/POST/PATCH/DELETE /api/calendar[/:id]`, `POST /api/calendar/generate`
- `GET/POST/DELETE /api/emails[/:id]`, `POST /api/emails/generate`
- `POST /api/seo/audit`, `GET /api/seo/audits`
- `GET /api/analytics`
- `GET/PUT /api/settings`
- `GET /api/export`, `POST /api/import`

## 5. Build order & verification

1. Server core (router, store, static serving) → curl smoke.
2. Helpers + offline engine + chat → API tests.
3. Brain, tasks, power-ups, documents → API tests.
4. Automations scheduler → run-now test + tick test.
5. Website studio (+ publishing + analytics) → generate a site, fetch its HTML.
6. SEO audit + marketing hub → audit the generated site.
7. SPA frontend, polish pass.
8. Full `node --test` suite green end to end; README with run instructions.
