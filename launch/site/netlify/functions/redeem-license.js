// POST /.netlify/functions/redeem-license   { session_id }
// The session_id is a secret only the buyer receives at the checkout redirect.
// We confirm it is genuinely PAID with an ACTIVE subscription, then mint a
// short-lived, signed HELIX license bound to that email + tier + subscription.
// There is deliberately NO email-based path: an email is not a secret, so
// minting from it alone would let anyone spend the operator's AI budget.
//
// Graceful degradation: missing config / bad input / upstream hiccup / timeout
// all return 200 with { ok:false, reason } — never a crash or a 5xx.
import { mintLicense } from './lib/license.js';
import { tierFromSession } from './lib/stripe.js';

const JSON_HEADERS = { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'POST, OPTIONS' };
const ok = (data) => new Response(JSON.stringify(data), { status: 200, headers: JSON_HEADERS });
const HANDLER_BUDGET_MS = 8000;
const TOKEN_DAYS = 3; // short life → cancellation/refund revokes within days (client re-redeems while active)

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: JSON_HEADERS });
  if (req.method !== 'POST') return ok({ ok: false, reason: 'POST only' });

  const LICENSE_KEY = process.env.HELIX_LICENSE_KEY;
  const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
  if (!LICENSE_KEY || !STRIPE_KEY) {
    return ok({ ok: false, reason: 'Managed Pro is not configured on this deployment yet.' });
  }

  let body = {};
  try { body = await req.json(); } catch { /* empty body */ }
  const raw = typeof body.session_id === 'string' ? body.session_id.trim().slice(0, 120) : '';
  // Accept only a Stripe checkout-session id shape; reject anything else early.
  const sessionId = /^cs_[A-Za-z0-9_]+$/.test(raw) ? raw : '';
  if (!sessionId) return ok({ ok: false, reason: 'Open HELIX from your checkout confirmation to activate — we need the secure link, not just an email.' });

  // Hard time budget: never let a slow Stripe call blow the function timeout.
  const budget = new Promise((resolve) => setTimeout(() => resolve('__timeout__'), HANDLER_BUDGET_MS));
  try {
    const found = await Promise.race([tierFromSession(sessionId, STRIPE_KEY), budget]);
    if (found === '__timeout__') return ok({ ok: false, reason: 'Could not verify right now — please retry shortly.' });
    if (!found || !found.tier) {
      return ok({ ok: false, reason: 'No active paid HELIX subscription on that checkout. If you just paid, give it a minute and retry.' });
    }
    const license = mintLicense(LICENSE_KEY, { email: found.email, tier: found.tier, sub: found.sub, days: TOKEN_DAYS });
    return ok({ ok: true, license, tier: found.tier });
  } catch {
    return ok({ ok: false, reason: 'Could not verify with Stripe right now — please retry shortly.' });
  }
};
