// In-browser HELIX backend for the single-file demo.
// This file is concatenated INSIDE an IIFE after the ported server modules
// (helpers.js, offline.js, powerups.js, sites.js, seo.js), so HELPERS,
// HELPER_MAP, POWERUPS, POWERUP_MAP, offlineGenerate, PALETTES, slugify,
// defaultSections, renderSite and auditHTML are all in scope.

const uid = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');

const DEFAULTS = () => ({
  brain: {
    businessName: '', tagline: '', industry: '', description: '', audience: '',
    tone: 'friendly and professional', products: '', goals: '', website: '', location: '',
  },
  knowledge: [], chats: [], tasks: [], documents: [], automations: [],
  sites: [], calendar: [], emails: [], seoAudits: [], analytics: [], inbox: [], integrations: [], memories: [],
  feedback: {}, usageLog: [],
  settings: { provider: 'offline', apiKey: '', model: '', baseUrl: '' },
});

const STORE_KEY = 'helix-demo-db';
let db = DEFAULTS();
try {
  const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
  if (saved && typeof saved === 'object') {
    const base = DEFAULTS();
    for (const [k, def] of Object.entries(base)) {
      const v = saved[k];
      if (Array.isArray(def)) db[k] = Array.isArray(v) ? v : def;
      else if (def && typeof def === 'object') db[k] = { ...def, ...(v && typeof v === 'object' ? v : {}) };
      else db[k] = v ?? def;
    }
  }
} catch { /* fresh start */ }

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); } catch { /* storage full/blocked: demo keeps running in memory */ }
}

function computeNextRun(schedule, from = Date.now()) {
  if (schedule.type === 'interval') {
    return from + Math.max(1, Number(schedule.minutes) || 60) * 60_000;
  }
  const [rawH, rawM] = String(schedule.time || '09:00').split(':').map((n) => parseInt(n, 10) || 0);
  const d = new Date(from);
  d.setHours(Math.min(23, Math.max(0, rawH)), Math.min(59, Math.max(0, rawM)), 0, 0);
  if (d.getTime() <= from) d.setDate(d.getDate() + 1);
  return d.getTime();
}

// Real AI when a CORS-open, OpenAI-compatible gateway is configured in
// Settings (base URL + key); the offline engine otherwise / on any failure.
async function askGateway(helper, message) {
  const st = db.settings;
  if (st.provider !== 'openai' || !st.apiKey || !st.baseUrl) return null;
  const system = systemPrompt(helper, db.brain, db.knowledge, db);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch(st.baseUrl.replace(/\/$/, '') + '/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + st.apiKey },
      body: JSON.stringify({
        model: st.model || 'auto', // gateways auto-discover when unspecified
        max_tokens: 1024,          // spend guard (also enforced relay-side)
        messages: [{ role: 'system', content: system }, { role: 'user', content: message }],
      }),
      signal: ctl.signal,
    });
    if (!r.ok) return null;
    const d = await r.json();
    const text = d?.choices?.[0]?.message?.content || '';
    return text.trim() ? { text, engine: 'gateway' } : null;
  } catch { return null; }
  finally { clearTimeout(timer); }
}

// AI-assisted memory via the gateway: propose, then verify against the
// user's words (aiLearn) before saving. Fire-and-forget from the chat route.
async function gatewayProposeMemories(message) {
  const st = db.settings;
  if (st.provider !== 'openai' || !st.apiKey || !st.baseUrl) return '';
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch(st.baseUrl.replace(/\/$/, '') + '/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + st.apiKey },
      body: JSON.stringify({
        model: st.model || 'auto', max_tokens: 300,
        messages: [{ role: 'system', content: MEMORY_PROPOSAL_SYSTEM }, { role: 'user', content: message }],
      }),
      signal: ctl.signal,
    });
    if (!r.ok) return '';
    const d = await r.json();
    return d?.choices?.[0]?.message?.content || '';
  } catch { return ''; }
  finally { clearTimeout(timer); }
}

async function ask(helperId, message) {
  const helper = HELPER_MAP[helperId] || HELPER_MAP.vizzy;
  const live = await askGateway(helper, message);
  if (live) return live;
  return { text: offlineGenerate({ helper, brain: db.brain, message, workspace: db }), engine: 'offline' };
}

async function runAutomationNow(a) {
  const helper = HELPER_MAP[a.helperId] || HELPER_MAP.vizzy;
  const { text, engine } = await ask(helper.id, a.prompt);
  const doc = {
    id: uid(), title: `${a.name} — ${new Date().toLocaleDateString()}`, kind: 'automation',
    helperId: helper.id, content: text, engine, source: a.id, createdAt: Date.now(),
  };
  db.documents.unshift(doc);
  if (db.inbox.length >= 200) db.inbox.length = 199;
  db.inbox.unshift({
    id: uid(), title: `${helper.name} finished “${a.name}”`, body: text.slice(0, 200),
    from: helper.id, read: false, documentId: doc.id, createdAt: Date.now(),
  });
  a.lastRun = Date.now();
  a.runs = (a.runs || 0) + 1;
  a.nextRun = computeNextRun(a.schedule);
  save();
  return doc;
}

setInterval(() => {
  const now = Date.now();
  for (const a of db.automations) {
    if (a.enabled && a.nextRun && a.nextRun <= now) {
      try { runAutomationNow(a); } catch { a.nextRun = computeNextRun(a.schedule); }
    }
  }
}, 15_000);

function recordView(slug, path = '/') {
  const day = new Date().toISOString().slice(0, 10);
  let row = db.analytics.find((r) => r.siteSlug === slug && r.path === path && r.day === day);
  if (row) row.count += 1;
  else db.analytics.push({ siteSlug: slug, path, day, count: 1 });
  save();
}

function analyticsSummary() {
  const bySite = {};
  for (const r of db.analytics) {
    bySite[r.siteSlug] ??= { total: 0, days: {} };
    bySite[r.siteSlug].total += r.count;
    bySite[r.siteSlug].days[r.day] = (bySite[r.siteSlug].days[r.day] || 0) + r.count;
  }
  const series = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    series.push({ day: d, count: db.analytics.filter((r) => r.day === d).reduce((a, r) => a + r.count, 0) });
  }
  return { bySite, series, total: db.analytics.reduce((a, r) => a + r.count, 0) };
}

function previewHTML(idOrSlug) {
  const site = db.sites.find((s) => s.id === idOrSlug || s.slug === idOrSlug);
  if (!site) return '<h1 style="font-family:sans-serif">Site not found</h1>';
  return renderSite(site, db.brain);
}

// ---- the API router ----
async function handle(method, pathname, query, body) {
  const seg = pathname.split('/').filter(Boolean); // e.g. ['api','tasks','abc']
  const ok = (data, status = 200) => ({ status, data });
  const notFound = (msg = 'not found') => ({ status: 404, data: { error: msg } });
  const bad = (msg) => ({ status: 400, data: { error: msg } });
  const p = seg.slice(1); // drop 'api'
  const id = p[1];

  switch (p[0]) {
    case 'bootstrap':
      return ok({
        helpers: HELPERS, powerups: POWERUPS, palettes: Object.keys(PALETTES),
        settings: { ...db.settings, apiKey: undefined, hasKey: !!db.settings.apiKey },
        counts: {
          chats: db.chats.length, tasks: db.tasks.length, documents: db.documents.length,
          automations: db.automations.length, sites: db.sites.length,
          unread: db.inbox.filter((i) => !i.read).length,
        },
      });

    case 'brain': {
      if (p[1] === 'memories') {
        const mem = db.memories.find((m) => m.id === p[2]);
        if (!mem) return notFound();
        if (method === 'PATCH') {
          if (body.pinned !== undefined) mem.pinned = !!body.pinned;
          if (body.text !== undefined && String(body.text).trim()) mem.text = clean(body.text, 220);
          save();
          return ok(mem);
        }
        if (method === 'DELETE') {
          db.memories.splice(db.memories.indexOf(mem), 1); save();
          return ok({ ok: true });
        }
      }
      if (p[1] === 'knowledge') {
        if (method === 'POST') {
          if (!body.title || !body.content) return bad('title and content are required');
          const item = { id: uid(), title: String(body.title), content: String(body.content), createdAt: Date.now() };
          db.knowledge.unshift(item); save();
          return ok(item, 201);
        }
        if (method === 'DELETE') {
          const i = db.knowledge.findIndex((k) => k.id === p[2]);
          if (i === -1) return notFound();
          db.knowledge.splice(i, 1); save();
          return ok({ ok: true });
        }
      }
      if (method === 'GET') return ok({ brain: db.brain, knowledge: db.knowledge, memories: db.memories });
      if (method === 'PUT') {
        for (const k of ['businessName', 'tagline', 'industry', 'description', 'audience', 'tone', 'products', 'goals', 'website', 'location']) {
          if (k in body) db.brain[k] = String(body[k] ?? '');
        }
        save();
        return ok({ brain: db.brain });
      }
      break;
    }

    case 'chats': {
      if (!id && method === 'GET') {
        let chats = db.chats;
        if (query.helper) chats = chats.filter((c) => c.helperId === query.helper);
        return ok(chats.map(({ messages, ...meta }) => ({ ...meta, messageCount: messages.length })));
      }
      if (!id && method === 'POST') {
        if (!HELPER_MAP[body.helperId]) return bad('unknown helper');
        const chat = { id: uid(), helperId: body.helperId, title: 'New conversation', createdAt: Date.now(), messages: [] };
        db.chats.unshift(chat); save();
        return ok(chat, 201);
      }
      const chat = db.chats.find((c) => c.id === id);
      if (!chat) return notFound();
      if (p[2] === 'messages' && method === 'POST') {
        if (!body.content || !String(body.content).trim()) return bad('content is required');
        const _c = clean(String(body.content));
        chat.messages.push({ role: 'user', content: _c, at: Date.now() });
        const learned = learnFromMessage(db, _c, `chat with ${HELPER_MAP[chat.helperId]?.name || chat.helperId}`);
        gatewayProposeMemories(_c).then((raw) => {
          if (!raw) return;
          const added = aiLearn(db, raw, _c, 'ai-verified · chat');
          if (added.length) save();
        }).catch(() => {});
        if (chat.messages.length === 1) chat.title = _c.slice(0, 60);
        const { text, engine } = await ask(chat.helperId, _c);
        const reply = { role: 'assistant', content: text, at: Date.now(), engine };
        chat.messages.push(reply); save();
        return ok({ reply, chat: { id: chat.id, title: chat.title }, learned: learned.map((m) => m.text) });
      }
      if (p[2] === 'feedback' && method === 'POST') {
        const msg = chat.messages[Number(body.index)];
        if (!msg || msg.role !== 'assistant') return bad('index must point at an assistant reply');
        if (!['up', 'down'].includes(body.rating)) return bad('rating must be up or down');
        msg.rating = body.rating;
        const totals = recordFeedback(db, chat.helperId, body.rating);
        save();
        return ok({ ok: true, helperId: chat.helperId, totals });
      }
      if (method === 'GET') return ok(chat);
      if (method === 'DELETE') {
        db.chats.splice(db.chats.indexOf(chat), 1); save();
        return ok({ ok: true });
      }
      break;
    }

    case 'tasks': {
      if (!id && method === 'GET') return ok(db.tasks);
      if (!id && method === 'POST') {
        if (!body.title) return bad('title is required');
        const task = {
          id: uid(), title: String(body.title), notes: String(body.notes || ''),
          status: ['todo', 'doing', 'done'].includes(body.status) ? body.status : 'todo',
          helperId: HELPER_MAP[body.helperId] ? body.helperId : null,
          priority: ['low', 'medium', 'high'].includes(body.priority) ? body.priority : 'medium',
          createdAt: Date.now(), deliverableId: null,
        };
        db.tasks.unshift(task); save();
        return ok(task, 201);
      }
      const task = db.tasks.find((t) => t.id === id);
      if (!task) return notFound();
      if (p[2] === 'run' && method === 'POST') {
        const helperId = task.helperId || 'vizzy';
        const { text, engine } = await ask(helperId, `Complete this task and produce the deliverable:\nTask: ${task.title}${task.notes ? `\nDetails: ${task.notes}` : ''}`);
        const doc = { id: uid(), title: `Task: ${task.title}`, kind: 'task', helperId, content: text, engine, source: task.id, createdAt: Date.now() };
        db.documents.unshift(doc);
        task.status = 'done';
        task.deliverableId = doc.id;
        save();
        return ok({ task, document: doc });
      }
      if (method === 'PATCH') {
        if (body.title !== undefined) task.title = String(body.title);
        if (body.notes !== undefined) task.notes = String(body.notes);
        if (['todo', 'doing', 'done'].includes(body.status)) task.status = body.status;
        if (['low', 'medium', 'high'].includes(body.priority)) task.priority = body.priority;
        if (body.helperId !== undefined) task.helperId = HELPER_MAP[body.helperId] ? body.helperId : null;
        save();
        return ok(task);
      }
      if (method === 'DELETE') {
        db.tasks.splice(db.tasks.indexOf(task), 1); save();
        return ok({ ok: true });
      }
      break;
    }

    case 'powerups': {
      if (!id && method === 'GET') return ok(POWERUPS);
      const pu = POWERUP_MAP[id];
      if (!pu) return notFound('unknown power-up');
      if (p[2] === 'run' && method === 'POST') {
        const inputs = {}; for (const [k, v] of Object.entries(body.inputs || {})) inputs[k] = clean(v, 2000);
        for (const f of pu.fields) {
          if (f.required && !String(inputs[f.key] || '').trim()) return bad(`"${f.label}" is required`);
        }
        const { text, engine } = await ask(pu.helperId, pu.buildPrompt(inputs));
        const doc = { id: uid(), title: pu.name, kind: 'powerup', helperId: pu.helperId, content: text, engine, source: pu.id, createdAt: Date.now() };
        db.documents.unshift(doc); save();
        return ok(doc);
      }
      break;
    }

    case 'documents': {
      if (!id && method === 'GET') {
        return ok(db.documents.map(({ content, ...m }) => ({ ...m, preview: String(content).slice(0, 160) })));
      }
      const doc = db.documents.find((d) => d.id === id);
      if (!doc) return notFound();
      if (method === 'GET') return ok(doc);
      if (method === 'DELETE') {
        db.documents.splice(db.documents.indexOf(doc), 1);
        for (const t of db.tasks) if (t.deliverableId === id) t.deliverableId = null;
        for (const n of db.inbox) if (n.documentId === id) n.documentId = null;
        save();
        return ok({ ok: true });
      }
      break;
    }

    case 'automations': {
      if (!id && method === 'GET') return ok(db.automations);
      if (!id && method === 'POST') {
        if (!body.name || !body.prompt) return bad('name and prompt are required');
        const schedule = body.schedule?.type === 'daily'
          ? { type: 'daily', time: String(body.schedule.time || '09:00') }
          : { type: 'interval', minutes: Math.max(1, Number(body.schedule?.minutes) || 1440) };
        const a = {
          id: uid(), name: String(body.name), prompt: String(body.prompt),
          helperId: HELPER_MAP[body.helperId] ? body.helperId : 'vizzy',
          schedule, enabled: body.enabled !== false,
          lastRun: null, nextRun: computeNextRun(schedule), runs: 0, createdAt: Date.now(),
        };
        db.automations.unshift(a); save();
        return ok(a, 201);
      }
      const a = db.automations.find((x) => x.id === id);
      if (!a) return notFound();
      if (p[2] === 'run' && method === 'POST') {
        const doc = await runAutomationNow(a);
        return ok({ automation: a, document: doc });
      }
      if (method === 'PATCH') {
        if (body.name !== undefined) a.name = String(body.name);
        if (body.prompt !== undefined) a.prompt = String(body.prompt);
        if (body.helperId !== undefined && HELPER_MAP[body.helperId]) a.helperId = body.helperId;
        if (body.enabled !== undefined) a.enabled = !!body.enabled;
        if (body.schedule) {
          a.schedule = body.schedule.type === 'daily'
            ? { type: 'daily', time: String(body.schedule.time || '09:00') }
            : { type: 'interval', minutes: Math.max(1, Number(body.schedule.minutes) || 1440) };
          a.nextRun = computeNextRun(a.schedule);
        }
        save();
        return ok(a);
      }
      if (method === 'DELETE') {
        db.automations.splice(db.automations.indexOf(a), 1); save();
        return ok({ ok: true });
      }
      break;
    }

    case 'inbox': {
      if (p[1] === 'read' && method === 'POST') {
        for (const i of db.inbox) i.read = true;
        save();
        return ok({ ok: true });
      }
      return ok(db.inbox);
    }

    case 'sites': {
      if (!id && method === 'GET') return ok(db.sites);
      if (!id && method === 'POST') {
        if (!body.name) return bad('name is required');
        let slug = slugify(body.slug || body.name);
        while (db.sites.some((s) => s.slug === slug)) slug += '-' + uid().slice(0, 4);
        const site = {
          id: uid(), name: String(body.name), slug,
          palette: PALETTES[body.palette] ? body.palette : 'midnight',
          sections: defaultSections(db.brain),
          published: true, createdAt: Date.now(), updatedAt: Date.now(),
        };
        site.birthScore = auditHTML(renderSite(site, db.brain), `Studio site: ${site.name}`).score;
        db.sites.unshift(site); save();
        return ok(site, 201);
      }
      // chat + export accept id OR slug
      const siteAny = db.sites.find((s) => s.id === id || s.slug === id);
      if (p[2] === 'chat' && method === 'POST') {
        if (!siteAny) return notFound();
        const history = Array.isArray(body.messages) ? body.messages : [];
        const last = history.filter((m) => m && m.role === 'user' && m.content).slice(-1)[0];
        if (!last) return bad('send a user message');
        const { text } = await ask('vizzy', clean(String(last.content), 2000));
        return ok({ ok: true, reply: (text || '').slice(0, 2000) });
      }
      if (p[2] === 'export' && method === 'GET') {
        if (!siteAny) return notFound();
        return ok({ ok: true, note: 'Use the export button (client-side zip).' });
      }
      const site = db.sites.find((s) => s.id === id);
      if (!site) return notFound();
      if (p[2] === 'generate' && method === 'POST') {
        // demo always uses the offline engine, so regenerate from the Brain
        site.sections = defaultSections(db.brain);
        site.updatedAt = Date.now();
        site.birthScore = auditHTML(renderSite(site, db.brain), `Studio site: ${site.name}`).score;
        save();
        return ok(site);
      }
      if (p[2] === 'preview') return { status: 200, html: renderSite(site, db.brain) };
      if (method === 'GET') return ok(site);
      if (method === 'PATCH') {
        if (body.name !== undefined) site.name = String(body.name);
        if (body.palette !== undefined && PALETTES[body.palette]) site.palette = body.palette;
        if (body.published !== undefined) site.published = !!body.published;
        if (body.chatEnabled !== undefined) site.chatEnabled = !!body.chatEnabled;
        if (Array.isArray(body.sections)) site.sections = body.sections;
        site.updatedAt = Date.now();
        save();
        return ok(site);
      }
      if (method === 'DELETE') {
        db.sites.splice(db.sites.indexOf(site), 1); save();
        return ok({ ok: true });
      }
      break;
    }

    case 'calendar': {
      if (p[1] === 'generate' && method === 'POST') {
        const platforms = Array.isArray(body.platforms) && body.platforms.length
          ? body.platforms.map(String) : ['LinkedIn', 'Instagram', 'X'];
        let start = body.startDate ? new Date(body.startDate) : new Date();
        if (Number.isNaN(start.getTime())) start = new Date();
        const angles = [
          'a customer pain point and how you solve it',
          'a behind-the-scenes look at how you work',
          'a practical tip your audience can use today',
          'a common myth in your industry, debunked',
          'a customer success story or result',
          'a question that starts a conversation',
          'your product or service, presented with a clear offer',
        ];
        const created = [];
        for (let i = 0; i < 7; i++) {
          const platform = platforms[i % platforms.length];
          const { text } = await ask('soshie', `Write ONE ${platform} post about ${angles[i]}. Return only the post text, ready to publish.`);
          const date = new Date(start.getTime() + i * 86_400_000).toISOString().slice(0, 10);
          const post = { id: uid(), platform, content: text, date, status: 'draft', helperId: 'soshie', createdAt: Date.now() };
          db.calendar.unshift(post);
          created.push(post);
        }
        save();
        return ok(created);
      }
      if (!id && method === 'GET') return ok(db.calendar);
      if (!id && method === 'POST') {
        if (!body.content) return bad('content is required');
        const post = {
          id: uid(), platform: String(body.platform || 'LinkedIn'), content: String(body.content),
          date: String(body.date || new Date().toISOString().slice(0, 10)),
          status: ['draft', 'scheduled', 'posted'].includes(body.status) ? body.status : 'draft',
          helperId: 'soshie', createdAt: Date.now(),
        };
        db.calendar.unshift(post); save();
        return ok(post, 201);
      }
      const post = db.calendar.find((x) => x.id === id);
      if (!post) return notFound();
      if (method === 'PATCH') {
        if (body.content !== undefined) post.content = String(body.content);
        if (body.platform !== undefined) post.platform = String(body.platform);
        if (body.date !== undefined) post.date = String(body.date);
        if (['draft', 'scheduled', 'posted'].includes(body.status)) post.status = body.status;
        save();
        return ok(post);
      }
      if (method === 'DELETE') {
        db.calendar.splice(db.calendar.indexOf(post), 1); save();
        return ok({ ok: true });
      }
      break;
    }

    case 'emails': {
      if (p[1] === 'generate' && method === 'POST') {
        const goal = body.goal || 'a promotional campaign';
        const { text } = await ask('emmie', `Write an email campaign for: ${goal}. Include a subject line, preheader, and full body.`);
        const subjectMatch = text.match(/subject[^:\n]*:\s*(.+)/i);
        const email = {
          id: uid(),
          subject: (subjectMatch ? subjectMatch[1] : `Campaign: ${goal}`).slice(0, 120).replace(/[*_#]/g, '').trim(),
          preheader: '', body: text, audience: 'All subscribers', status: 'draft', createdAt: Date.now(),
        };
        db.emails.unshift(email); save();
        return ok(email, 201);
      }
      if (!id && method === 'GET') return ok(db.emails);
      if (!id && method === 'POST') {
        if (!body.subject) return bad('subject is required');
        const email = {
          id: uid(), subject: String(body.subject), preheader: String(body.preheader || ''),
          body: String(body.body || ''), audience: String(body.audience || 'All subscribers'),
          status: 'draft', createdAt: Date.now(),
        };
        db.emails.unshift(email); save();
        return ok(email, 201);
      }
      if (method === 'DELETE') {
        const i = db.emails.findIndex((e) => e.id === id);
        if (i === -1) return notFound();
        db.emails.splice(i, 1); save();
        return ok({ ok: true });
      }
      break;
    }

    case 'seo': {
      if (p[1] === 'audit' && method === 'POST') {
        let report;
        if (body.siteId) {
          const site = db.sites.find((s) => s.id === body.siteId);
          if (!site) return notFound('site not found');
          report = auditHTML(renderSite(site, db.brain), `Studio site: ${site.name}`);
        } else if (body.url) {
          // CORS-free path: a configured gateway relay fetches + audits server-side
          const st = db.settings;
          if (st.provider === 'openai' && st.apiKey && st.baseUrl) {
            try {
              const ctl = new AbortController();
              const timer = setTimeout(() => ctl.abort(), 20000);
              const r = await fetch(st.baseUrl.replace(/\/$/, '') + '/helix/audit?url=' + encodeURIComponent(body.url), {
                headers: { authorization: 'Bearer ' + st.apiKey }, signal: ctl.signal,
              }).finally(() => clearTimeout(timer));
              if (r.ok) {
                const rep = await r.json();
                if (rep && typeof rep.score === 'number' && Array.isArray(rep.checks)) {
                  report = { target: body.url, createdAt: Date.now(), ...rep };
                }
              }
            } catch { /* fall through to the honest message */ }
          }
          if (!report) {
            return { status: 502, data: { error: 'Auditing external URLs from the browser needs a relay: connect your AI gateway in Settings (base URL + key) and try again — or use the installable app. Studio-site audits work right here either way.' } };
          }
        } else return bad('provide url or siteId');
        report.id = uid();
        db.seoAudits.unshift(report);
        if (db.seoAudits.length > 50) db.seoAudits.length = 50;
        save();
        return ok(report);
      }
      if (p[1] === 'audits') return ok(db.seoAudits);
      break;
    }

    case 'stats': {
      if (p[1] === 'ticker' && p[2] === 'suggest' && method === 'POST') {
        const st = db.settings;
        if (!(st.provider === 'openai' && st.apiKey && st.baseUrl)) return ok([]);
        try {
          const b = db.brain;
          const r = await fetch(st.baseUrl.replace(/\/$/, '') + '/v1/chat/completions', {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: 'Bearer ' + st.apiKey },
            body: JSON.stringify({ model: st.model || 'auto', max_tokens: 300, messages: [
              { role: 'system', content: TICKER_SUGGEST_SYSTEM },
              { role: 'user', content: 'Suggest ticker KPIs for this business: ' + (b.businessName || 'a small business') + (b.industry ? ' (' + b.industry + ')' : '') + '.' },
            ] }),
            signal: AbortSignal.timeout(12000),
          });
          const d = await r.json();
          return ok(parseLabelLines(d?.choices?.[0]?.message?.content || ''));
        } catch { return ok([]); }
      }
      if (p[1] === 'ticker') return ok(buildTickerStats(db));
      if (p[1] === 'markets') {
        const st = db.settings;
        if (!(st.provider === 'openai' && st.apiKey && st.baseUrl)) return ok({ ok: false });
        try {
          const r = await fetch(st.baseUrl.replace(/\/$/, '') + '/helix/markets', {
            headers: { authorization: 'Bearer ' + st.apiKey }, signal: AbortSignal.timeout(10000),
          });
          const d = await r.json();
          if (d && typeof d.ok === 'boolean') return ok(d);
        } catch { /* fall through */ }
        return ok({ ok: false });
      }
      break;
    }

    case 'integrations': {
      if (p[1] === 'presets') return ok(PRESETS);
      if (p[1] === 'usage') return ok(usageSummary(db));
      if (!id && method === 'GET') return ok(db.integrations.map(redactIntegration));
      if (!id && method === 'POST') {
        const preset = PRESET_MAP[body.preset] || PRESET_MAP['custom-rest'];
        const baseUrl = String(body.baseUrl ?? preset.baseUrl ?? '').trim();
        if (!baseUrl && preset.type !== 'webhook') return bad('base URL is required');
        const integ = {
          id: uid(), name: String(body.name || preset.name).slice(0, 60), preset: preset.id,
          type: preset.type, category: preset.category, icon: preset.icon, baseUrl,
          testPath: String(body.testPath ?? preset.testPath ?? ''),
          auth: body.authKind ? { kind: body.authKind, name: body.authHeaderName || preset.auth?.name } : { ...preset.auth },
          extraHeaders: preset.extraHeaders || {},
          testMethod: body.testMethod || preset.testMethod || undefined,
          testBody: body.testBody !== undefined ? body.testBody : preset.testBody,
          authValue: body.secret !== undefined ? String(body.secret) : '',
          enabled: body.enabled !== false, lastTest: null, createdAt: Date.now(),
        };
        if (preset.urlIsSecret && body.secret) integ.baseUrl = String(body.secret);
        db.integrations.unshift(integ); save();
        return ok(redactIntegration(integ), 201);
      }
      const integ = db.integrations.find((x) => x.id === id);
      if (!integ) return notFound();
      if (p[2] === 'test' && method === 'POST') {
        // The sandboxed demo can't make cross-origin calls; report honestly.
        const result = { ok: false, status: 0, ms: 0, sandbox: true,
          detail: 'Saved. Live connection tests run in the installed app — the browser demo can’t make cross-origin calls.', at: Date.now() };
        integ.lastTest = result; save();
        return ok({ integration: redactIntegration(integ), result });
      }
      if (method === 'PATCH') {
        if (body.name !== undefined) integ.name = String(body.name).slice(0, 60);
        if (body.baseUrl !== undefined) integ.baseUrl = String(body.baseUrl).trim();
        if (body.testPath !== undefined) integ.testPath = String(body.testPath);
        if (body.enabled !== undefined) integ.enabled = !!body.enabled;
        if (body.authKind !== undefined) integ.auth = { kind: body.authKind, name: body.authHeaderName || integ.auth?.name };
        if (body.secret !== undefined && body.secret !== '') integ.authValue = String(body.secret);
        save();
        return ok(redactIntegration(integ));
      }
      if (method === 'DELETE') {
        db.integrations.splice(db.integrations.indexOf(integ), 1); save();
        return ok({ ok: true });
      }
      break;
    }

    case 'quickstart': {
      if (method === 'POST') {
        const name = clean(body.name, 80);
        const description = clean(body.description, 2000);
        if (!name.trim() || !description.trim()) return bad('name and description are required');
        const ctx = { store: { state: db, save }, ask: (helperId, message) => ask(helperId, message) };
        return ok(await runQuickstart(ctx, { name, description }));
      }
      break;
    }

    case 'agent': {
      const ctx = { store: { state: db, save }, ask: (helperId, message) => ask(helperId, message) };
      if (p[1] === 'tools') return ok(toolMeta());
      if (p[1] === 'act' && method === 'POST') {
        const tools = buildTools();
        if (!body.tool || !tools[body.tool]) return notFound(`unknown tool "${body.tool}"`);
        try { return ok({ tool: body.tool, result: await tools[body.tool].run(ctx, body.args || {}) }); }
        catch (e) { return bad(e.message); }
      }
      if (p[1] === 'run' && method === 'POST') {
        if (!body.goal || !String(body.goal).trim()) return bad('goal is required');
        const out = await runPlanner(ctx, { goal: clean(String(body.goal), 2000) });
        db.inbox.unshift({ id: uid(), title: `Autopilot ran: “${String(body.goal).slice(0, 60)}”`, body: out.summary.slice(0, 200), from: 'vizzy', read: false, documentId: null, createdAt: Date.now() });
        save();
        return ok(out);
      }
      break;
    }

    case 'analytics':
      return ok(analyticsSummary());

    case 'settings': {
      if (method === 'GET') return ok({ ...db.settings, apiKey: undefined, hasKey: !!db.settings.apiKey });
      if (method === 'PUT') {
        if (body.provider !== undefined && ['offline', 'anthropic', 'openai', 'ollama'].includes(body.provider)) db.settings.provider = body.provider;
        if (body.apiKey !== undefined) db.settings.apiKey = String(body.apiKey);
        if (body.model !== undefined) db.settings.model = String(body.model);
        if (body.baseUrl !== undefined) db.settings.baseUrl = String(body.baseUrl);
        save();
        return ok({ ...db.settings, apiKey: undefined, hasKey: !!db.settings.apiKey });
      }
      break;
    }

    case 'export':
      return ok(db);

    case 'import': {
      if (method === 'POST') {
        if (!body || typeof body !== 'object' || !body.brain || typeof body.brain !== 'object') {
          return bad('not a valid HELIX export');
        }
        const base = DEFAULTS();
        const next = {};
        for (const [k, def] of Object.entries(base)) {
          const v = body[k];
          if (Array.isArray(def)) next[k] = Array.isArray(v) ? v : def;
          else if (def && typeof def === 'object') next[k] = { ...def, ...(v && typeof v === 'object' && !Array.isArray(v) ? v : {}) };
          else next[k] = v ?? def;
        }
        db = next;
        for (const a of db.automations) if (a && a.schedule) a.nextRun = computeNextRun(a.schedule);
        save();
        return ok({ ok: true });
      }
      break;
    }
  }
  return notFound(`no route: ${method} ${pathname}`);
}

function exportZip(idOrSlug) {
  const site = db.sites.find((s) => s.id === idOrSlug || s.slug === idOrSlug);
  if (!site) return null;
  const { zip } = buildExport(site, db.brain);
  return { zip, filename: `${site.slug}-netlify.zip` };
}

return { handle, previewHTML, recordView, exportZip, exportJSON: () => JSON.stringify(db, null, 2) };
