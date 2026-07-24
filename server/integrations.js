// Integrations: a real bring-your-own-key connector framework. Each integration
// stores its own credentials locally and the app makes genuine authenticated
// requests to it. Presets are just pre-filled templates that activate once the
// user pastes a key — nothing is "pre-connected", which is the only honest model
// for a local, private app.

// Preset catalog. `auth.kind`: bearer | header | query | none.
export const PRESETS = [
  {
    id: 'openai', name: 'OpenAI', icon: '🧠', category: 'AI', type: 'rest',
    baseUrl: 'https://api.openai.com', testPath: '/v1/models',
    auth: { kind: 'bearer' }, keyLabel: 'API key', keyHint: 'sk-…',
    desc: 'Chat, embeddings, and models. Also usable as your AI provider in Settings.',
  },
  {
    id: 'anthropic', name: 'Anthropic (Claude)', icon: '✳️', category: 'AI', type: 'rest',
    baseUrl: 'https://api.anthropic.com', testPath: '/v1/models',
    auth: { kind: 'header', name: 'x-api-key' }, extraHeaders: { 'anthropic-version': '2023-06-01' },
    keyLabel: 'API key', keyHint: 'sk-ant-…',
    desc: 'Claude models for the highest-quality generation.',
  },
  {
    id: 'stripe', name: 'Stripe', icon: '💳', category: 'Payments', type: 'rest',
    baseUrl: 'https://api.stripe.com', testPath: '/v1/balance',
    auth: { kind: 'bearer' }, keyLabel: 'Secret key', keyHint: 'sk_live_… or sk_test_…',
    desc: 'Revenue, balances, customers, and payouts.',
  },
  {
    id: 'github', name: 'GitHub', icon: '🐙', category: 'Dev', type: 'rest',
    baseUrl: 'https://api.github.com', testPath: '/user',
    auth: { kind: 'bearer' }, extraHeaders: { 'X-GitHub-Api-Version': '2022-11-28' },
    keyLabel: 'Personal access token', keyHint: 'ghp_… or github_pat_…',
    desc: 'Repos, issues, and pull requests.',
  },
  {
    id: 'sendgrid', name: 'SendGrid', icon: '📧', category: 'Email', type: 'rest',
    baseUrl: 'https://api.sendgrid.com', testPath: '/v3/scopes',
    auth: { kind: 'bearer' }, keyLabel: 'API key', keyHint: 'SG.…',
    desc: 'Send the email campaigns Emmie writes.',
  },
  {
    id: 'hubspot', name: 'HubSpot', icon: '🟠', category: 'CRM', type: 'rest',
    baseUrl: 'https://api.hubapi.com', testPath: '/crm/v3/objects/contacts?limit=1',
    auth: { kind: 'bearer' }, keyLabel: 'Private app token', keyHint: 'pat-…',
    desc: 'Contacts, deals, and marketing data.',
  },
  {
    id: 'slack', name: 'Slack (Incoming Webhook)', icon: '💬', category: 'Notifications', type: 'webhook',
    baseUrl: 'https://hooks.slack.com/services/…', testPath: '',
    auth: { kind: 'none' }, keyLabel: 'Webhook URL', keyHint: 'https://hooks.slack.com/services/…',
    urlIsSecret: true,
    desc: 'Post updates and finished deliverables to a channel.',
  },
  {
    id: 'ollama', name: 'Ollama (local)', icon: '🦙', category: 'AI', type: 'rest',
    baseUrl: 'http://localhost:11434', testPath: '/api/tags',
    auth: { kind: 'none' }, keyLabel: 'No key needed', keyHint: '',
    desc: 'A fully local LLM. Zero cloud, zero cost.',
  },
  {
    id: 'figma', name: 'Figma', icon: '🎨', category: 'Design', type: 'rest',
    baseUrl: 'https://api.figma.com', testPath: '/v1/me',
    auth: { kind: 'header', name: 'X-Figma-Token' }, keyLabel: 'Personal access token', keyHint: 'figd_…',
    desc: 'Pull designs, components, and files into your workflow.',
  },
  {
    id: 'supabase', name: 'Supabase', icon: '🟢', category: 'Backend', type: 'rest',
    baseUrl: '', testPath: '/rest/v1/', auth: { kind: 'header', name: 'apikey' },
    keyLabel: 'anon or service key', keyHint: 'eyJ…', urlNote: 'https://YOUR-PROJECT.supabase.co',
    desc: 'Your database, auth, and storage backend. Set the base URL to your project URL.',
  },
  {
    id: 'vercel', name: 'Vercel', icon: '▲', category: 'Deploy', type: 'rest',
    baseUrl: 'https://api.vercel.com', testPath: '/v2/user',
    auth: { kind: 'bearer' }, keyLabel: 'Access token', keyHint: 'vercel token',
    desc: 'Deploy and manage the sites HELIX builds.',
  },
  {
    id: 'semrush', name: 'Semrush', icon: '📈', category: 'SEO', type: 'rest',
    baseUrl: 'https://api.semrush.com', testPath: '/',
    auth: { kind: 'query', name: 'key' }, keyLabel: 'API key', keyHint: '',
    desc: 'Keyword, backlink, and competitor intelligence.',
  },
  {
    id: 'windsor', name: 'Windsor.ai', icon: '🌬️', category: 'Analytics', type: 'rest',
    baseUrl: 'https://connectors.windsor.ai', testPath: '/all',
    auth: { kind: 'query', name: 'api_key' }, keyLabel: 'API key', keyHint: '',
    desc: 'Unified ads & analytics across 350+ sources (GA4, Meta, Google Ads…).',
  },
  {
    id: 'sentry', name: 'Sentry', icon: '🛡️', category: 'Monitoring', type: 'rest',
    baseUrl: 'https://sentry.io', testPath: '/api/0/',
    auth: { kind: 'bearer' }, keyLabel: 'Auth token', keyHint: 'sntrys_…',
    desc: 'Error and performance monitoring for your live sites.',
  },
  {
    id: 'notion', name: 'Notion', icon: '📔', category: 'Docs', type: 'rest',
    baseUrl: 'https://api.notion.com', testPath: '/v1/users/me',
    auth: { kind: 'bearer' }, extraHeaders: { 'Notion-Version': '2022-06-28' },
    keyLabel: 'Integration secret', keyHint: 'secret_… / ntn_…',
    desc: 'Sync docs, wikis, and knowledge into your Brain.',
  },
  {
    id: 'airtable', name: 'Airtable', icon: '🗃️', category: 'Data', type: 'rest',
    baseUrl: 'https://api.airtable.com', testPath: '/v0/meta/whoami',
    auth: { kind: 'bearer' }, keyLabel: 'Personal access token', keyHint: 'pat…',
    desc: 'Spreadsheet-database for customers, content, and pipelines.',
  },
  {
    id: 'shopify', name: 'Shopify', icon: '🛍️', category: 'E-commerce', type: 'rest',
    baseUrl: '', testPath: '/admin/api/2024-01/shop.json',
    auth: { kind: 'header', name: 'X-Shopify-Access-Token' },
    keyLabel: 'Admin API token', keyHint: 'shpat_…', urlNote: 'https://YOUR-STORE.myshopify.com',
    desc: 'Products, orders, and customers. Set the base URL to your store domain.',
  },
  {
    id: 'mailchimp', name: 'Mailchimp', icon: '🐵', category: 'Email', type: 'rest',
    baseUrl: '', testPath: '/3.0/ping', auth: { kind: 'bearer' },
    keyLabel: 'API key', keyHint: 'key-usXX', urlNote: 'https://usXX.api.mailchimp.com',
    desc: 'Audiences and email automation. Base URL is https://<dc>.api.mailchimp.com.',
  },
  {
    id: 'make', name: 'Make (webhook)', icon: '🔧', category: 'Automation', type: 'webhook',
    baseUrl: '', testPath: '', auth: { kind: 'none' }, keyLabel: 'Webhook URL', keyHint: 'https://hook.…make.com/…',
    urlIsSecret: false,
    desc: 'Trigger Make / Zapier / n8n scenarios with your data.',
  },
  {
    id: 'x-twitter', name: 'X (Twitter)', icon: '𝕏', category: 'Social', type: 'rest',
    baseUrl: 'https://api.x.com', testPath: '/2/users/me',
    auth: { kind: 'bearer' }, keyLabel: 'OAuth 2.0 access token (or app bearer)', keyHint: '',
    desc: 'Automate posting and read your account — Soshie’s drafts, actually published.',
  },
  {
    id: 'meta', name: 'Meta (Facebook & Instagram)', icon: '📘', category: 'Social', type: 'rest',
    baseUrl: 'https://graph.facebook.com', testPath: '/v19.0/me',
    auth: { kind: 'query', name: 'access_token' }, keyLabel: 'Graph API access token', keyHint: 'EAAG…',
    desc: 'Pages and Instagram publishing via the Graph API — automate social marketing.',
  },
  {
    id: 'linkedin', name: 'LinkedIn', icon: '💼', category: 'Social', type: 'rest',
    baseUrl: 'https://api.linkedin.com', testPath: '/v2/userinfo',
    auth: { kind: 'bearer' }, keyLabel: 'OAuth 2.0 access token', keyHint: '',
    desc: 'Share posts and read profile data for B2B marketing automation.',
  },
  {
    id: 'firecrawl', name: 'FireCrawl', icon: '🔥', category: 'Research', type: 'rest',
    baseUrl: 'https://api.firecrawl.dev', testPath: '/v1/team/credit-usage',
    auth: { kind: 'bearer' }, keyLabel: 'API key', keyHint: 'fc-…',
    desc: 'Scrape and crawl any site into clean data — deep research for your team.',
  },
  {
    id: 'perplexity', name: 'Perplexity', icon: '🔮', category: 'Research', type: 'rest',
    baseUrl: 'https://api.perplexity.ai', testPath: '/chat/completions',
    testMethod: 'POST', testBody: { model: 'sonar', max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] },
    auth: { kind: 'bearer' }, keyLabel: 'API key', keyHint: 'pplx-…',
    desc: 'Sourced, cited web research on demand.',
  },
  {
    id: 'apify', name: 'Apify', icon: '🕷️', category: 'Research', type: 'rest',
    baseUrl: 'https://api.apify.com', testPath: '/v2/users/me',
    auth: { kind: 'bearer' }, keyLabel: 'API token', keyHint: 'apify_api_…',
    desc: 'Thousands of ready-made scrapers (Actors) for web data extraction.',
  },
  {
    id: 'resend', name: 'Resend', icon: '📮', category: 'Email', type: 'rest',
    baseUrl: 'https://api.resend.com', testPath: '/domains',
    auth: { kind: 'bearer' }, keyLabel: 'API key', keyHint: 're_…',
    desc: 'Modern email sending for the campaigns Emmie writes.',
  },
  {
    id: 'brevo', name: 'Brevo', icon: '💚', category: 'Email', type: 'rest',
    baseUrl: 'https://api.brevo.com', testPath: '/v3/account',
    auth: { kind: 'header', name: 'api-key' }, keyLabel: 'API key', keyHint: 'xkeysib-…',
    desc: 'Email + SMS campaigns, contacts, and automation.',
  },
  {
    id: 'pagespeed', name: 'Google PageSpeed', icon: '🚦', category: 'SEO', type: 'rest',
    baseUrl: 'https://www.googleapis.com', testPath: '/pagespeedonline/v5/runPagespeed?url=https%3A%2F%2Fexample.com',
    auth: { kind: 'query', name: 'key' }, keyLabel: 'API key', keyHint: 'AIza…',
    desc: 'Real Core Web Vitals + performance scores to pair with HELIX SEO audits.',
  },
  {
    id: 'discord', name: 'Discord (Webhook)', icon: '🎮', category: 'Notifications', type: 'webhook',
    baseUrl: 'https://discord.com/api/webhooks/…', testPath: '',
    auth: { kind: 'none' }, keyLabel: 'Webhook URL', keyHint: 'https://discord.com/api/webhooks/…',
    urlIsSecret: true, testBody: { content: '✅ HELIX connection test' },
    desc: 'Post team updates and finished deliverables to a channel.',
  },
  {
    id: 'custom-rest', name: 'Custom REST API', icon: '🔗', category: 'Custom', type: 'rest',
    baseUrl: '', testPath: '/', auth: { kind: 'bearer' }, keyLabel: 'Token (optional)', keyHint: '',
    desc: 'Any HTTP JSON API. You set the base URL, auth, and a health path.',
  },
  {
    id: 'custom-webhook', name: 'Custom Webhook', icon: '🪝', category: 'Custom', type: 'webhook',
    baseUrl: '', testPath: '', auth: { kind: 'none' }, keyLabel: 'Webhook URL', keyHint: 'https://…',
    urlIsSecret: false,
    desc: 'Fire a JSON payload at any URL (Zapier, Make, n8n, your own server).',
  },
  {
    id: 'custom-mcp', name: 'Custom MCP Server', icon: '🧩', category: 'Custom', type: 'mcp',
    baseUrl: '', testPath: '', auth: { kind: 'bearer' }, keyLabel: 'Token (optional)', keyHint: '',
    desc: 'A Model Context Protocol server (HTTP/JSON-RPC). Exposes its tools to your team.',
  },
];

export const PRESET_MAP = Object.fromEntries(PRESETS.map((p) => [p.id, p]));

const TIMEOUT_MS = 12_000;

function mask(value) {
  if (!value) return '';
  const s = String(value);
  if (s.length <= 4) return '••••';
  return '••••' + s.slice(-4);
}

// Public (redacted) view — a secret value is NEVER returned to the client.
export function redactIntegration(i) {
  return {
    id: i.id, name: i.name, preset: i.preset, type: i.type, category: i.category,
    icon: i.icon, baseUrl: i.baseUrl, testPath: i.testPath, authKind: i.auth?.kind,
    authHeaderName: i.auth?.name, enabled: i.enabled,
    hasSecret: !!i.authValue, secretHint: mask(i.authValue),
    lastTest: i.lastTest || null, createdAt: i.createdAt,
    usage: i.usage || { calls: 0, ok: 0, failed: 0, totalMs: 0, lastUsed: null, lastStatus: null },
  };
}

// Usage tracking: metadata only (method, path, status, latency) — never keys,
// never request/response bodies. Counters live on the integration; a bounded
// recent-activity log lives on state.usageLog.
export function trackUsage(state, integ, { method = 'GET', path = '', status = 0, ok = false, ms = 0, via = 'app' }) {
  integ.usage ??= { calls: 0, ok: 0, failed: 0, totalMs: 0, lastUsed: null, lastStatus: null };
  integ.usage.calls += 1;
  if (ok) integ.usage.ok += 1; else integ.usage.failed += 1;
  integ.usage.totalMs += ms;
  integ.usage.lastUsed = Date.now();
  integ.usage.lastStatus = status;
  state.usageLog ??= [];
  state.usageLog.unshift({ integration: integ.name, method, path: String(path).split('?')[0].slice(0, 120), status, ok, ms, via, at: Date.now() });
  if (state.usageLog.length > 200) state.usageLog.length = 200;
}

export function usageSummary(state) {
  const totals = { calls: 0, ok: 0, failed: 0 };
  for (const i of state.integrations || []) {
    const u = i.usage;
    if (!u) continue;
    totals.calls += u.calls; totals.ok += u.ok; totals.failed += u.failed;
  }
  return { totals, recent: (state.usageLog || []).slice(0, 20) };
}

function buildRequest(i, pathOverride) {
  const headers = { ...(i.extraHeaders || {}) };
  let url = (i.baseUrl || '').replace(/\/$/, '') + (pathOverride ?? i.testPath ?? '');
  const kind = i.auth?.kind;
  if (i.authValue) {
    if (kind === 'bearer') headers['Authorization'] = `Bearer ${i.authValue}`;
    else if (kind === 'header' && i.auth.name) headers[i.auth.name] = i.authValue;
    else if (kind === 'query' && i.auth.name) {
      url += (url.includes('?') ? '&' : '?') + `${encodeURIComponent(i.auth.name)}=${encodeURIComponent(i.authValue)}`;
    }
  }
  return { url, headers };
}

// A general authenticated call through a registered integration. Bounded to
// the host the user configured — the agent can only reach services the user
// explicitly connected, never arbitrary URLs.
export async function callIntegration(i, { method = 'GET', path = '', body } = {}) {
  const started = Date.now();
  let url, headers;
  if (i.type === 'webhook') {
    url = i.baseUrl; headers = { 'content-type': 'application/json' };
    method = 'POST';
  } else {
    const r = buildRequest(i, path);
    url = r.url; headers = { ...r.headers };
    if (body !== undefined) headers['content-type'] = 'application/json';
  }
  if (!/^https?:\/\//i.test(url)) throw new Error('integration has no valid base URL');
  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text.slice(0, 4000); }
  return { ok: res.ok, status: res.status, ms: Date.now() - started, data };
}

// A genuine authenticated request. For webhooks/mcp we POST a small probe;
// for REST we GET the health path. Returns a structured, non-secret result.
export async function testIntegration(i) {
  const started = Date.now();
  try {
    let url, headers, method, body;
    if (i.type === 'webhook') {
      url = i.baseUrl;
      headers = { 'content-type': 'application/json' };
      method = 'POST';
      body = JSON.stringify(i.testBody || { text: '✅ HELIX connection test' });
    } else if (i.type === 'mcp') {
      const r = buildRequest(i, '');
      url = r.url; headers = { ...r.headers, 'content-type': 'application/json' };
      method = 'POST';
      body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
    } else {
      const r = buildRequest(i);
      url = r.url; headers = r.headers;
      method = i.testMethod || 'GET';
      if (i.testBody !== undefined && method !== 'GET') {
        headers['content-type'] = 'application/json';
        body = JSON.stringify(i.testBody);
      }
    }
    if (!/^https?:\/\//i.test(url)) throw new Error('base URL must start with http(s)://');
    const res = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const ms = Date.now() - started;
    // 2xx = healthy; 401/403 = reachable but the key is wrong (still useful signal)
    const ok = res.ok;
    const detail = ok ? 'Connected' : res.status === 401 || res.status === 403
      ? `Reachable, but the credential was rejected (HTTP ${res.status})`
      : `Reachable — HTTP ${res.status}`;
    return { ok, status: res.status, ms, detail, at: Date.now() };
  } catch (err) {
    return { ok: false, status: 0, ms: Date.now() - started, detail: err.message || 'connection failed', at: Date.now() };
  }
}
