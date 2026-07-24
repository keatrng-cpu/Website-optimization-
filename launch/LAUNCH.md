# HELIX — Live App Launch Guide

Everything in `launch/site/` is a ready-to-deploy static bundle:

| File | What it is |
|---|---|
| `index.html` | Marketing + pricing page (Free / Pro $24 with $19 founding / Agency $79) |
| `app.html` | The full HELIX free-tier app — runs entirely in the visitor's browser |
| `netlify.toml`, `_redirects` | Headers + `/app` pretty URL |
| `manifest.webmanifest`, `icon.svg` | Makes the hosted app installable — visitors can add HELIX to their home screen, no app store needed |

No build step, no dependencies, no secrets inside (scanned before commit).

To refresh `app.html` after changing the app: `node demo/build.mjs && node launch/build.mjs` (the second step re-injects the PWA tags).

## Why this last leg happens on your desktop

This cloud sandbox can build and test everything, but its network policy blocks
Netlify/Stripe, and it can't drive your Chrome browser. Your desktop Claude
(Cowork) session **can** do both. Hand it this file and the `launch/site/`
folder and it can walk the steps with you — or you can do them by hand in
about 10 minutes.

## Step 1 — Deploy to Netlify (2 minutes)

**Drag-and-drop (fastest):**
1. Open https://app.netlify.com/drop (log in / create a free account).
2. Drag the whole `launch/site/` folder onto the page.
3. Netlify gives you a live URL immediately (e.g. `something.netlify.app`).
   Rename it in *Site settings → Site details → Change site name* to something
   like `helix-app`.

**Or connect the repo (auto-deploys on every push):**
1. Netlify → *Add new site → Import an existing project* → pick
   `keatrng-cpu/Website-optimization-`, branch `main`.
2. Build command: *(leave empty)* · Publish directory: `launch/site`.

## Step 2 — Create the Stripe payment links (5 minutes)

1. In Stripe (https://dashboard.stripe.com) create two products:
   - **HELIX Pro** — recurring $24/month. Add a second price at $19/month
     for founding members (or use a promo code `FOUNDING` for $5 off — your call).
   - **HELIX Agency** — recurring $79/month.
2. For each, click **Create payment link** and copy the URL.
3. In `launch/site/index.html`, replace the two placeholders:
   - `REPLACE_WITH_STRIPE_PRO_LINK`
   - `REPLACE_WITH_STRIPE_AGENCY_LINK`
4. Re-deploy (drag the folder again, or commit + push if repo-connected).

Tip: your Claude session has a **Stripe connector** available — authorize it in
claude.ai connector settings and a session can create the products and payment
links for you, then patch the placeholders itself.

## Step 3 — Sanity checks after deploy

- [ ] `/` loads, pricing cards show, "Launch free app" opens `/app.html`
- [ ] `/app` (pretty URL) also opens the app
- [ ] In the app: create a task, build a website, reload — data persists
- [ ] Both **Get Pro** / **Get Agency** buttons open Stripe checkout
- [ ] View-source on index.html: no `REPLACE_WITH_` strings left

## Step 4 — Optional polish

- **Custom domain:** Netlify → Domain settings → add yours (free TLS included).
- **Ticker LIVE mode:** the in-app market ticker shows honest SAMPLE data until
  your gateway site has `ALPACA_KEY` / `ALPACA_SECRET` set in its Netlify
  environment — then it flips to LIVE automatically.
- **Analytics:** Netlify Analytics is one click, no code changes.

## What ships next (already planned, not yet built)

1. **License-key Pro unlock** — Stripe webhook issues a key; the app verifies
   it through the gateway and unlocks managed AI. Free app stays fully useful.
2. **Hosted sites** — one-click publish of Website Studio sites to a
   `*.helix` subdomain from inside the app.
3. **Social relays** — OAuth relay so Pro users connect Facebook/X without
   handling raw API keys.

None of these block launch: the marketing page only promises what exists,
and the honesty note on the pricing page covers the rest.
