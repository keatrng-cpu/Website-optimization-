// HELIX license tokens — offline-verifiable, un-forgeable.
// A token is  base64url(payloadJSON) + "." + base64url(ed25519 signature).
// Only the holder of the private key (your Netlify env var) can MINT one;
// anyone with the public key can VERIFY one. The server verifies before
// spending any managed-AI budget, so Pro cannot be forged where it costs money.
//
// Zero dependencies — Node's built-in crypto only. ESM (repo is type:module).
import crypto from 'node:crypto';

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlToBuf(s) {
  return Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

// Accept the private key as PKCS8 DER base64 (what we generated) from env.
export function privateKeyFrom(b64) {
  return crypto.createPrivateKey({ key: b64urlToBuf(b64), format: 'der', type: 'pkcs8' });
}
export function publicKeyFromPrivate(priv) {
  return crypto.createPublicKey(priv);
}

// Mint a signed license. Short-lived by design: the client re-redeems against
// live Stripe status while the subscription is active, so cancellation/refund
// revokes access within `days`. `sub` binds it to the Stripe subscription;
// `jti` is a unique id for future deny-list revocation.
export function mintLicense(privateKeyB64, { email, tier, days = 3, sub = null }) {
  const priv = privateKeyFrom(privateKeyB64);
  const now = Math.floor(Date.now() / 1000);
  const jti = crypto.randomBytes(8).toString('hex');
  const payload = { email: String(email).toLowerCase(), tier, iat: now, exp: now + days * 86400, sub, jti, v: 2 };
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.sign(null, Buffer.from(body), priv);
  return body + '.' + b64url(sig);
}

// Verify a token against a public key. Returns the payload if valid & unexpired,
// else null. Never throws on malformed input.
export function verifyLicense(token, publicKey) {
  try {
    const [body, sig] = String(token).split('.');
    if (!body || !sig) return null;
    const ok = crypto.verify(null, Buffer.from(body), publicKey, b64urlToBuf(sig));
    if (!ok) return null;
    const payload = JSON.parse(b64urlToBuf(body).toString('utf8'));
    if (!payload || typeof payload !== 'object') return null;
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) return null;
    if (!['pro', 'agency'].includes(payload.tier)) return null;
    return payload;
  } catch { return null; }
}

// Convenience: verify using the private key from env (derives the public key).
export function verifyWithPrivateEnv(token, privateKeyB64) {
  try { return verifyLicense(token, publicKeyFromPrivate(privateKeyFrom(privateKeyB64))); }
  catch { return null; }
}
