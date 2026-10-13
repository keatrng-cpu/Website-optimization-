# Graph Report - Website-optimization-  (2026-10-13)

## Corpus Check
- 59 files · ~173,287 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 8 file(s) not represented in the graph (top: (none) 3, .toml 2, .webmanifest 2)

## Summary
- 497 nodes · 926 edges · 32 communities (28 shown, 4 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 20 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `41201d08`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- index.js
- api.test.js
- app.js
- ⬢ HELIX — Your Local AI Business Team
- mem.py
- lib/license.js
- server/ai.js
- ticker.js
- capture-enrich.js
- browser-backend.js
- demo/build.mjs
- HELIX — Live App Launch Guide
- export-site.js
- dashboard-data.js
- package.json
- capture-with-proposal.js
- HELIX — Founder's Scaling Review
- dashboard-multitable-data.js
- Forge Web Stack
- Deploy + env — the runbook (no CLI; it's blocked in the sandbox)
- Guardrails — accuracy + compliance (paste these into every system prompt)
- HELIX — Local AI Business Suite (Sintra.ai rebuilt, local-first)
- Scheduled / automated jobs ("brains") — patterns + the headless gotcha
- Group B — HELIX integrations (bring your own key)
- NOW — Website-optimization- current truth
- Capture form → save + AI-enrich — adaptation checklist
- Passcode-gated dashboard — adaptation checklist
- Serverless AI function — adaptation checklist
- AGENTS.md
- CLAUDE.md
- GROK.md
- vercel.json

## God Nodes (most connected - your core abstractions)
1. `createApp()` - 54 edges
2. `api()` - 13 edges
3. `esc()` - 12 edges
4. `buildTools()` - 12 edges
5. `uid()` - 12 edges
6. `handle()` - 11 edges
7. `renderSite()` - 11 edges
8. `auditHTML()` - 10 edges
9. `⬢ HELIX — Your Local AI Business Team` - 10 edges
10. `HELIX — Live App Launch Guide` - 10 edges

## Surprising Connections (you probably didn't know these)
- `handle()` --indirect_call--> `redactIntegration()`  [INFERRED]
  demo/browser-backend.js → server/integrations.js
- `Stripe: make activation automatic (REQUIRED)` --references--> `tierForAmount()`  [INFERRED]
  launch/LAUNCH.md → launch/site/netlify/functions/lib/stripe.js
- `2026-10-13 — auto-memory protocol adopted` --references--> `graph()`  [INFERRED]
  ai/DECISIONS.md → ai/memory/mem.py
- `buildTools()` --calls--> `uid()`  [EXTRACTED]
  server/agent.js → server/store.js
- `createApp()` --calls--> `makeToolCaller()`  [EXTRACTED]
  server/index.js → server/ai.js

## Import Cycles
- None detected.

## Communities (32 total, 4 thin omitted)

### Community 0 - "index.js"
Cohesion: 0.06
Nodes (67): AGENT_SYSTEM, buildPlan(), buildTools(), executeTool(), previewPlan(), runAgent(), runPlanner(), STEP_LABELS (+59 more)

### Community 1 - "api.test.js"
Cohesion: 0.07
Nodes (30): b64urlToBuf(), entitlementFromToken(), publicKey(), aiLearn(), extractMemories(), learnFromMessage(), MEMORY_PROPOSAL_SYSTEM, normalize() (+22 more)

### Community 2 - "app.js"
Cohesion: 0.17
Nodes (28): api(), brainGuard(), closeDrawer(), deriveKey(), esc(), LAUNCHPAD, loadBoot(), maybeWelcome() (+20 more)

### Community 3 - "⬢ HELIX — Your Local AI Business Team"
Cohesion: 0.07
Nodes (27): Competitive Field Survey — 2026 (live research), Copy.ai (free tier; ~$36/mo), Durable, Field notes — PANTHEON (luxeforge.io), studied 2026-07-24, Jasper ($39–59/seat/mo, no free plan), Lindy AI ($49.99–$59.99/mo+), Marblism ($24–44/mo), Relevance AI ($234/mo team tier) (+19 more)

### Community 4 - "mem.py"
Cohesion: 0.18
Nodes (17): 2026-10-13 — auto-memory protocol adopted, DECISIONS — Website-optimization- (append-only), build(), changed(), context(), gbin(), graph(), install_hook() (+9 more)

### Community 5 - "lib/license.js"
Cohesion: 0.13
Nodes (16): fetchWithTimeout(), GUARDRAILS, JSON_HEADERS, pickModel(), b64url(), b64urlToBuf(), mintLicense(), privateKeyFrom() (+8 more)

### Community 6 - "server/ai.js"
Cohesion: 0.13
Nodes (21): aiPropose(), callAnthropic(), callOpenAI(), DEFAULT_MODEL, generate(), makeToolCaller(), _modelCache, pickModel() (+13 more)

### Community 7 - "ticker.js"
Cohesion: 0.26
Nodes (19): assemble(), cardHtml(), deltaHtml(), esc(), findStat(), fmtVal(), hideCard(), loadPrefs() (+11 more)

### Community 8 - "capture-enrich.js"
Cohesion: 0.22
Nodes (14): airtableCfg(), baseSummary(), callClaude(), clean(), createdMs(), createRecord(), enrich(), fetchWithTimeout() (+6 more)

### Community 9 - "browser-backend.js"
Cohesion: 0.22
Nodes (15): analyticsSummary(), ask(), askGateway(), askManaged(), computeNextRun(), db, DEFAULTS(), entitlementFromTokenLocal() (+7 more)

### Community 10 - "demo/build.mjs"
Cohesion: 0.16
Nodes (11): artifactIdx, js, patchedApp(), port(), read(), root, html, out (+3 more)

### Community 11 - "HELIX — Live App Launch Guide"
Cohesion: 0.13
Nodes (14): Checkout, confirmations & receipts (live links now baked in), Founder Command Center (owner analytics), HELIX — Live App Launch Guide, How a customer activates, One-time setup (in Netlify → your site → Environment variables), Revenue engine — managed Pro (serverless), Security model (hardened after an adversarial audit), Step 1 — Deploy to Netlify (2 minutes) (+6 more)

### Community 12 - "export-site.js"
Cohesion: 0.25
Nodes (12): buildChatFunction(), buildExport(), chatSystemPrompt(), escTpl(), netlifyToml(), readme(), asBytes(), concat() (+4 more)

### Community 13 - "dashboard-data.js"
Cohesion: 0.29
Nodes (12): compute(), DEF, fetchWithTimeout(), handler(), HEADERS, monthsBetween(), n(), nOr() (+4 more)

### Community 14 - "package.json"
Cohesion: 0.17
Nodes (11): description, engines, node, license, main, name, scripts, start (+3 more)

### Community 15 - "capture-with-proposal.js"
Cohesion: 0.40
Nodes (10): airtable(), callClaude(), clean(), createdMs(), factsFrom(), fetchWithTimeout(), handler(), HEADERS (+2 more)

### Community 16 - "HELIX — Founder's Scaling Review"
Cohesion: 0.18
Nodes (10): HELIX — Founder's Scaling Review, On "scaling users' finances", Phase 1 — Stop being fragile (this week), Phase 2 — Make money enforceable (next 2–3 weeks), Phase 3 — Retention loops (the scale unlock), Phase 4 — Distribution (parallel, ongoing), The path to scale, in order, Verdict (+2 more)

### Community 17 - "dashboard-multitable-data.js"
Cohesion: 0.33
Nodes (9): airtableGet(), f(), fetchWithTimeout(), handler(), HEADERS, notIn(), qs(), safeEqual() (+1 more)

### Community 18 - "Forge Web Stack"
Cohesion: 0.22
Nodes (8): Deploy flow (no CLI — it's blocked in the sandbox), Forge Web Stack, Pick your building block, The gated dashboard pattern, The serverless AI function pattern (the crown jewel), The stack in one breath, Two non-negotiable laws (they are why the builds are trusted), Working style that keeps these builds fast and correct

### Community 19 - "Deploy + env — the runbook (no CLI; it's blocked in the sandbox)"
Cohesion: 0.29
Nodes (6): 1. Build the zip (exclude secrets + internal files), 2. Deploy via Netlify Drop (browser upload), 3. Env vars, 4. Verify live (prove it, don't assume), Airtable token scope, Deploy + env — the runbook (no CLI; it's blocked in the sandbox)

### Community 20 - "Guardrails — accuracy + compliance (paste these into every system prompt)"
Cohesion: 0.29
Nodes (6): Accuracy mandate, Claims / advice (FTC + licensing), Guardrails — accuracy + compliance (paste these into every system prompt), Handy system-prompt block (adapt wording), Outbound messaging, Prompt-injection guard

### Community 21 - "HELIX — Local AI Business Suite (Sintra.ai rebuilt, local-first)"
Cohesion: 0.29
Nodes (6): 1. Research summary: how sintra.ai works, 2. Why HELIX is better (the "1000x" thesis), 3. Architecture, 4. API surface, 5. Build order & verification, HELIX — Local AI Business Suite (Sintra.ai rebuilt, local-first)

### Community 22 - "Scheduled / automated jobs ("brains") — patterns + the headless gotcha"
Cohesion: 0.33
Nodes (5): Cron / timezone, Design rules, Long-running (e.g. an intraday engine, computer-off), Scheduled / automated jobs ("brains") — patterns + the headless gotcha, Two ways to schedule, pick by reliability need

### Community 23 - "Group B — HELIX integrations (bring your own key)"
Cohesion: 0.33
Nodes (5): Group A — Claude connectors (MCP servers), Group B — HELIX integrations (bring your own key), How to connect one, Privacy & usage metering, The HELIX business-optimization stack

### Community 24 - "NOW — Website-optimization- current truth"
Cohesion: 0.40
Nodes (4): Goal, In flight, Known facts / constraints, NOW — Website-optimization- current truth

### Community 25 - "Capture form → save + AI-enrich — adaptation checklist"
Cohesion: 0.40
Nodes (4): Adapt, Airtable via MCP vs REST, Capture form → save + AI-enrich — adaptation checklist, The architecture (why it's shaped this way)

### Community 26 - "Passcode-gated dashboard — adaptation checklist"
Cohesion: 0.40
Nodes (4): Adapt, Passcode-gated dashboard — adaptation checklist, The data function, The HTML shell

### Community 27 - "Serverless AI function — adaptation checklist"
Cohesion: 0.40
Nodes (4): Adapt, Gotchas, Serverless AI function — adaptation checklist, Test it live (do this before saying "done")

## Knowledge Gaps
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `createApp()` connect `index.js` to `api.test.js`, `export-site.js`, `server/ai.js`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **Should `index.js` be split into smaller, more focused modules?**
  _Cohesion score 0.05965324713488099 - nodes in this community are weakly interconnected._
- **Why does `redactIntegration()` connect `index.js` to `browser-backend.js`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **Should `api.test.js` be split into smaller, more focused modules?**
  _Cohesion score 0.070578231292517 - nodes in this community are weakly interconnected._
- **Why does `handle()` connect `browser-backend.js` to `index.js`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._
- **Should `⬢ HELIX — Your Local AI Business Team` be split into smaller, more focused modules?**
  _Cohesion score 0.06896551724137931 - nodes in this community are weakly interconnected._
- **Should `lib/license.js` be split into smaller, more focused modules?**
  _Cohesion score 0.12666666666666668 - nodes in this community are weakly interconnected._