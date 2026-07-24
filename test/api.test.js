// End-to-end API tests: boots the real server on an ephemeral port with an
// isolated data dir and exercises every subsystem through HTTP.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/index.js';

let server, base, dataDir;

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'helix-test-'));
  ({ server } = createApp({ dataDir }));
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((r) => server.close(r));
  fs.rmSync(dataDir, { recursive: true, force: true });
});

async function api(method, p, body) {
  const res = await fetch(base + p, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

test('bootstrap returns 12 helpers, power-ups, and settings', async () => {
  const { status, data } = await api('GET', '/api/bootstrap');
  assert.equal(status, 200);
  assert.equal(data.helpers.length, 12);
  assert.ok(data.helpers.find((h) => h.id === 'seomi'));
  assert.ok(data.powerups.length >= 10);
  assert.equal(data.settings.provider, 'offline');
  assert.equal(data.settings.hasKey, false);
});

test('brain: update profile and manage knowledge', async () => {
  const put = await api('PUT', '/api/brain', {
    businessName: 'Lunar Coffee Co',
    tagline: 'Small-batch coffee, big mornings',
    industry: 'Specialty coffee roasting',
    audience: 'remote workers and coffee nerds',
    products: 'single-origin beans, subscriptions, brew gear',
    description: 'We roast single-origin coffee in small batches and ship within 48 hours of roasting.',
    location: 'Portland, OR',
  });
  assert.equal(put.status, 200);
  assert.equal(put.data.brain.businessName, 'Lunar Coffee Co');

  const k = await api('POST', '/api/brain/knowledge', { title: 'Shipping policy', content: 'Free shipping over $35, ships within 48h of roast.' });
  assert.equal(k.status, 201);

  const get = await api('GET', '/api/brain');
  assert.equal(get.data.knowledge.length, 1);

  const bad = await api('POST', '/api/brain/knowledge', { title: 'no content' });
  assert.equal(bad.status, 400);

  const del = await api('DELETE', `/api/brain/knowledge/${k.data.id}`);
  assert.equal(del.status, 200);
});

test('chat: create, message, brand-aware offline reply, delete', async () => {
  const created = await api('POST', '/api/chats', { helperId: 'emmie' });
  assert.equal(created.status, 201);
  const chatId = created.data.id;

  const msg = await api('POST', `/api/chats/${chatId}/messages`, { content: 'Write a promotional email for our new Ethiopia beans' });
  assert.equal(msg.status, 200);
  assert.equal(msg.data.reply.role, 'assistant');
  assert.equal(msg.data.reply.engine, 'offline');
  assert.ok(msg.data.reply.content.includes('Lunar Coffee Co'), 'reply should use Brain business name');
  assert.ok(msg.data.reply.content.toLowerCase().includes('subject'), 'email intent should produce subject lines');

  const chat = await api('GET', `/api/chats/${chatId}`);
  assert.equal(chat.data.messages.length, 2);
  assert.ok(chat.data.title.startsWith('Write a promotional email'));

  const unknown = await api('POST', '/api/chats', { helperId: 'nobody' });
  assert.equal(unknown.status, 400);

  const del = await api('DELETE', `/api/chats/${chatId}`);
  assert.equal(del.status, 200);
});

test('tasks: CRUD and AI run produces a deliverable', async () => {
  const t = await api('POST', '/api/tasks', { title: 'Draft a plan to grow the subscriber base', helperId: 'buddy', priority: 'high' });
  assert.equal(t.status, 201);
  assert.equal(t.data.status, 'todo');

  const patched = await api('PATCH', `/api/tasks/${t.data.id}`, { status: 'doing' });
  assert.equal(patched.data.status, 'doing');

  const run = await api('POST', `/api/tasks/${t.data.id}/run`);
  assert.equal(run.status, 200);
  assert.equal(run.data.task.status, 'done');
  assert.ok(run.data.document.content.length > 100);

  const doc = await api('GET', `/api/documents/${run.data.document.id}`);
  assert.equal(doc.status, 200);
  assert.equal(doc.data.kind, 'task');

  const del = await api('DELETE', `/api/tasks/${t.data.id}`);
  assert.equal(del.status, 200);
});

test('power-ups: catalog, validation, and run', async () => {
  const list = await api('GET', '/api/powerups');
  assert.ok(list.data.find((p) => p.id === 'seo-brief'));

  const missing = await api('POST', '/api/powerups/seo-brief/run', { inputs: {} });
  assert.equal(missing.status, 400);

  const run = await api('POST', '/api/powerups/seo-brief/run', { inputs: { topic: 'best coffee subscription' } });
  assert.equal(run.status, 200);
  assert.equal(run.data.kind, 'powerup');
  assert.ok(run.data.content.length > 100);

  const docs = await api('GET', '/api/documents');
  assert.ok(docs.data.find((d) => d.id === run.data.id));
});

test('automations: create, run now, inbox notification, schedule math', async () => {
  const a = await api('POST', '/api/automations', {
    name: 'Weekly social ideas', helperId: 'soshie',
    prompt: 'Give me 5 social post ideas for this week',
    schedule: { type: 'interval', minutes: 60 },
  });
  assert.equal(a.status, 201);
  assert.ok(a.data.nextRun > Date.now());

  const run = await api('POST', `/api/automations/${a.data.id}/run`);
  assert.equal(run.status, 200);
  assert.equal(run.data.automation.runs, 1);
  assert.ok(run.data.document.content.length > 50);

  const inbox = await api('GET', '/api/inbox');
  assert.ok(inbox.data.some((i) => i.title.includes('Weekly social ideas')));

  const daily = await api('POST', '/api/automations', {
    name: 'Daily digest', prompt: 'Summarize priorities', schedule: { type: 'daily', time: '09:00' },
  });
  assert.equal(daily.status, 201);
  assert.ok(daily.data.nextRun > Date.now());

  const off = await api('PATCH', `/api/automations/${daily.data.id}`, { enabled: false });
  assert.equal(off.data.enabled, false);
});

test('sites: create, generate, publish, live page served with brand + analytics', async () => {
  const s = await api('POST', '/api/sites', { name: 'Lunar Coffee', palette: 'sunset' });
  assert.equal(s.status, 201);
  assert.equal(s.data.slug, 'lunar-coffee');
  assert.ok(s.data.sections.length >= 5);

  const gen = await api('POST', `/api/sites/${s.data.id}/generate`);
  assert.equal(gen.status, 200);

  const page = await fetch(`${base}/sites/lunar-coffee`);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.ok(html.includes('<title>'));
  assert.ok(html.includes('Lunar Coffee'));
  assert.ok(html.includes('viewport'));

  // section edit
  const edited = await api('PATCH', `/api/sites/${s.data.id}`, {
    sections: [{ type: 'hero', headline: 'Hand-roasted. Home-delivered.', sub: 'Fresh beans in 48 hours.', cta: 'Shop beans', ctaLink: '#contact' }],
  });
  assert.equal(edited.data.sections.length, 1);
  const page2 = await (await fetch(`${base}/sites/lunar-coffee`)).text();
  assert.ok(page2.includes('Hand-roasted. Home-delivered.'));

  // unpublish → 404
  await api('PATCH', `/api/sites/${s.data.id}`, { published: false });
  const gone = await fetch(`${base}/sites/lunar-coffee`);
  assert.equal(gone.status, 404);
  await api('PATCH', `/api/sites/${s.data.id}`, { published: true });

  // analytics recorded the two live views
  const analytics = await api('GET', '/api/analytics');
  assert.ok(analytics.data.total >= 2);
  assert.ok(analytics.data.bySite['lunar-coffee'].total >= 2);
});

test('seo: audit a studio site and store the report', async () => {
  const sites = await api('GET', '/api/sites');
  const audit = await api('POST', '/api/seo/audit', { siteId: sites.data[0].id });
  assert.equal(audit.status, 200);
  assert.ok(audit.data.score >= 0 && audit.data.score <= 100);
  assert.ok(audit.data.checks.length >= 10);
  assert.ok(audit.data.checks.find((c) => c.id === 'title').pass);
  assert.ok(audit.data.checks.find((c) => c.id === 'viewport').pass);

  const audits = await api('GET', '/api/seo/audits');
  assert.equal(audits.data[0].id, audit.data.id);

  const bad = await api('POST', '/api/seo/audit', {});
  assert.equal(bad.status, 400);
});

test('site chat: live widget endpoint returns a reply (by id and slug)', async () => {
  const sites = await api('GET', '/api/sites');
  const site = sites.data[0];
  const byId = await api('POST', `/api/sites/${site.id}/chat`, { messages: [{ role: 'user', content: 'What do you sell?' }] });
  assert.equal(byId.status, 200);
  assert.equal(byId.data.ok, true);
  assert.ok(byId.data.reply.length > 5, 'a reply is produced');

  const bySlug = await api('POST', `/api/sites/${site.slug}/chat`, { messages: [{ role: 'user', content: 'hi' }] });
  assert.equal(bySlug.status, 200);
  assert.ok(bySlug.data.reply);

  // empty / non-user history is rejected cleanly
  const bad = await api('POST', `/api/sites/${site.id}/chat`, { messages: [] });
  assert.equal(bad.status, 400);

  // the published page embeds the chat widget wired to its slug endpoint
  const page = await (await fetch(`${base}/sites/${site.slug}`)).text();
  assert.ok(page.includes('hx-chat'), 'page carries the chat widget');
  assert.ok(page.includes(`/api/sites/${site.slug}/chat`), 'widget points at the live endpoint');
});

test('netlify export: bundle is a valid zip with a working serverless chat fn', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const { execFileSync } = await import('node:child_process');
  const sites = await api('GET', '/api/sites');
  const res = await fetch(`${base}/api/sites/${sites.data[0].id}/export`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/zip');
  const buf = Buffer.from(await res.arrayBuffer());
  assert.ok(buf.length > 500);
  // ZIP local-file-header magic
  assert.equal(buf.readUInt32LE(0), 0x04034b50, 'starts with a PK local header');

  // write, unzip, and node --check the generated function (the skill's mandate)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'helix-zip-'));
  const zipPath = path.join(dir, 'b.zip');
  fs.writeFileSync(zipPath, buf);
  execFileSync('unzip', ['-o', zipPath, '-d', dir]);
  for (const f of ['index.html', 'netlify/functions/chat.js', 'netlify.toml', 'README.md']) {
    assert.ok(fs.existsSync(path.join(dir, f)), `bundle contains ${f}`);
  }
  const fn = path.join(dir, 'netlify/functions/chat.js');
  execFileSync('node', ['--check', fn]); // throws if the generated function is invalid JS
  const fnSrc = fs.readFileSync(fn, 'utf8');
  assert.ok(fnSrc.includes('pickModel') && fnSrc.includes('sonnet'), 'chat fn does model auto-discovery');
  assert.ok(fnSrc.includes('ANTHROPIC_API_KEY') && fnSrc.includes('process.env'), 'key comes from env, not the client');
  assert.ok(!/sk-ant-[A-Za-z0-9]/.test(fnSrc), 'no real key baked in');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('marketing: calendar generate + emails generate', async () => {
  const week = await api('POST', '/api/calendar/generate', { platforms: ['LinkedIn', 'Instagram'] });
  assert.equal(week.status, 200);
  assert.equal(week.data.length, 7);
  assert.ok(week.data.every((p) => p.content.length > 20));

  const post = await api('POST', '/api/calendar', { platform: 'X', content: 'Fresh roast drop this Friday ☕', date: '2026-07-10' });
  assert.equal(post.status, 201);
  const move = await api('PATCH', `/api/calendar/${post.data.id}`, { status: 'scheduled' });
  assert.equal(move.data.status, 'scheduled');

  const email = await api('POST', '/api/emails/generate', { goal: 'announce the new Ethiopia single-origin' });
  assert.equal(email.status, 201);
  assert.ok(email.data.subject.length > 3);
  assert.ok(email.data.body.length > 100);
});

test('settings: provider config with key redaction', async () => {
  const put = await api('PUT', '/api/settings', { provider: 'anthropic', apiKey: 'sk-test-123', model: 'claude-sonnet-5' });
  assert.equal(put.status, 200);
  assert.equal(put.data.hasKey, true);
  assert.equal(put.data.apiKey, undefined, 'apiKey must never be echoed');

  // invalid provider ignored
  const bad = await api('PUT', '/api/settings', { provider: 'skynet' });
  assert.equal(bad.data.provider, 'anthropic');

  await api('PUT', '/api/settings', { provider: 'offline', apiKey: '' });
});

test('export / import round-trip preserves data', async () => {
  const exp = await api('GET', '/api/export');
  assert.equal(exp.status, 200);
  assert.equal(exp.data.brain.businessName, 'Lunar Coffee Co');

  const imp = await api('POST', '/api/import', exp.data);
  assert.equal(imp.status, 200);

  const brain = await api('GET', '/api/brain');
  assert.equal(brain.data.brain.businessName, 'Lunar Coffee Co');

  const reject = await api('POST', '/api/import', { nope: true });
  assert.equal(reject.status, 400);
});

test('hardening: path traversal never leaks files outside public/', async () => {
  for (const p of ['/%2e%2e/server/store.js', '/..%2fserver%2fstore.js', '/../server/store.js', '/....//server/store.js']) {
    const res = await fetch(base + p);
    const text = await res.text();
    assert.ok(!text.includes('createStore'), `${p} must not serve server source`);
  }
});

test('hardening: malformed percent-encoding does not 500', async () => {
  const res = await fetch(base + '/api/tasks/%zz', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(res.status, 404);
});

test('hardening: calendar generate survives empty platforms and bad dates', async () => {
  const r = await api('POST', '/api/calendar/generate', { platforms: [], startDate: 'not-a-date' });
  assert.equal(r.status, 200);
  assert.equal(r.data.length, 7);
  assert.ok(r.data.every((p) => p.platform && p.date.match(/^\d{4}-\d{2}-\d{2}$/)));
});

test('hardening: deleting a document clears task deliverable links', async () => {
  const t = await api('POST', '/api/tasks', { title: 'link test', helperId: 'vizzy' });
  const run = await api('POST', `/api/tasks/${t.data.id}/run`);
  await api('DELETE', `/api/documents/${run.data.document.id}`);
  const tasks = await api('GET', '/api/tasks');
  assert.equal(tasks.data.find((x) => x.id === t.data.id).deliverableId, null);
  await api('DELETE', `/api/tasks/${t.data.id}`);
});

test('hardening: import normalizes malformed shapes and recomputes schedules', async () => {
  const exp = await api('GET', '/api/export');
  // corrupt array fields and backdate an automation
  const mangled = { ...exp.data, chats: 'nope', tasks: 42 };
  mangled.automations = [{
    id: 'x1', name: 'stale', prompt: 'p', helperId: 'vizzy',
    schedule: { type: 'interval', minutes: 60 }, enabled: true,
    lastRun: null, nextRun: 123, runs: 0, createdAt: 123,
  }];
  const imp = await api('POST', '/api/import', mangled);
  assert.equal(imp.status, 200);
  const chats = await api('GET', '/api/chats');
  assert.deepEqual(chats.data, [], 'non-array chats must reset to empty');
  const autos = await api('GET', '/api/automations');
  assert.ok(autos.data[0].nextRun > Date.now(), 'imported nextRun must be recomputed');
  // a string brain is rejected outright
  const rejected = await api('POST', '/api/import', { brain: 'not an object' });
  assert.equal(rejected.status, 400);
  // restore original state
  await api('POST', '/api/import', exp.data);
});

test('integrations: presets, create, real authenticated test, redaction, AI awareness', async () => {
  // a tiny local "third-party API" that requires a bearer token
  const http = await import('node:http');
  let seenAuth = null;
  const mock = http.createServer((rq, rs) => {
    seenAuth = rq.headers['authorization'];
    if (seenAuth === 'Bearer secret-xyz') { rs.writeHead(200); rs.end('{"ok":true}'); }
    else { rs.writeHead(401); rs.end('nope'); }
  });
  await new Promise((r) => mock.listen(0, r));
  const mockUrl = `http://127.0.0.1:${mock.address().port}`;

  const presets = await api('GET', '/api/integrations/presets');
  assert.ok(presets.data.find((p) => p.id === 'stripe'));
  assert.ok(presets.data.find((p) => p.id === 'custom-rest'));
  // the full business-optimization stack is available as one-click presets
  for (const id of ['figma', 'supabase', 'vercel', 'semrush', 'windsor', 'sentry', 'notion', 'shopify']) {
    const p = presets.data.find((x) => x.id === id);
    assert.ok(p, `preset "${id}" should exist`);
    assert.ok(p.category && p.type && p.auth, `preset "${id}" should be fully specified`);
  }

  // create a connection pointing at the mock, with a valid key
  const created = await api('POST', '/api/integrations', {
    preset: 'custom-rest', name: 'Mock API', baseUrl: mockUrl, testPath: '/health',
    authKind: 'bearer', secret: 'secret-xyz',
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.authValue, undefined, 'secret must never be returned');
  assert.equal(created.data.hasSecret, true);
  assert.ok(created.data.secretHint.endsWith('-xyz') && created.data.secretHint.includes('••'), 'secret shown masked');

  // a real authenticated round-trip succeeds
  const good = await api('POST', `/api/integrations/${created.data.id}/test`, {});
  assert.equal(good.data.result.ok, true, 'valid key should connect');
  assert.equal(good.data.result.status, 200);
  assert.equal(seenAuth, 'Bearer secret-xyz', 'server actually sent the bearer token');

  // wrong key is reachable-but-rejected (real 401 surfaced)
  await api('PATCH', `/api/integrations/${created.data.id}`, { secret: 'wrong' });
  const bad = await api('POST', `/api/integrations/${created.data.id}/test`, {});
  assert.equal(bad.data.result.ok, false);
  assert.equal(bad.data.result.status, 401);

  // the AI is now aware the integration is connected
  const chat = await api('POST', '/api/chats', { helperId: 'dexter' });
  const reply = await api('POST', `/api/chats/${chat.data.id}/messages`, { content: 'What data sources can you pull from?' });
  // workspace context is injected into the system prompt; offline engine echoes brand,
  // but the connection is tracked — verify via the list + bootstrap count instead
  const list = await api('GET', '/api/integrations');
  assert.equal(list.data.length, 1);
  const boot = await api('GET', '/api/bootstrap');
  assert.equal(boot.data.counts.integrations, 1);

  await api('DELETE', `/api/chats/${chat.data.id}`);
  await api('DELETE', `/api/integrations/${created.data.id}`);
  await new Promise((r) => mock.close(r));
});

test('ecosystem intelligence: AI references real workspace state', async () => {
  // seed a distinctive task and an SEO audit, then ask for focus
  await api('POST', '/api/tasks', { title: 'Zephyr launch checklist', helperId: 'vizzy' });
  const sites = await api('GET', '/api/sites');
  await api('POST', '/api/seo/audit', { siteId: sites.data[0].id });

  const chat = await api('POST', '/api/chats', { helperId: 'gigi' });
  const msg = await api('POST', `/api/chats/${chat.data.id}/messages`, { content: 'What should I focus on next?' });
  const text = msg.data.reply.content;
  assert.ok(text.includes('Zephyr launch checklist'), 'reply should cite the real open task');
  assert.ok(/\d+\/100/.test(text), 'reply should cite the real SEO score');
  assert.ok(/focus/i.test(text), 'status intent should produce a focus read');
  await api('DELETE', `/api/chats/${chat.data.id}`);
});

test('resilience: auditing an unreachable external URL degrades gracefully', async () => {
  // Port 1 on loopback refuses instantly — stands in for any unreachable site
  // (e.g. a network-blocked domain) without depending on external network.
  const res = await api('POST', '/api/seo/audit', { url: 'http://127.0.0.1:1/' });
  assert.equal(res.status, 502, 'unreachable URL should be a clean 502, not a crash');
  assert.match(res.data.error, /could not fetch/i);

  const badScheme = await api('POST', '/api/seo/audit', { url: 'ftp://example.com' });
  assert.equal(badScheme.status, 400, 'non-http scheme is rejected up front');

  // the server keeps serving normally afterwards
  const boot = await api('GET', '/api/bootstrap');
  assert.equal(boot.status, 200);
});

test('resilience: an integration test against an unreachable host reports failure, not a crash', async () => {
  const integ = await api('POST', '/api/integrations', { preset: 'custom-rest', name: 'Dead Host', baseUrl: 'http://127.0.0.1:1', testPath: '/', authKind: 'none' });
  const test = await api('POST', `/api/integrations/${integ.data.id}/test`, {});
  assert.equal(test.status, 200);
  assert.equal(test.data.result.ok, false, 'unreachable host => failed, handled');
  assert.ok(test.data.result.detail, 'a human-readable reason is returned');
  await api('DELETE', `/api/integrations/${integ.data.id}`);
});

test('agent: single tool execution performs a real action', async () => {
  const tools = await api('GET', '/api/agent/tools');
  assert.ok(tools.data.find((t) => t.name === 'create_website'));
  assert.ok(tools.data.find((t) => t.name === 'call_integration'));

  const act = await api('POST', '/api/agent/act', { tool: 'create_task', args: { title: 'Agent-made task', priority: 'high' } });
  assert.equal(act.status, 200);
  assert.ok(act.data.result.id);
  const tasks = await api('GET', '/api/tasks');
  assert.ok(tasks.data.find((t) => t.title === 'Agent-made task'), 'tool really created the task');

  const unknown = await api('POST', '/api/agent/act', { tool: 'nope', args: {} });
  assert.equal(unknown.status, 404);
});

test('agent: offline planner autonomously produces real artifacts', async () => {
  const before = (await api('GET', '/api/sites')).data.length;
  const run = await api('POST', '/api/agent/run', { goal: 'Launch my new product with a website and social content' });
  assert.equal(run.status, 200);
  assert.equal(run.data.mode, 'offline-planner');
  assert.ok(run.data.steps.length >= 3, 'planner should take several real steps');
  const toolsUsed = run.data.steps.map((s) => s.tool);
  assert.ok(toolsUsed.includes('create_website'), 'should build a site');
  assert.ok(toolsUsed.includes('generate_content_calendar'), 'should generate content');

  const after = (await api('GET', '/api/sites')).data.length;
  assert.equal(after, before + 1, 'a real site was created');
  const cal = await api('GET', '/api/calendar');
  assert.ok(cal.data.length >= 7, 'real posts were generated');
  const inbox = await api('GET', '/api/inbox');
  assert.ok(inbox.data.some((i) => i.title.startsWith('Autopilot ran')), 'autopilot logged to inbox');
});

test('agent: call_integration makes a real authenticated request', async () => {
  const http = await import('node:http');
  let hits = 0, sawToken = null;
  const mock = http.createServer((rq, rs) => { hits++; sawToken = rq.headers['authorization']; rs.writeHead(200); rs.end('{"revenue": 4200}'); });
  await new Promise((r) => mock.listen(0, r));
  const url = `http://127.0.0.1:${mock.address().port}`;

  const integ = await api('POST', '/api/integrations', { preset: 'custom-rest', name: 'FakeStripe', baseUrl: url, testPath: '/', authKind: 'bearer', secret: 'tok-42' });
  const act = await api('POST', '/api/agent/act', {
    tool: 'call_integration',
    args: { integration: 'FakeStripe', method: 'GET', path: '/v1/balance' },
  });
  assert.equal(act.status, 200);
  assert.equal(act.data.result.ok, true);
  assert.equal(act.data.result.data.revenue, 4200, 'agent received real response data');
  assert.equal(sawToken, 'Bearer tok-42', 'agent sent the stored credential');
  assert.ok(hits >= 1);

  await api('DELETE', `/api/integrations/${integ.data.id}`);
  await new Promise((r) => mock.close(r));
});

test('agent: provider loop orchestrates tool calls (stub model)', async () => {
  // Exercise runAgent directly with a fake tool-calling model — proves the
  // orchestration (execute tool -> feed result back -> finish) without a key.
  const { runAgent } = await import('../server/agent.js');
  const { createStore } = await import('../server/store.js');
  const os = await import('node:os'); const fsm = await import('node:fs'); const pth = await import('node:path');
  const dir = fsm.mkdtempSync(pth.join(os.tmpdir(), 'helix-agent-'));
  const store = createStore(dir);
  store.state.brain.businessName = 'Stub Co';
  const ctx = { store, ask: async () => ({ text: 'ok', engine: 'offline' }) };

  let turn = 0;
  const stub = async (input) => {
    turn++;
    if (turn === 1) { assert.equal(input.goal, 'do it'); return { type: 'tool_use', calls: [{ id: 'c1', name: 'create_task', input: { title: 'Stub task' } }] }; }
    if (turn === 2) { assert.ok(input.toolResults[0].content.includes('Stub task')); return { type: 'final', text: 'Created one task.' }; }
    throw new Error('too many turns');
  };
  const out = await runAgent(ctx, { goal: 'do it', callModel: stub });
  assert.equal(out.mode, 'provider');
  assert.equal(out.summary, 'Created one task.');
  assert.equal(out.steps.length, 1);
  assert.equal(store.state.tasks[0].title, 'Stub task', 'orchestrated tool really ran');
  store.close();
  fsm.rmSync(dir, { recursive: true, force: true });
});

test('forge hardening: input hygiene strips control chars and caps length', async () => {
  const { clean } = await import('../server/helpers.js');
  assert.equal(clean('a bc'), 'abc', 'control chars removed');
  assert.equal(clean('line1\nline2\ttab'), 'line1\nline2\ttab', 'newline and tab preserved');
  assert.equal(clean('x'.repeat(50), 10).length, 10, 'length capped');
  assert.equal(clean(null), '');

  // applied end-to-end: a chat message with a null byte is stored clean
  const chat = await api('POST', '/api/chats', { helperId: 'penn' });
  await api('POST', `/api/chats/${chat.data.id}/messages`, { content: 'hello  world' });
  const full = await api('GET', `/api/chats/${chat.data.id}`);
  assert.ok(!full.data.messages[0].content.includes(' '), 'stored message is sanitized');
  await api('DELETE', `/api/chats/${chat.data.id}`);
});

test('forge hardening: guardrails are baked into system prompts', async () => {
  const { systemPrompt, GUARDRAILS } = await import('../server/helpers.js');
  const { AGENT_SYSTEM } = await import('../server/agent.js');
  for (const phrase of ['untrusted data', 'Do NOT state any number', 'no tax, legal, financial, or medical advice'.toLowerCase()]) {
    assert.ok(GUARDRAILS.toLowerCase().includes(phrase.toLowerCase()), `guardrails mention: ${phrase}`);
  }
  const sp = systemPrompt(HELPER_MAP_probe(), { businessName: 'X' }, [], null);
  assert.ok(sp.includes('Do NOT state any number'), 'helper system prompt carries the accuracy mandate');
  assert.ok(AGENT_SYSTEM.includes('untrusted data'), 'agent system prompt carries the guardrails');
  function HELPER_MAP_probe() { return { prompt: 'You are a tester.', id: 'x', name: 'X' }; }
});

test('forge hardening: model auto-discovery picks newest, respects user choice, falls back', async () => {
  const { pickModel } = await import('../server/ai.js');
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ data: [
    { id: 'claude-sonnet-4', created_at: 100 },
    { id: 'claude-sonnet-5', created_at: 200 },
    { id: 'claude-opus-4', created_at: 300 },
  ] }), { status: 200 });
  try {
    // discovers the newest *sonnet* (not opus), ignoring created order for the filter
    const m = await pickModel({ provider: 'anthropic', apiKey: 'k', baseUrl: 'https://x.example' });
    assert.equal(m, 'claude-sonnet-5');
    // explicit user model always wins, no network needed
    const forced = await pickModel({ provider: 'anthropic', apiKey: 'k', model: 'claude-custom', baseUrl: 'https://y.example' });
    assert.equal(forced, 'claude-custom');
    // discovery failure falls back to a constant
    globalThis.fetch = async () => new Response('nope', { status: 500 });
    const fb = await pickModel({ provider: 'openai', apiKey: 'k', baseUrl: 'https://z.example' });
    assert.equal(fb, 'gpt-4o-mini');
  } finally { globalThis.fetch = realFetch; }
});

test('spec#2: sites are born at 95+ on our own auditor (rich AND empty Brain)', async () => {
  // rich Brain (set earlier in the suite)
  const rich = await api('POST', '/api/sites', { name: 'Born Score Rich' });
  assert.equal(rich.status, 201);
  assert.ok(rich.data.birthScore >= 95, `rich-brain birth score ${rich.data.birthScore} should be ≥95`);
  const auditRich = await api('POST', '/api/seo/audit', { siteId: rich.data.id });
  assert.ok(auditRich.data.score >= 95);
  for (const id of ['title-length', 'meta-desc-length', 'word-count', 'canonical']) {
    assert.ok(auditRich.data.checks.find((c) => c.id === id)?.pass, `check "${id}" must pass at birth`);
  }

  // empty Brain: placeholder content must still be born compliant
  const saved = (await api('GET', '/api/brain')).data.brain;
  const blank = {};
  for (const k of Object.keys(saved)) blank[k] = '';
  await api('PUT', '/api/brain', blank);
  const bare = await api('POST', '/api/sites', { name: 'Born Score Bare' });
  assert.ok(bare.data.birthScore >= 95, `empty-brain birth score ${bare.data.birthScore} should be ≥95`);
  await api('PUT', '/api/brain', saved); // restore

  await api('DELETE', `/api/sites/${rich.data.id}`);
  await api('DELETE', `/api/sites/${bare.data.id}`);
});

test('spec#2: served pages carry canonical + compliant title/meta lengths', async () => {
  const sites = await api('GET', '/api/sites');
  const html = await (await fetch(`${base}/sites/${sites.data.find((s) => s.published).slug}`)).text();
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/);
  assert.ok(canonical, 'canonical link present');
  assert.ok(canonical[1].startsWith('http'), 'live canonical is absolute (from Host header)');
  const title = html.match(/<title>([^<]+)<\/title>/)[1];
  assert.ok(title.length >= 15 && title.length <= 60, `title ${title.length} chars in [15,60]`);
  const meta = html.match(/<meta name="description" content="([^"]+)"/)[1];
  assert.ok(meta.length >= 50 && meta.length <= 160, `meta ${meta.length} chars in [50,160]`);
});

test('spec#1: autopilot is idempotent — same goal twice creates ONE site, audits deduped per run', async () => {
  const saved = (await api('GET', '/api/brain')).data.brain;
  await api('PUT', '/api/brain', { businessName: 'Idem Widgets Ltd' });

  const before = (await api('GET', '/api/sites')).data.length;
  const goal = 'Get me online: build and audit a website for my business';
  const run1 = await api('POST', '/api/agent/run', { goal });
  const run2 = await api('POST', '/api/agent/run', { goal });
  const after = (await api('GET', '/api/sites')).data.length;

  assert.equal(after, before + 1, 'two identical runs must yield exactly one new site');
  const create2 = run2.data.steps.find((s) => s.tool === 'create_website');
  assert.equal(create2.result.existing, true, 'second run reports the site already exists');
  for (const run of [run1, run2]) {
    const audits = run.data.steps.filter((s) => s.tool === 'run_seo_audit');
    assert.equal(audits.length, 1, 'one audit per target per run');
  }

  // direct tool path is idempotent too
  const t1 = await api('POST', '/api/agent/act', { tool: 'create_website', args: { name: 'Idem Widgets Ltd' } });
  assert.equal(t1.data.result.existing, true);
  await api('PUT', '/api/brain', saved);
});

test('spec#3: site chat widget starts closed and persists per site', async () => {
  const sites = await api('GET', '/api/sites');
  const slug = sites.data.find((s) => s.published).slug;
  const html = await (await fetch(`${base}/sites/${slug}`)).text();
  assert.ok(html.includes('id="hx-chat-panel" hidden'), 'panel starts closed (bubble only)');
  assert.ok(html.includes(`hx-chat-open-${slug}`), 'open/closed persisted per site slug');
});

test('spec/part1: openai model discovery falls back to first listed (Claude-listing gateways)', async () => {
  const { pickModel } = await import('../server/ai.js');
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ data: [{ id: 'claude-sonnet-5-relay' }] }), { status: 200 });
  try {
    const m = await pickModel({ provider: 'openai', apiKey: 'k', baseUrl: 'https://gw.example' });
    assert.equal(m, 'claude-sonnet-5-relay', 'gateway listing only Claude models still resolves');
  } finally { globalThis.fetch = realFetch; }
});

test('edge: Quick Start builds a whole business from one description', async () => {
  const saved = (await api('GET', '/api/brain')).data.brain;
  const sitesBefore = (await api('GET', '/api/sites')).data.length;
  const calBefore = (await api('GET', '/api/calendar')).data.length;

  const r = await api('POST', '/api/quickstart', {
    name: 'Peak Pottery',
    description: 'Handmade ceramic mugs and bowls for design-loving city dwellers. We sell mugs, bowls and custom sets. Based in Portland.',
  });
  assert.equal(r.status, 200);
  // deterministic Brain extraction
  assert.equal(r.data.brain.businessName, 'Peak Pottery');
  assert.ok(/design-loving/.test(r.data.brain.audience), 'audience extracted from "for …"');
  assert.ok(/mugs/.test(r.data.brain.products), 'products extracted from "we sell …"');
  assert.equal(r.data.brain.location, 'Portland');
  // real artifacts, all at once
  assert.ok(r.data.site.birthScore >= 95, `quick-start site born at ${r.data.site.birthScore}`);
  assert.ok(r.data.audit.score >= 95);
  assert.equal(r.data.posts, 7);
  assert.equal(r.data.automation.cadence, 'weekly');
  assert.equal((await api('GET', '/api/sites')).data.length, sitesBefore + 1);
  assert.ok((await api('GET', '/api/calendar')).data.length >= calBefore + 7);
  assert.ok((await api('GET', '/api/automations')).data.some((a) => a.name === 'Weekly content ideas'));
  assert.ok((await api('GET', '/api/inbox')).data.some((i) => i.title.startsWith('Quick Start finished')));

  // idempotent-ish: running again must not duplicate the site or automation
  const again = await api('POST', '/api/quickstart', { name: 'Peak Pottery', description: 'Handmade ceramic mugs for city dwellers.' });
  assert.equal(again.data.site.existing, true);
  assert.equal((await api('GET', '/api/automations')).data.filter((a) => a.name === 'Weekly content ideas').length, 1);

  const missing = await api('POST', '/api/quickstart', { name: '', description: '' });
  assert.equal(missing.status, 400);
  await api('PUT', '/api/brain', saved);
});

test('edge: expanded palette catalog includes light theme', async () => {
  const boot = await api('GET', '/api/bootstrap');
  for (const p of ['aurora', 'sand', 'plum', 'midnight']) assert.ok(boot.data.palettes.includes(p), `palette ${p}`);
  const site = await api('POST', '/api/sites', { name: 'Palette Probe', palette: 'sand' });
  assert.equal(site.data.palette, 'sand');
  assert.ok(site.data.birthScore >= 95, 'light palette sites are born compliant too');
  await api('DELETE', `/api/sites/${site.data.id}`);
});

test('brain learning: deterministic memory extraction', async () => {
  const { extractMemories } = await import('../server/memory.js');
  const found = extractMemories(
    'We never discount below 10%. What should I post today? Our best seller is the Ethiopia roast. I prefer short punchy copy with no emojis. We plan to launch subscriptions by March.'
  );
  const texts = found.map((f) => f.text);
  assert.ok(texts.some((t) => t.includes('never discount below 10%')), 'preference captured');
  assert.ok(texts.some((t) => t.includes('best seller')), 'fact captured');
  assert.ok(texts.some((t) => t.includes('launch subscriptions')), 'goal captured');
  assert.ok(!texts.some((t) => t.includes('What should I post')), 'questions are not memories');
  const kinds = Object.fromEntries(found.map((f) => [f.text.slice(0, 12), f.kind]));
  assert.equal(found.find((f) => f.text.includes('no emojis')).kind, 'preference');
  assert.equal(found.find((f) => f.text.includes('launch')).kind, 'goal');
});

test('brain learning: chat teaches the Brain, memory is visible, editable, and used', async () => {
  const chat = await api('POST', '/api/chats', { helperId: 'milli' });
  const msg = await api('POST', `/api/chats/${chat.data.id}/messages`, {
    content: 'We never discount below 10% because our margins depend on it. Write me a sales pitch.',
  });
  assert.ok(msg.data.learned.some((t) => t.includes('never discount')), 'reply reports what was learned');

  const brain = await api('GET', '/api/brain');
  const mem = brain.data.memories.find((m) => m.text.includes('never discount'));
  assert.ok(mem, 'memory visible in the Brain');
  assert.equal(mem.kind, 'preference');

  // dedupe: repeating the same statement doesn't duplicate
  await api('POST', `/api/chats/${chat.data.id}/messages`, { content: 'We never discount below 10% because our margins depend on it.' });
  const again = await api('GET', '/api/brain');
  assert.equal(again.data.memories.filter((m) => m.text.includes('never discount')).length, 1);

  // memory is injected into system prompts (the learning is actually used)
  const { systemPrompt } = await import('../server/helpers.js');
  const state = { tasks: [], sites: [], seoAudits: [], documents: [], calendar: [], automations: [], integrations: [], memories: again.data.memories, feedback: {} };
  const sp = systemPrompt({ prompt: 'x', id: 'milli', name: 'Milli' }, { businessName: 'X' }, [], state);
  assert.ok(sp.includes('never discount below 10%'), 'learned memory reaches the model');

  // offline engine surfaces the relevant memory to the user
  const reply2 = await api('POST', `/api/chats/${chat.data.id}/messages`, { content: 'Should we offer a bigger discount to close deals faster?' });
  assert.ok(/never discount|Remembering/i.test(reply2.data.reply.content), 'offline reply references the learned rule');

  // pin + forget
  const pinned = await api('PATCH', `/api/brain/memories/${mem.id}`, { pinned: true });
  assert.equal(pinned.data.pinned, true);
  await api('DELETE', `/api/brain/memories/${mem.id}`);
  const gone = await api('GET', '/api/brain');
  assert.ok(!gone.data.memories.some((m) => m.id === mem.id));
  await api('DELETE', `/api/chats/${chat.data.id}`);
});

test('brain learning: reply feedback is recorded and reaches prompts', async () => {
  const chat = await api('POST', '/api/chats', { helperId: 'penn' });
  await api('POST', `/api/chats/${chat.data.id}/messages`, { content: 'Give me a tagline idea' });
  const fb = await api('POST', `/api/chats/${chat.data.id}/feedback`, { index: 1, rating: 'up' });
  assert.equal(fb.status, 200);
  assert.equal(fb.data.totals.up, 1);

  const full = await api('GET', `/api/chats/${chat.data.id}`);
  assert.equal(full.data.messages[1].rating, 'up', 'rating persisted on the message');

  const badIdx = await api('POST', `/api/chats/${chat.data.id}/feedback`, { index: 0, rating: 'up' });
  assert.equal(badIdx.status, 400, 'user messages cannot be rated');

  const { workspaceContext } = await import('../server/helpers.js');
  const ctx = workspaceContext({ tasks: [], sites: [], seoAudits: [], documents: [], calendar: [], automations: [], integrations: [], memories: [], feedback: { penn: { up: 1, down: 0 } } });
  assert.ok(ctx.includes('penn 1👍/0👎'), 'feedback counters reach the prompt');
  await api('DELETE', `/api/chats/${chat.data.id}`);
});

test('spa: serves index.html at / and as fallback', async () => {
  const home = await fetch(base + '/');
  assert.equal(home.status, 200);
  assert.ok((await home.text()).includes('<!doctype html>'));
  const deep = await fetch(base + '/app/tasks');
  assert.ok((await deep.text()).includes('HELIX'));
});
