// POST /.netlify/functions/redeem-license
// Body: { session_id } (preferred, from the checkout redirect) OR { email }.
// Confirms a real paid subscription via Stripe, then mints a signed HELIX
// license bound to that email + tier. This is a minting ORACLE gated by
// Stripe — it can only issue a license for someone who actually paid.
//
// Graceful degradation: any missing config or upstream hiccup returns 200 with
// { ok:false, reason } so the app shows a friendly message, never a crash.
import { mintLicense } from './lib/license.js';
import { tierFromSession, tierFromEmail } from './lib/stripe.js';

const JSON_HEADERS = { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'POST, OPTIONS' };
const ok = (data) => new Response(JSON.stringify(data), { status: 200, headers: JSON_HEADERS });

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: JSON_HEADERS });
  if (req.method !== 'POST') return ok({ ok: false, reason: 'POST only' });

  const LICENSE_KEY = process.env.HELIX_LICENSE_KEY;
  const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
  if (!LICENSE_KEY || !STRIPE_KEY) {
    return ok({ ok: false, reason: 'Managed Pro is not configured on this deployment yet.' });
  }

  let body = {};
  try { body = await req.json(); } catch { /* empty */ }
  const sessionId = typeof body.session_id === 'string' ? body.session_id.slice(0, 200) : '';
  const email = typeof body.email === 'string' ? body.email.slice(0, 200).trim() : '';
  if (!sessionId && !email) return ok({ ok: false, reason: 'Provide your checkout link or the email you paid with.' });

  try {
    // session_id is a secret only the buyer holds — prefer it.
    const found = sessionId ? await tierFromSession(sessionId, STRIPE_KEY)
                            : await tierFromEmail(email, STRIPE_KEY);
    if (!found || !found.tier) {
      return ok({ ok: false, reason: 'No active HELIX subscription found for that. If you just paid, give it a minute and retry.' });
    }
    const license = mintLicense(LICENSE_KEY, { email: found.email || email, tier: found.tier });
    return ok({ ok: true, license, tier: found.tier, email: found.email || email });
  } catch (e) {
    // Never leak internals; never hard-fail.
    return ok({ ok: false, reason: 'Could not verify with Stripe right now — please retry shortly.' });
  }
};
