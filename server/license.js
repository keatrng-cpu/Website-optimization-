// Local license verification for the installed server. Verifies the Ed25519
// signature with the PUBLIC key (safe to embed — only the private key, held in
// the Netlify function env, can MINT). Entitlement is DERIVED from the verified
// token, never taken from a client-asserted object.
import crypto from 'node:crypto';

// Public half of the HELIX license signing keypair (SPKI DER, base64).
// Overridable via env for tests (which use a throwaway keypair).
const DEFAULT_PUBLIC_B64 = 'MCowBQYDK2VwAyEAeYwEpP0P0fR7p5I8/YlPJWbjwGxu0QBtCgzP6CaDde8=';

let _cachedB64 = null;
let _cachedKey = null;
function publicKey() {
  const b64 = process.env.HELIX_LICENSE_PUBLIC || DEFAULT_PUBLIC_B64;
  if (b64 !== _cachedB64) {
    _cachedB64 = b64;
    _cachedKey = crypto.createPublicKey({ key: Buffer.from(b64, 'base64'), format: 'der', type: 'spki' });
  }
  return _cachedKey;
}

function b64urlToBuf(s) {
  return Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

// Returns { tier, exp } for a valid, unexpired, signed token; else null.
export function entitlementFromToken(token) {
  try {
    const [body, sig] = String(token || '').split('.');
    if (!body || !sig) return null;
    if (!crypto.verify(null, Buffer.from(body), publicKey(), b64urlToBuf(sig))) return null;
    const p = JSON.parse(b64urlToBuf(body).toString('utf8'));
    if (!p || !['pro', 'agency'].includes(p.tier)) return null;
    if (p.exp && Math.floor(Date.now() / 1000) > p.exp) return null;
    return { tier: p.tier, exp: p.exp || null };
  } catch { return null; }
}
