// JSON-file persistence with atomic writes and debounced flushing.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DEFAULTS = () => ({
  brain: {
    businessName: '',
    tagline: '',
    industry: '',
    description: '',
    audience: '',
    tone: 'friendly and professional',
    products: '',
    goals: '',
    website: '',
    location: '',
  },
  knowledge: [],   // { id, title, content, createdAt }
  chats: [],       // { id, helperId, title, createdAt, messages: [{role, content, at}] }
  tasks: [],       // { id, title, notes, status, helperId, priority, createdAt, deliverableId }
  documents: [],   // { id, title, kind, helperId, content, createdAt, source }
  automations: [], // { id, name, helperId, prompt, kind, schedule:{type:'interval'|'daily', minutes, time}, enabled, lastRun, nextRun, runs }
  sites: [],       // { id, name, slug, palette, sections:[...], createdAt, updatedAt, published }
  calendar: [],    // { id, platform, content, date, status, helperId, createdAt }
  emails: [],      // { id, subject, preheader, body, audience, status, createdAt }
  seoAudits: [],   // { id, target, score, checks, createdAt }
  analytics: [],   // { siteSlug, path, day, count }
  inbox: [],       // { id, title, body, from, read, createdAt, documentId }
  integrations: [],// { id, name, preset, type, category, icon, baseUrl, testPath, auth, extraHeaders, authValue, enabled, lastTest, createdAt }
  settings: {
    provider: 'offline', // offline | anthropic | openai | ollama
    apiKey: '',
    model: '',
    baseUrl: '',
  },
});

export function uid() {
  return crypto.randomBytes(8).toString('hex');
}

export function createStore(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const file = path.join(dataDir, 'db.json');
  let state = DEFAULTS();

  // Coerce arbitrary input into a valid state shape: every array field must be
  // an array and every object field an object, or later code falls over.
  function normalize(input) {
    const base = DEFAULTS();
    const next = {};
    for (const [key, def] of Object.entries(base)) {
      const val = input?.[key];
      if (Array.isArray(def)) next[key] = Array.isArray(val) ? val : def;
      else if (def && typeof def === 'object') {
        next[key] = { ...def, ...(val && typeof val === 'object' && !Array.isArray(val) ? val : {}) };
      } else next[key] = val ?? def;
    }
    return next;
  }

  if (fs.existsSync(file)) {
    try {
      state = normalize(JSON.parse(fs.readFileSync(file, 'utf8')));
    } catch {
      // corrupted db: keep defaults, back the old file up
      try { fs.renameSync(file, file + '.corrupt-' + Date.now()); } catch {}
    }
  }

  let timer = null;
  function flush() {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, file);
  }
  function save() {
    if (timer) return;
    timer = setTimeout(() => { timer = null; try { flush(); } catch (e) { console.error('store flush failed:', e.message); } }, 150);
  }
  function replace(next) {
    state = normalize(next);
    save();
  }

  return {
    get state() { return state; },
    save,
    flush,
    replace,
    close() { if (timer) { clearTimeout(timer); timer = null; } try { flush(); } catch {} },
  };
}
