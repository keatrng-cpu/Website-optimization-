# The HELIX business-optimization stack

Every "app" this project uses is a **connector**, not desktop software — there's
nothing to install on your machine. They fall into two groups, and how you
connect each differs.

---

## Group A — Claude connectors (MCP servers)

These are the services attached to your **Claude** session. You connect them in
your **claude.ai connector settings** (they use OAuth sign-in), not inside HELIX.
Claude cannot authorize them for you — you click "Connect" once in the settings.

| App | What it's for in this project | Status to check |
|-----|-------------------------------|-----------------|
| Figma | Design → code, mockups, design systems | Connected |
| Canva | Graphics, social/marketing assets | ⚠️ Needs authorizing |
| Adobe (Firefly/Express) | Image editing, generation, layouts | Connected |
| Supabase | Database / auth / storage backend | Connected |
| Vercel | Deploy & host the sites HELIX builds | Connected |
| Semrush | SEO, keyword & competitor research | Connected |
| Windsor.ai | Ads + analytics across 350+ sources | Connected |
| Make | Automation scenarios (Zapier-style) | Connected |
| Gmail | Email search / drafts | Connected |
| Sentry | Error & performance monitoring | Connected |
| Postman | API design & testing | Connected |
| GitHub | Repo, PRs, CI for this project | Connected |

> To fix Canva: open claude.ai → Settings → Connectors → authorize Canva.

## Group B — HELIX integrations (bring your own key)

These connect **inside the HELIX app** (Integrations tab). You paste your own API
key; the app makes real authenticated calls and everything stays in your local
`data/db.json`. One-click presets now ship for the whole stack:

| Preset | Category | Auth | Notes |
|--------|----------|------|-------|
| OpenAI | AI | API key | also selectable as your provider in Settings |
| Anthropic (Claude) | AI | API key | highest-quality generation |
| Ollama | AI | none | fully local models |
| Stripe | Payments | secret key | revenue, customers |
| HubSpot | CRM | private app token | contacts, deals |
| SendGrid | Email | API key | send campaigns |
| Mailchimp | Email | API key | base URL = `https://<dc>.api.mailchimp.com` |
| GitHub | Dev | PAT | repos, issues, PRs |
| Figma | Design | `X-Figma-Token` | pull designs |
| Supabase | Backend | anon/service key | base URL = your project URL |
| Vercel | Deploy | access token | deploy sites |
| Semrush | SEO | API key (query) | keyword/competitor data |
| Windsor.ai | Analytics | API key (query) | GA4/Meta/Google Ads |
| Sentry | Monitoring | auth token | error tracking |
| Notion | Docs | integration secret | sync knowledge |
| Airtable | Data | PAT | pipelines, content |
| Shopify | E-commerce | admin token | base URL = your store domain |
| Slack | Notifications | webhook URL | post updates |
| Make | Automation | webhook URL | trigger scenarios |
| Custom REST / Webhook / MCP | Custom | your choice | anything else |

### How to connect one
1. `npm start`, open HELIX, go to **Integrations**.
2. Click the service → paste your key (and base URL where noted) → **Save**.
3. HELIX runs a live connection test and shows the result.
4. **Autopilot** and your AI team can then call it via the `call_integration` tool.

Nothing here is pre-connected — each connection uses *your* credentials and never
leaves your device.
