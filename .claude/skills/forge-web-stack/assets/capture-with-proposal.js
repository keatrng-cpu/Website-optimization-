// forge-capture.js
// Forge Local — website-agency intake capture + AI proposal.
// Takes the wizard answers, has Claude draft a tailored website proposal (prose +
// recommendations only — no invented prices stated as fact), saves everything to
// Airtable, and returns the proposal to show on screen. Save-first, enrich-second:
// the lead is never lost even if the model is slow.

'use strict';

const ANTHROPIC_VERSION = '2023-06-01';
const MODELS_URL = 'https://api.anthropic.com/v1/models?limit=100';
const MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
const FALLBACK_MODEL = 'claude-sonnet-4-20250514';
const AIRTABLE_BASE_URL = 'https://api.airtable.com/v0/';
const TABLE = 'ForgeLocal_Intake';

const REQUEST_TOKENS = 900;
const MAX_OUTPUT_TOKENS = 1100;
const HANDLER_BUDGET_MS = 9200;
const DISCOVERY_BUDGET_MS = 2500;
const CREATE_TIMEOUT_MS = 3500;
const UPDATE_RESERVE_MS = 1800;
const MAX_BODY_CHARS = 200000;

const HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff'
};

function fetchWithTimeout(url, options, timeoutMs) {
  const c = new AbortController();
  const t = setTimeout(function () { c.abort(); }, Math.max(1, timeoutMs));
  return fetch(url, Object.assign({}, options, { signal: c.signal })).finally(function () { clearTimeout(t); });
}
function createdMs(m) {
  if (!m) return 0;
  const c = m.created_at;
  if (typeof c === 'number') return c > 1e12 ? c : c * 1000;
  const t = Date.parse(c || ''); return isNaN(t) ? 0 : t;
}
function clean(v, max) {
  if (v === undefined || v === null) return '';
  if (typeof v !== 'string' && typeof v !== 'number') return '';
  const src = String(v); let s = '';
  for (let i = 0; i < src.length; i++) {
    const c = src.charCodeAt(i);
    if (c === 9 || c === 10 || c === 13) { s += ' '; continue; }
    if (c < 32 || c === 127) continue;
    s += src[i];
  }
  s = s.replace(/\s+/g, ' ').trim();
  if (max && s.length > max) s = s.slice(0, max);
  return s;
}

let cachedModel = null;
async function pickModel(key, deadline) {
  if (process.env.ANTHROPIC_MODEL) return process.env.ANTHROPIC_MODEL;
  if (cachedModel) return cachedModel;
  try {
    const now = Date.now();
    const budget = Math.min(DISCOVERY_BUDGET_MS, (deadline || (now + DISCOVERY_BUDGET_MS)) - now);
    if (budget > 250) {
      const r = await fetchWithTimeout(MODELS_URL, { headers: { 'x-api-key': key, 'anthropic-version': ANTHROPIC_VERSION } }, budget);
      if (r.ok) {
        const d = await r.json();
        const s = (d && Array.isArray(d.data) ? d.data : []).filter(function (m) { return m && typeof m.id === 'string' && /sonnet/i.test(m.id); });
        s.sort(function (a, b) { return createdMs(b) - createdMs(a); });
        if (s.length) { cachedModel = s[0].id; return cachedModel; }
      }
    }
  } catch (e) {}
  return FALLBACK_MODEL;
}
async function callClaude(key, system, messages, deadline) {
  const model = await pickModel(key, deadline);
  const remaining = deadline - Date.now();
  if (remaining <= 300) throw new Error('budget exhausted');
  const r = await fetchWithTimeout(MESSAGES_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': ANTHROPIC_VERSION },
    body: JSON.stringify({ model: model, max_tokens: Math.min(REQUEST_TOKENS, MAX_OUTPUT_TOKENS), system: system, messages: messages })
  }, remaining);
  if (!r.ok) throw new Error('anthropic ' + r.status);
  const d = await r.json();
  return (d && d.content && d.content[0] && d.content[0].text) || '';
}

// Turn the answers object into a readable facts block (cap each value).
function factsFrom(a) {
  const order = [
    ['name', 'Name'], ['business_name', 'Business'], ['role', 'Their role'],
    ['industry', 'Industry / what they do'], ['offering', 'Main products/services'],
    ['customer', 'Ideal customer'], ['location', 'Service area'], ['years', 'Years in business'],
    ['differentiator', 'What makes them different'],
    ['has_site', 'Has a website'], ['current_url', 'Current site'], ['current_pain', "What's wrong / missing today"],
    ['get_customers', 'How they get customers now'], ['online_presence', 'Existing online presence'],
    ['site_type', 'Website type wanted'], ['pages', 'Pages needed'], ['features', 'Must-have features'],
    ['style', 'Design style'], ['colors', 'Brand colors / logo'], ['inspiration', 'Sites they like'],
    ['goal', 'Primary goal'], ['success', 'What success looks like'], ['timeline', 'Timeline'],
    ['budget', 'Budget range'], ['content_ready', 'Content/assets ready'], ['domain', 'Owns a domain']
  ];
  const lines = [];
  for (let i = 0; i < order.length; i++) {
    const v = clean(a[order[i][0]], 400);
    if (v) lines.push(order[i][1] + ': ' + v);
  }
  return lines.join('\n');
}

async function proposal(key, a, deadline) {
  if (!key) return '';
  const system = [
    'You are the senior strategist at Forge Local, a website-and-marketing studio for local service businesses. A prospect just completed an intake. Write them a sharp, specific website proposal in their own context.',
    'Voice: confident, plain, grounded, no hype or filler. Forge brand — gritty and competent. Address them by first name if given.',
    'Structure with short markdown-free sections separated by blank lines, using ALL-CAPS mini-headers on their own line:',
    'THE READ  — 2-3 sentences on their situation and the core job the site must do.',
    'RECOMMENDED SITE — the site type and a tight page/section map (bullet each page with a dash).',
    'KEY FEATURES — the specific features that serve their goal (dash bullets).',
    'DESIGN DIRECTION — 2-3 sentences on look/feel matched to their brand + audience.',
    'FIRST 3 MOVES — the first three concrete steps to launch (dash bullets).',
    'Hard rules: Use ONLY what they provided; do not invent facts about their business. Do NOT state any specific price, package cost, or guaranteed result/ranking as fact (you may reference their own stated budget/timeline). No legal, tax, or financial advice. Keep it ~250-400 words, useful enough that it is valuable even if they never buy.'
  ].join('\n');
  const facts = factsFrom(a);
  const raw = await callClaude(key, system, [{ role: 'user', content: 'Draft the proposal from this intake. Use only these fields:\n\n' + facts + '\n\nWrite the proposal only.' }], deadline);
  return clean(raw, 4000);
}

async function airtable(method, urlSuffix, fields, timeoutMs) {
  const token = process.env.AIRTABLE_TOKEN, base = process.env.AIRTABLE_BASE_ID;
  if (!token || !base) return { ok: false, reason: 'not_configured' };
  const url = AIRTABLE_BASE_URL + base + '/' + encodeURIComponent(TABLE) + (urlSuffix || '');
  try {
    const r = await fetchWithTimeout(url, {
      method: method,
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(method === 'POST' ? { fields: fields, typecast: true } : { fields: fields })
    }, timeoutMs);
    if (!r.ok) { let d = ''; try { d = (await r.text()).slice(0, 200); } catch (e) {} console.error('forge airtable ' + r.status + ' ' + d); return { ok: false, reason: 'airtable_' + r.status }; }
    const j = await r.json(); return { ok: true, id: j && j.id };
  } catch (e) { console.error('forge airtable err', e && e.message); return { ok: false, reason: 'error' }; }
}

exports.handler = async (event) => {
  const deadline = Date.now() + HANDLER_BUDGET_MS;
  const remain = function () { return deadline - Date.now(); };

  if (!event || event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: Object.assign({}, HEADERS, { Allow: 'POST' }), body: JSON.stringify({ ok: false, error: 'Use POST.' }) };
  }
  let input;
  try {
    let raw = event.body || '';
    if (event.isBase64Encoded) { try { raw = Buffer.from(raw, 'base64').toString('utf8'); } catch (e) {} }
    if (raw.length > MAX_BODY_CHARS) return { statusCode: 413, headers: HEADERS, body: JSON.stringify({ ok: false, error: 'Too large.' }) };
    input = JSON.parse(raw || '{}');
    if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new Error('shape');
  } catch (e) { return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ ok: false, error: 'Invalid JSON.' }) }; }

  const a = (input.answers && typeof input.answers === 'object') ? input.answers : input;
  const name = clean(a.name, 120);
  const email = clean(a.email, 160);
  if (!name && !email) return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ ok: false, error: 'Name or email required.' }) };

  const paid = input.tier === 'Paid';
  const fields = {
    Tier: paid ? 'Paid' : 'Prospect', Status: 'New', Created: new Date().toISOString(),
    Answers_JSON: clean(JSON.stringify(a), 90000)
  };
  if (name) fields.Name = name; else fields.Name = email;
  if (email) fields.Email = email;
  if (clean(a.phone, 40)) fields.Phone = clean(a.phone, 40);
  if (clean(a.business_name, 160)) fields.Business_Name = clean(a.business_name, 160);
  if (clean(a.industry, 160)) fields.Industry = clean(a.industry, 160);
  if (clean(a.site_type, 120)) fields.Website_Type = clean(a.site_type, 120);
  if (clean(a.current_url, 300)) fields.Current_URL = clean(a.current_url, 300);
  if (clean(a.goal, 160)) fields.Primary_Goal = clean(a.goal, 160);
  if (clean(a.style, 160)) fields.Design_Style = clean(a.style, 160);
  if (clean(a.timeline, 120)) fields.Timeline = clean(a.timeline, 120);
  if (clean(a.budget, 120)) fields.Budget = clean(a.budget, 120);

  // 1) Save the lead first (critical path).
  const created = await airtable('POST', '', fields, Math.min(CREATE_TIMEOUT_MS, Math.max(600, remain())));

  // 2) Best-effort proposal, then patch it on.
  let prop = '';
  try {
    const key = process.env.ANTHROPIC_API_KEY;
    prop = await proposal(key, a, Date.now() + Math.max(0, remain() - UPDATE_RESERVE_MS));
  } catch (e) { console.error('forge proposal fail', e && e.message); }

  if (created.ok && created.id && prop) {
    await airtable('PATCH', '/' + created.id, { AI_Proposal: prop }, Math.min(UPDATE_RESERVE_MS + 500, Math.max(0, remain())));
  }

  return {
    statusCode: 200, headers: HEADERS,
    body: JSON.stringify({
      ok: true, saved: created.ok, tier: fields.Tier,
      proposal: prop || '',
      message: created.ok ? 'Captured.' : 'Saved for manual follow-up.'
    })
  };
};
