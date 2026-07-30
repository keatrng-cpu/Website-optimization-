// Serverless revenue-engine functions, tested in isolation with mocked
// Stripe + Anthropic. Proves the security gates and graceful degradation
// without a live deploy. Run: node --test test/functions.test.js
import test from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';

const FN = '../launch/site/netlify/functions';
const { privateKey } = crypto.generateKeyPairSync('ed25519');
const PRIV = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
const req = (body, method = 'POST') => new Request('http://x/', {
  method, headers: { 'content-type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
});
const realFetch = globalThis.fetch;

test('redeem-license: graceful + Stripe-gated minting', async () => {
  const { default: redeem } = await import(`${FN}/redeem-license.js`);
  const L = await import(`${FN}/lib/license.js`);
  try {
    delete process.env.HELIX_LICENSE_KEY; delete process.env.STRIPE_SECRET_KEY;
    let d = await (await redeem(req({ email: 'a@b.com' }))).json();
    assert.equal(d.ok, false, 'no config → graceful false, not a throw');

    process.env.HELIX_LICENSE_KEY = PRIV; process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    globalThis.fetch = async (url) => {
      if (url.includes('/customers?email=')) return new Response(JSON.stringify({ data: [{ id: 'cus_1' }] }), { status: 200 });
      if (url.includes('/subscriptions?customer=')) return new Response(JSON.stringify({ data: [{ items: { data: [{ price: { unit_amount: 2400 } }] } }] }), { status: 200 });
      return new Response('{}', { status: 404 });
    };
    d = await (await redeem(req({ email: 'Payer@Example.com' }))).json();
    assert.equal(d.ok, true); assert.equal(d.tier, 'pro');
    assert.equal(L.verifyWithPrivateEnv(d.license, PRIV).sub, 'payer@example.com', 'minted license verifies');

    globalThis.fetch = async (url) => url.includes('/customers') ? new Response(JSON.stringify({ data: [] }), { status: 200 }) : new Response('{}', { status: 200 });
    d = await (await redeem(req({ email: 'nobody@x.com' }))).json();
    assert.equal(d.ok, false); assert.ok(!d.license, 'no active sub → no license minted');

    globalThis.fetch = async () => { throw new Error('network'); };
    assert.equal((await (await redeem(req({ email: 'a@b.com' }))).json()).ok, false, 'upstream error → graceful');
  } finally { globalThis.fetch = realFetch; }
});

test('ai proxy: license gate protects the Anthropic budget', async () => {
  const { default: ai } = await import(`${FN}/ai.js`);
  const L = await import(`${FN}/lib/license.js`);
  try {
    process.env.HELIX_LICENSE_KEY = PRIV; process.env.ANTHROPIC_API_KEY = 'sk-ant-x';

    let called = false;
    globalThis.fetch = async () => { called = true; return new Response('{}', { status: 200 }); };
    let d = await (await ai(req({ messages: [{ role: 'user', content: 'hi' }] }))).json();
    assert.equal(d.ok, false); assert.equal(called, false, 'no license → zero Anthropic spend');

    const { privateKey: other } = crypto.generateKeyPairSync('ed25519');
    const forged = L.mintLicense(other.export({ type: 'pkcs8', format: 'der' }).toString('base64'), { email: 'x', tier: 'pro' });
    called = false;
    d = await (await ai(req({ license: forged, messages: [{ role: 'user', content: 'hi' }] }))).json();
    assert.equal(d.ok, false); assert.equal(called, false, 'forged license → refused, zero spend');

    const lic = L.mintLicense(PRIV, { email: 'p@x.com', tier: 'pro' });
    let sent = null;
    globalThis.fetch = async (url, opts) => {
      if (url.includes('/v1/models')) return new Response(JSON.stringify({ data: [{ id: 'claude-sonnet-4-5' }, { id: 'claude-opus-4-1' }] }), { status: 200 });
      if (url.includes('/v1/messages')) { sent = JSON.parse(opts.body); return new Response(JSON.stringify({ content: [{ type: 'text', text: 'A plan.' }], usage: { input_tokens: 10, output_tokens: 20 } }), { status: 200 }); }
      return new Response('{}', { status: 404 });
    };
    d = await (await ai(req({ license: lic, system: 'Be helpful', messages: [{ role: 'user', content: 'plan my week' }] }))).json();
    assert.equal(d.ok, true); assert.equal(d.text, 'A plan.');
    assert.equal(sent.model, 'claude-sonnet-4-5', 'auto-discovers newest sonnet');
    assert.equal(sent.max_tokens, 1024, 'token cap enforced');
    assert.match(sent.system, /GUARDRAILS/, 'guardrails injected server-side');

    globalThis.fetch = async (url) => url.includes('/v1/models') ? new Response('{}', { status: 500 }) : new Response('busy', { status: 529 });
    const r = await ai(req({ license: lic, messages: [{ role: 'user', content: 'x' }] }));
    assert.equal(r.status, 200); assert.equal((await r.json()).ok, false, 'Anthropic error → graceful');
  } finally { globalThis.fetch = realFetch; }
});
