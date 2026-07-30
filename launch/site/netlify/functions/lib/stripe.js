// Minimal Stripe REST reads (zero-dependency). Server-side only.
// We never write to Stripe here — Stripe is the source of truth we READ to
// decide entitlement. Every call is time-bounded so a slow upstream degrades.
const API = 'https://api.stripe.com/v1';

async function get(path, key, ms = 6000) {
  const r = await fetch(API + path, {
    headers: { authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(ms),
  });
  if (!r.ok) throw new Error(`stripe ${r.status}`);
  return r.json();
}

// Map a subscription's price to a HELIX tier. Amounts in cents.
export function tierForAmount(cents) {
  if (cents == null) return null;
  if (cents >= 7000) return 'agency';   // $79
  if (cents >= 1000) return 'pro';       // $19 founding / $24
  return null;
}

function tierFromSubscription(sub) {
  const amount = sub?.items?.data?.[0]?.price?.unit_amount;
  return tierForAmount(amount);
}

// Preferred, secure path: a checkout session_id (a secret only the buyer holds).
export async function tierFromSession(sessionId, key) {
  const s = await get(`/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=subscription.items.data.price`, key);
  if (s.payment_status !== 'paid' && s.status !== 'complete') return null;
  const email = (s.customer_details?.email || s.customer_email || '').toLowerCase();
  const tier = tierFromSubscription(s.subscription) || tierForAmount(s.amount_total);
  return tier ? { email, tier } : null;
}

// Convenience path: an email with a CURRENTLY-ACTIVE subscription.
export async function tierFromEmail(email, key) {
  const custs = await get(`/customers?email=${encodeURIComponent(String(email).toLowerCase())}&limit=10`, key);
  for (const c of custs.data || []) {
    const subs = await get(`/subscriptions?customer=${c.id}&status=active&limit=1&expand[]=data.items.data.price`, key);
    const sub = subs.data?.[0];
    const tier = sub && tierFromSubscription(sub);
    if (tier) return { email: String(email).toLowerCase(), tier };
  }
  return null;
}
