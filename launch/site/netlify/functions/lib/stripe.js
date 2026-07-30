// Minimal Stripe REST reads (zero-dependency). Server-side only.
// Stripe is the source of truth we READ to decide entitlement — we never write.
// Every call is time-bounded so a slow upstream degrades instead of hanging.
const API = 'https://api.stripe.com/v1';

async function get(path, key, ms = 4500) {
  const r = await fetch(API + path, {
    headers: { authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(ms),
  });
  if (!r.ok) throw new Error(`stripe ${r.status}`);
  return r.json();
}

// Map an amount ACTUALLY PAID (cents) to a HELIX tier.
export function tierForAmount(cents) {
  if (cents == null) return null;
  if (cents >= 7000) return 'agency';   // $79
  if (cents >= 1000) return 'pro';       // $19 founding / $24
  return null;
}

// The ONLY redemption path: a checkout session_id — a secret only the buyer
// receives at the checkout redirect. Requires the session to be genuinely
// PAID and the subscription ACTIVE, and grades the tier by money that changed
// hands (amount_total), not the price object's list amount.
export async function tierFromSession(sessionId, key) {
  const s = await get(
    `/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=subscription`,
    key,
  );
  const paid = s.payment_status === 'paid';
  const subActive = !s.subscription || s.subscription.status === 'active';
  if (!paid || !subActive) return null;
  const email = (s.customer_details?.email || s.customer_email || '').toLowerCase();
  const tier = tierForAmount(s.amount_total);
  if (!tier) return null;
  // Bind the license to the paying subscription so it can be re-validated/revoked.
  const sub = typeof s.subscription === 'object' ? s.subscription.id : s.subscription;
  return { email, tier, sub: sub || null };
}
