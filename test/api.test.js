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

test('spa: serves index.html at / and as fallback', async () => {
  const home = await fetch(base + '/');
  assert.equal(home.status, 200);
  assert.ok((await home.text()).includes('<!doctype html>'));
  const deep = await fetch(base + '/app/tasks');
  assert.ok((await deep.text()).includes('HELIX'));
});
