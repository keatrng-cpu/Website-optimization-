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

**Or connect the repo — RECOMMENDED (auto-deploys on every push):**
1. Netlify → your `helixscales` site → *Site configuration → Build & deploy →
   Link repository* → pick `keatrng-cpu/Website-optimization-`, branch `main`.
2. Build command: *(leave empty)* · Publish directory: `launch/site`.
3. Done forever: every improvement Claude pushes to `main` goes live on
   helixscales.netlify.app automatically — no more zip dragging, and the
   Stripe links/forms/PWA all ship correctly every time.

## Checkout, confirmations & receipts (live links now baked in)

The repo's pricing page now carries the real Stripe payment links, so
re-deploying a fresh zip never reverts checkout to placeholders again.

To make order confirmations match the HELIX theme (one-time Stripe setup):

1. **Confirmation page:** Stripe Dashboard → Payment Links → each link →
   Edit → After payment → *Redirect customers to your website* →
   `https://helixscales.netlify.app/success.html`. Buyers land on a themed
   ⬢ "Welcome to HELIX Pro" page that walks them into the app.
2. **Receipt emails:** in the same edit screen, enable *Email customers
   about successful payments*. Stripe sends the order-confirmation email.
3. **Theme the email:** Stripe Dashboard → Settings → Branding — upload
   `icon.svg` as the logo/icon, set brand color `#6c8cff` and accent
   `#0a0d16`. Every receipt and checkout page then matches the site.

If checkout ever misbehaves again, check in this order: the button's href
on the live site (view-source — it must be a `buy.stripe.com` URL), the
payment link is **Active** in Stripe and in **live mode** (not test), and
your Stripe account has completed activation (payouts enabled).

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

## Revenue engine — managed Pro (serverless)

`launch/site/netlify/functions/` holds the paid-tier backend. It turns your
live Stripe checkout into un-bypassable Pro access + metered managed AI,
WITHOUT a database and without ever seeing a user's workspace:

- **redeem-license** — a customer proves they paid (checkout link or email);
  the function confirms an active Stripe subscription and mints an
  Ed25519-signed license bound to their email + tier. It can only issue a
  license for someone who actually paid.
- **ai** — managed AI for Pro/Agency. It verifies the license signature
  *before* spending a token of your Anthropic budget, injects the compliance
  guardrails, auto-discovers the newest Sonnet, and caps output. No valid
  license → no AI.
- **verify-license** — authoritative status check, no AI spend.

Design: the server is the only thing that can *mint* a license (it holds the
private key); the app verifies. No user data ever touches the server, so the
privacy story survives — the only thing gated is *your* managed compute.

### One-time setup (in Netlify → your site → Environment variables)

Set these four (they bind at deploy — re-deploy after adding them):

| Variable | Value |
|---|---|
| `HELIX_LICENSE_KEY` | the private signing key I generated for you (paste the value I gave you in chat — **never commit it**) |
| `STRIPE_SECRET_KEY` | your Stripe **secret** key (`sk_live_…`) from Stripe → Developers → API keys |
| `ANTHROPIC_API_KEY` | your Anthropic API key (`sk-ant-…`) — this is the compute you're reselling as Pro |
| *(optional)* | none — no webhook or database needed for v1 |

### Stripe: make activation smooth
In each payment link's *After payment* setting, redirect to
`https://helixscales.netlify.app/success.html?session_id={CHECKOUT_SESSION_ID}`.
The success page + Account "Activate Pro" pass that `session_id` (a secret only
the buyer holds) to `redeem-license`, so activation is one click. Email-based
activation also works as a fallback (any active subscriber).

Price → tier mapping is by amount: **≥ $70/mo → Agency, ≥ $10/mo → Pro**
(covers $19 founding, $24 Pro, $79 Agency). Adjust in
`functions/lib/stripe.js` (`tierForAmount`) if you change prices.

### How a customer activates
Checkout → redirected to the success page → open the app → **Account →
Activate Pro** → their plan unlocks (5 or unlimited workspaces + managed AI).
Managed AI runs only on the hosted app; the installed/local app stays
bring-your-own-key (a clean product line: hosted = managed, local = BYO).

### Known v1 limitations (documented, not hidden)
- Workspace *count* limit is enforced on the user's own device, so a
  determined user could locally spoof it — but it unlocks nothing that costs
  you money (managed AI/hosted value stays signature-gated server-side).
- Email-based activation binds a license to an email; the more secure path is
  the `session_id` from checkout. Both require a *real active* subscription.
- License expiry is 400 days; renewal re-issues on next activation. A future
  pass can add a Stripe webhook to auto-refresh and to revoke on cancellation.

## Founder Command Center (owner analytics)

Sign in inside the app (Account) with the founder email
**luxeforgeio@gmail.com** — a 👑 Command Center appears in the sidebar with
live device analytics (actions all-time, active days, most/least used
features, workspace overview). A backup unlock: any license key starting
with `HELIX-FOUNDER-`.

Fleet numbers, honestly sourced (HELIX users' workspaces are private by
architecture, so no app server ever sees them):

- **Signups** → Netlify → your site → **Forms** → `helix-signups`. New users
  who leave the "count my signup" box ticked send name + email there, once.
  Turn on *Form notifications* to get an email for every signup.
- **Paying customers, revenue, churn, FOUNDING-code uptake** → Stripe
  Dashboard (Customers / Home). Stripe is the system of record.
- Note: the signup form is registered at deploy time — after this zip's
  first deploy, check Forms shows "helix-signups" as detected.

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
