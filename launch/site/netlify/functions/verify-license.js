// POST /.netlify/functions/verify-license  { license }
// Authoritative entitlement check WITHOUT spending any AI budget. The app can
// call this on load to confirm a stored license is still valid/current.
import { verifyWithPrivateEnv } from './lib/license.js';

const JSON_HEADERS = { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'POST, OPTIONS' };
const ok = (data) => new Response(JSON.stringify(data), { status: 200, headers: JSON_HEADERS });

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: JSON_HEADERS });
  if (req.method !== 'POST') return ok({ valid: false });
  const LICENSE_KEY = process.env.HELIX_LICENSE_KEY;
  if (!LICENSE_KEY) return ok({ valid: false, reason: 'not configured' });
  let body = {};
  try { body = await req.json(); } catch { /* empty */ }
  const payload = verifyWithPrivateEnv(String(body.license || ''), LICENSE_KEY);
  if (!payload) return ok({ valid: false });
  return ok({ valid: true, tier: payload.tier, email: payload.sub, exp: payload.exp });
};
