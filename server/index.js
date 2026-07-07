// HELIX server — static SPA, JSON API, published sites. Zero dependencies.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRouter, readBody, sendJSON } from './router.js';
import { createStore, uid } from './store.js';
import { HELPERS, HELPER_MAP, systemPrompt } from './helpers.js';
import { generate } from './ai.js';
import { POWERUPS, POWERUP_MAP } from './powerups.js';
import { computeNextRun, runAutomation, startScheduler } from './automations.js';
import { PALETTES, slugify, defaultSections, renderSite, parseSiteContent, siteGenPrompt, applyGeneratedContent } from './sites.js';
import { auditHTML, fetchAndAudit } from './seo.js';
import { recordView, summarize } from './analytics.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
};

export function createApp({ dataDir } = {}) {
  const store = createStore(dataDir || path.join(__dirname, '..', 'data'));
  const router = createRouter();
  const S = () => store.state;

  const notFound = (res, msg = 'not found') => sendJSON(res, 404, { error: msg });
  const bad = (res, msg) => sendJSON(res, 400, { error: msg });

  function redactedSettings() {
    const { apiKey, ...rest } = S().settings;
    return { ...rest, hasKey: !!apiKey };
  }

  async function askHelper(helperId, messages) {
    const helper = HELPER_MAP[helperId] || HELPER_MAP.vizzy;
    const system = systemPrompt(helper, S().brain, S().knowledge, S());
    return generate({ settings: S().settings, helper, brain: S().brain, system, messages, workspace: S() });
  }

  // ---------- bootstrap ----------
  router.get('/api/bootstrap', (req, res) => {
    const s = S();
    sendJSON(res, 200, {
      helpers: HELPERS,
      powerups: POWERUPS,
      palettes: Object.keys(PALETTES),
      settings: redactedSettings(),
      counts: {
        chats: s.chats.length, tasks: s.tasks.length, documents: s.documents.length,
        automations: s.automations.length, sites: s.sites.length,
        unread: s.inbox.filter((i) => !i.read).length,
      },
    });
  });

  // ---------- brain ----------
  router.get('/api/brain', (req, res) => sendJSON(res, 200, { brain: S().brain, knowledge: S().knowledge }));
  router.put('/api/brain', async (req, res) => {
    const body = await readBody(req);
    const allowed = ['businessName', 'tagline', 'industry', 'description', 'audience', 'tone', 'products', 'goals', 'website', 'location'];
    for (const k of allowed) if (k in body) S().brain[k] = String(body[k] ?? '');
    store.save();
    sendJSON(res, 200, { brain: S().brain });
  });
  router.post('/api/brain/knowledge', async (req, res) => {
    const { title, content } = await readBody(req);
    if (!title || !content) return bad(res, 'title and content are required');
    const item = { id: uid(), title: String(title), content: String(content), createdAt: Date.now() };
    S().knowledge.unshift(item);
    store.save();
    sendJSON(res, 201, item);
  });
  router.delete('/api/brain/knowledge/:id', (req, res, { id }) => {
    const list = S().knowledge;
    const i = list.findIndex((k) => k.id === id);
    if (i === -1) return notFound(res);
    list.splice(i, 1);
    store.save();
    sendJSON(res, 200, { ok: true });
  });

  // ---------- chats ----------
  router.get('/api/chats', (req, res, params, query) => {
    let chats = S().chats;
    if (query.helper) chats = chats.filter((c) => c.helperId === query.helper);
    sendJSON(res, 200, chats.map(({ messages, ...meta }) => ({ ...meta, messageCount: messages.length })));
  });
  router.post('/api/chats', async (req, res) => {
    const { helperId } = await readBody(req);
    if (!HELPER_MAP[helperId]) return bad(res, 'unknown helper');
    const chat = { id: uid(), helperId, title: 'New conversation', createdAt: Date.now(), messages: [] };
    S().chats.unshift(chat);
    store.save();
    sendJSON(res, 201, chat);
  });
  router.get('/api/chats/:id', (req, res, { id }) => {
    const chat = S().chats.find((c) => c.id === id);
    return chat ? sendJSON(res, 200, chat) : notFound(res);
  });
  router.delete('/api/chats/:id', (req, res, { id }) => {
    const i = S().chats.findIndex((c) => c.id === id);
    if (i === -1) return notFound(res);
    S().chats.splice(i, 1);
    store.save();
    sendJSON(res, 200, { ok: true });
  });
  router.post('/api/chats/:id/messages', async (req, res, { id }) => {
    const chat = S().chats.find((c) => c.id === id);
    if (!chat) return notFound(res);
    const { content } = await readBody(req);
    if (!content || !String(content).trim()) return bad(res, 'content is required');
    chat.messages.push({ role: 'user', content: String(content), at: Date.now() });
    if (chat.messages.length === 1) chat.title = String(content).slice(0, 60);
    const history = chat.messages.slice(-12).map(({ role, content }) => ({ role, content }));
    const { text, engine } = await askHelper(chat.helperId, history);
    const reply = { role: 'assistant', content: text, at: Date.now(), engine };
    chat.messages.push(reply);
    store.save();
    sendJSON(res, 200, { reply, chat: { id: chat.id, title: chat.title } });
  });

  // ---------- tasks ----------
  router.get('/api/tasks', (req, res) => sendJSON(res, 200, S().tasks));
  router.post('/api/tasks', async (req, res) => {
    const b = await readBody(req);
    if (!b.title) return bad(res, 'title is required');
    const task = {
      id: uid(), title: String(b.title), notes: String(b.notes || ''),
      status: ['todo', 'doing', 'done'].includes(b.status) ? b.status : 'todo',
      helperId: HELPER_MAP[b.helperId] ? b.helperId : null,
      priority: ['low', 'medium', 'high'].includes(b.priority) ? b.priority : 'medium',
      createdAt: Date.now(), deliverableId: null,
    };
    S().tasks.unshift(task);
    store.save();
    sendJSON(res, 201, task);
  });
  router.patch('/api/tasks/:id', async (req, res, { id }) => {
    const task = S().tasks.find((t) => t.id === id);
    if (!task) return notFound(res);
    const b = await readBody(req);
    if (b.title !== undefined) task.title = String(b.title);
    if (b.notes !== undefined) task.notes = String(b.notes);
    if (['todo', 'doing', 'done'].includes(b.status)) task.status = b.status;
    if (['low', 'medium', 'high'].includes(b.priority)) task.priority = b.priority;
    if (b.helperId !== undefined) task.helperId = HELPER_MAP[b.helperId] ? b.helperId : null;
    store.save();
    sendJSON(res, 200, task);
  });
  router.delete('/api/tasks/:id', (req, res, { id }) => {
    const i = S().tasks.findIndex((t) => t.id === id);
    if (i === -1) return notFound(res);
    S().tasks.splice(i, 1);
    store.save();
    sendJSON(res, 200, { ok: true });
  });
  // AI completes the task and attaches a deliverable document.
  router.post('/api/tasks/:id/run', async (req, res, { id }) => {
    const task = S().tasks.find((t) => t.id === id);
    if (!task) return notFound(res);
    const helperId = task.helperId || 'vizzy';
    const prompt = `Complete this task and produce the deliverable:\nTask: ${task.title}${task.notes ? `\nDetails: ${task.notes}` : ''}`;
    const { text, engine } = await askHelper(helperId, [{ role: 'user', content: prompt }]);
    const doc = { id: uid(), title: `Task: ${task.title}`, kind: 'task', helperId, content: text, engine, source: task.id, createdAt: Date.now() };
    S().documents.unshift(doc);
    task.status = 'done';
    task.deliverableId = doc.id;
    store.save();
    sendJSON(res, 200, { task, document: doc });
  });

  // ---------- power-ups & documents ----------
  router.get('/api/powerups', (req, res) => sendJSON(res, 200, POWERUPS));
  router.post('/api/powerups/:id/run', async (req, res, { id }) => {
    const pu = POWERUP_MAP[id];
    if (!pu) return notFound(res, 'unknown power-up');
    const { inputs = {} } = await readBody(req);
    for (const f of pu.fields) {
      if (f.required && !String(inputs[f.key] || '').trim()) return bad(res, `"${f.label}" is required`);
    }
    const prompt = pu.buildPrompt(inputs);
    const { text, engine } = await askHelper(pu.helperId, [{ role: 'user', content: prompt }]);
    const doc = { id: uid(), title: pu.name, kind: 'powerup', helperId: pu.helperId, content: text, engine, source: pu.id, createdAt: Date.now() };
    S().documents.unshift(doc);
    store.save();
    sendJSON(res, 200, doc);
  });
  router.get('/api/documents', (req, res) => sendJSON(res, 200, S().documents.map(({ content, ...m }) => ({ ...m, preview: String(content).slice(0, 160) }))));
  router.get('/api/documents/:id', (req, res, { id }) => {
    const doc = S().documents.find((d) => d.id === id);
    return doc ? sendJSON(res, 200, doc) : notFound(res);
  });
  router.delete('/api/documents/:id', (req, res, { id }) => {
    const i = S().documents.findIndex((d) => d.id === id);
    if (i === -1) return notFound(res);
    S().documents.splice(i, 1);
    // clear dangling references so the UI never links to a deleted deliverable
    for (const t of S().tasks) if (t.deliverableId === id) t.deliverableId = null;
    for (const n of S().inbox) if (n.documentId === id) n.documentId = null;
    store.save();
    sendJSON(res, 200, { ok: true });
  });

  // ---------- automations ----------
  router.get('/api/automations', (req, res) => sendJSON(res, 200, S().automations));
  router.post('/api/automations', async (req, res) => {
    const b = await readBody(req);
    if (!b.name || !b.prompt) return bad(res, 'name and prompt are required');
    const schedule = b.schedule?.type === 'daily'
      ? { type: 'daily', time: String(b.schedule.time || '09:00') }
      : { type: 'interval', minutes: Math.max(1, Number(b.schedule?.minutes) || 1440) };
    const a = {
      id: uid(), name: String(b.name), prompt: String(b.prompt),
      helperId: HELPER_MAP[b.helperId] ? b.helperId : 'vizzy',
      schedule, enabled: b.enabled !== false,
      lastRun: null, nextRun: computeNextRun(schedule), runs: 0, createdAt: Date.now(),
    };
    S().automations.unshift(a);
    store.save();
    sendJSON(res, 201, a);
  });
  router.patch('/api/automations/:id', async (req, res, { id }) => {
    const a = S().automations.find((x) => x.id === id);
    if (!a) return notFound(res);
    const b = await readBody(req);
    if (b.name !== undefined) a.name = String(b.name);
    if (b.prompt !== undefined) a.prompt = String(b.prompt);
    if (b.helperId !== undefined && HELPER_MAP[b.helperId]) a.helperId = b.helperId;
    if (b.enabled !== undefined) a.enabled = !!b.enabled;
    if (b.schedule) {
      a.schedule = b.schedule.type === 'daily'
        ? { type: 'daily', time: String(b.schedule.time || '09:00') }
        : { type: 'interval', minutes: Math.max(1, Number(b.schedule.minutes) || 1440) };
      a.nextRun = computeNextRun(a.schedule);
    }
    store.save();
    sendJSON(res, 200, a);
  });
  router.delete('/api/automations/:id', (req, res, { id }) => {
    const i = S().automations.findIndex((x) => x.id === id);
    if (i === -1) return notFound(res);
    S().automations.splice(i, 1);
    store.save();
    sendJSON(res, 200, { ok: true });
  });
  router.post('/api/automations/:id/run', async (req, res, { id }) => {
    const a = S().automations.find((x) => x.id === id);
    if (!a) return notFound(res);
    const doc = await runAutomation(store, a);
    sendJSON(res, 200, { automation: a, document: doc });
  });

  // ---------- inbox ----------
  router.get('/api/inbox', (req, res) => sendJSON(res, 200, S().inbox));
  router.post('/api/inbox/read', async (req, res) => {
    for (const i of S().inbox) i.read = true;
    store.save();
    sendJSON(res, 200, { ok: true });
  });

  // ---------- sites ----------
  router.get('/api/sites', (req, res) => sendJSON(res, 200, S().sites));
  router.post('/api/sites', async (req, res) => {
    const b = await readBody(req);
    if (!b.name) return bad(res, 'name is required');
    let slug = slugify(b.slug || b.name);
    while (S().sites.some((s) => s.slug === slug)) slug += '-' + uid().slice(0, 4);
    const site = {
      id: uid(), name: String(b.name), slug,
      palette: PALETTES[b.palette] ? b.palette : 'midnight',
      sections: defaultSections(S().brain),
      published: true, createdAt: Date.now(), updatedAt: Date.now(),
    };
    S().sites.unshift(site);
    store.save();
    sendJSON(res, 201, site);
  });
  router.get('/api/sites/:id', (req, res, { id }) => {
    const site = S().sites.find((s) => s.id === id);
    return site ? sendJSON(res, 200, site) : notFound(res);
  });
  router.patch('/api/sites/:id', async (req, res, { id }) => {
    const site = S().sites.find((s) => s.id === id);
    if (!site) return notFound(res);
    const b = await readBody(req);
    if (b.name !== undefined) site.name = String(b.name);
    if (b.palette !== undefined && PALETTES[b.palette]) site.palette = b.palette;
    if (b.published !== undefined) site.published = !!b.published;
    if (Array.isArray(b.sections)) site.sections = b.sections;
    site.updatedAt = Date.now();
    store.save();
    sendJSON(res, 200, site);
  });
  router.delete('/api/sites/:id', (req, res, { id }) => {
    const i = S().sites.findIndex((s) => s.id === id);
    if (i === -1) return notFound(res);
    S().sites.splice(i, 1);
    store.save();
    sendJSON(res, 200, { ok: true });
  });
  // AI-generate the site's copy from the Brain profile.
  router.post('/api/sites/:id/generate', async (req, res, { id }) => {
    const site = S().sites.find((s) => s.id === id);
    if (!site) return notFound(res);
    const { text } = await askHelper('penn', [{ role: 'user', content: siteGenPrompt(site, S().brain) }]);
    const content = parseSiteContent(text);
    if (content) applyGeneratedContent(site, content);
    else {
      // offline engine returns markdown, not JSON — regenerate defaults from Brain instead
      site.sections = defaultSections(S().brain);
    }
    site.updatedAt = Date.now();
    store.save();
    sendJSON(res, 200, site);
  });
  router.get('/api/sites/:id/preview', (req, res, { id }) => {
    const site = S().sites.find((s) => s.id === id);
    if (!site) return notFound(res);
    const html = renderSite(site, S().brain);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(html);
  });

  // ---------- marketing: calendar + emails ----------
  router.get('/api/calendar', (req, res) => sendJSON(res, 200, S().calendar));
  router.post('/api/calendar', async (req, res) => {
    const b = await readBody(req);
    if (!b.content) return bad(res, 'content is required');
    const post = {
      id: uid(), platform: String(b.platform || 'LinkedIn'), content: String(b.content),
      date: String(b.date || new Date().toISOString().slice(0, 10)),
      status: ['draft', 'scheduled', 'posted'].includes(b.status) ? b.status : 'draft',
      helperId: 'soshie', createdAt: Date.now(),
    };
    S().calendar.unshift(post);
    store.save();
    sendJSON(res, 201, post);
  });
  router.patch('/api/calendar/:id', async (req, res, { id }) => {
    const post = S().calendar.find((p) => p.id === id);
    if (!post) return notFound(res);
    const b = await readBody(req);
    if (b.content !== undefined) post.content = String(b.content);
    if (b.platform !== undefined) post.platform = String(b.platform);
    if (b.date !== undefined) post.date = String(b.date);
    if (['draft', 'scheduled', 'posted'].includes(b.status)) post.status = b.status;
    store.save();
    sendJSON(res, 200, post);
  });
  router.delete('/api/calendar/:id', (req, res, { id }) => {
    const i = S().calendar.findIndex((p) => p.id === id);
    if (i === -1) return notFound(res);
    S().calendar.splice(i, 1);
    store.save();
    sendJSON(res, 200, { ok: true });
  });
  // Generate a week of posts.
  router.post('/api/calendar/generate', async (req, res) => {
    const body = await readBody(req);
    const platforms = Array.isArray(body.platforms) && body.platforms.length
      ? body.platforms.map(String) : ['LinkedIn', 'Instagram', 'X'];
    let start = body.startDate ? new Date(body.startDate) : new Date();
    if (Number.isNaN(start.getTime())) start = new Date();
    const created = [];
    const angles = [
      'a customer pain point and how you solve it',
      'a behind-the-scenes look at how you work',
      'a practical tip your audience can use today',
      'a common myth in your industry, debunked',
      'a customer success story or result',
      'a question that starts a conversation',
      'your product or service, presented with a clear offer',
    ];
    for (let i = 0; i < 7; i++) {
      const platform = platforms[i % platforms.length];
      const { text } = await askHelper('soshie', [{
        role: 'user',
        content: `Write ONE ${platform} post about ${angles[i]}. Return only the post text, ready to publish.`,
      }]);
      const date = new Date(start.getTime() + i * 86_400_000).toISOString().slice(0, 10);
      const post = { id: uid(), platform, content: text, date, status: 'draft', helperId: 'soshie', createdAt: Date.now() };
      S().calendar.unshift(post);
      created.push(post);
    }
    store.save();
    sendJSON(res, 200, created);
  });

  router.get('/api/emails', (req, res) => sendJSON(res, 200, S().emails));
  router.post('/api/emails', async (req, res) => {
    const b = await readBody(req);
    if (!b.subject) return bad(res, 'subject is required');
    const email = {
      id: uid(), subject: String(b.subject), preheader: String(b.preheader || ''),
      body: String(b.body || ''), audience: String(b.audience || 'All subscribers'),
      status: 'draft', createdAt: Date.now(),
    };
    S().emails.unshift(email);
    store.save();
    sendJSON(res, 201, email);
  });
  router.post('/api/emails/generate', async (req, res) => {
    const { goal = 'a promotional campaign' } = await readBody(req);
    const { text } = await askHelper('emmie', [{ role: 'user', content: `Write an email campaign for: ${goal}. Include a subject line, preheader, and full body.` }]);
    const subjectMatch = text.match(/subject[^:\n]*:\s*(.+)/i);
    const email = {
      id: uid(),
      subject: (subjectMatch ? subjectMatch[1] : `Campaign: ${goal}`).slice(0, 120).replace(/[*_#]/g, '').trim(),
      preheader: '', body: text, audience: 'All subscribers', status: 'draft', createdAt: Date.now(),
    };
    S().emails.unshift(email);
    store.save();
    sendJSON(res, 201, email);
  });
  router.delete('/api/emails/:id', (req, res, { id }) => {
    const i = S().emails.findIndex((e) => e.id === id);
    if (i === -1) return notFound(res);
    S().emails.splice(i, 1);
    store.save();
    sendJSON(res, 200, { ok: true });
  });

  // ---------- seo ----------
  router.post('/api/seo/audit', async (req, res) => {
    const { url, siteId } = await readBody(req);
    let report;
    if (siteId) {
      const site = S().sites.find((s) => s.id === siteId);
      if (!site) return notFound(res, 'site not found');
      report = auditHTML(renderSite(site, S().brain), `Studio site: ${site.name}`);
    } else if (url) {
      if (!/^https?:\/\//i.test(url)) return bad(res, 'url must start with http(s)://');
      try { report = await fetchAndAudit(url); }
      catch (e) { return sendJSON(res, 502, { error: `could not fetch ${url}: ${e.message}` }); }
    } else return bad(res, 'provide url or siteId');
    report.id = uid();
    S().seoAudits.unshift(report);
    if (S().seoAudits.length > 50) S().seoAudits.length = 50;
    store.save();
    sendJSON(res, 200, report);
  });
  router.get('/api/seo/audits', (req, res) => sendJSON(res, 200, S().seoAudits));

  // ---------- analytics ----------
  router.get('/api/analytics', (req, res) => sendJSON(res, 200, summarize(store)));

  // ---------- settings / export ----------
  router.get('/api/settings', (req, res) => sendJSON(res, 200, redactedSettings()));
  router.put('/api/settings', async (req, res) => {
    const b = await readBody(req);
    const st = S().settings;
    if (b.provider !== undefined && ['offline', 'anthropic', 'openai', 'ollama'].includes(b.provider)) st.provider = b.provider;
    if (b.apiKey !== undefined) st.apiKey = String(b.apiKey);
    if (b.model !== undefined) st.model = String(b.model);
    if (b.baseUrl !== undefined) st.baseUrl = String(b.baseUrl);
    store.save();
    sendJSON(res, 200, redactedSettings());
  });
  router.get('/api/export', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="helix-export-${new Date().toISOString().slice(0, 10)}.json"`,
    });
    res.end(JSON.stringify(S(), null, 2));
  });
  router.post('/api/import', async (req, res) => {
    const body = await readBody(req, 50 * 1024 * 1024);
    if (!body || typeof body !== 'object' || !body.brain || typeof body.brain !== 'object') {
      return bad(res, 'not a valid HELIX export');
    }
    store.replace(body);
    // stale nextRun timestamps from a backup would fire every automation at once
    for (const a of S().automations) {
      if (a && a.schedule) a.nextRun = computeNextRun(a.schedule);
    }
    store.save();
    sendJSON(res, 200, { ok: true });
  });

  // ---------- http server ----------
  function serveStatic(res, filePath) {
    const resolved = path.resolve(PUBLIC_DIR, filePath);
    // require the separator so a sibling dir like "public-evil" can't match
    if (resolved !== PUBLIC_DIR && !resolved.startsWith(PUBLIC_DIR + path.sep)) {
      res.writeHead(403); res.end(); return true;
    }
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) return false;
    res.writeHead(200, { 'Content-Type': MIME[path.extname(resolved)] || 'application/octet-stream' });
    res.end(fs.readFileSync(resolved));
    return true;
  }

  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://localhost');
    const pathname = u.pathname;
    const query = Object.fromEntries(u.searchParams);

    try {
      // published sites
      if (pathname.startsWith('/sites/')) {
        const slug = pathname.split('/')[2];
        const site = S().sites.find((s) => s.slug === slug);
        if (!site || !site.published) { res.writeHead(404, { 'Content-Type': 'text/html' }); res.end('<h1>Site not found</h1>'); return; }
        recordView(store, slug, pathname);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderSite(site, S().brain));
        return;
      }

      // API
      if (pathname.startsWith('/api/')) {
        const m = router.match(req.method, pathname);
        if (!m) return notFound(res, `no route: ${req.method} ${pathname}`);
        await m.handler(req, res, m.params, query);
        return;
      }

      // SPA static
      if (serveStatic(res, pathname === '/' ? 'index.html' : pathname.slice(1))) return;
      if (serveStatic(res, 'index.html')) return; // SPA fallback
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('not found');
    } catch (err) {
      console.error(`[http] ${req.method} ${pathname}:`, err.message);
      if (!res.headersSent) sendJSON(res, err.statusCode || 500, { error: err.message || 'internal error' });
      else res.end();
    }
  });

  const stopScheduler = startScheduler(store);
  server.on('close', () => { stopScheduler(); store.close(); });

  return { server, store };
}

// Direct launch
if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const preferred = Number(process.env.PORT) || 4310;
  const { server } = createApp();

  let attempts = 0;
  server.once('listening', () => {
    const { port } = server.address();
    console.log('\n  ⬢ HELIX is running');
    console.log(`  → Open http://localhost:${port} in a browser ON THIS MACHINE`);
    console.log('  → Your data lives in data/db.json — press Ctrl+C to stop\n');
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && attempts < 10) {
      attempts += 1;
      const next = preferred + attempts;
      console.log(`  Port ${preferred + attempts - 1} is busy — trying ${next}…`);
      setTimeout(() => server.listen(next), 100);
    } else {
      console.error(`\n  ✖ HELIX could not start: ${err.message}\n`);
      process.exit(1);
    }
  });
  server.listen(preferred);
}
