// desk-data.js
// PANTHEON phone command center — read-only aggregator over the Hive Mind Airtable base.
// Passcode-gated (x-desk-key header). Never writes. Never places trades. No key/PII in URLs.
//
// Returns a compact snapshot of: Heartbeat (KPIs, unresolved Alerts, News),
// Trade Desk (open Trades, latest SMC setup board, latest weekly stats),
// and Mind (open escalations, ventures, recent cash) — plus a freshness stamp
// so a stale heartbeat (laptop off) is obvious on the phone.

'use strict';

const AIRTABLE_BASE_URL = 'https://api.airtable.com/v0/';
const GET_TIMEOUT_MS = 3500;
const CHUNK = 4;            // Airtable allows 5 req/sec/base — stay under it
const CHUNK_GAP_MS = 1100;

// Env override wins; this default lets it work on a manual (Netlify Drop) deploy.
const DESK_KEY = process.env.DESK_KEY || 'CHANGE_ME_PASSCODE';

const TABLES = {
  briefings: 'Desk_Briefings',
  kpis: 'KPIs',
  alerts: 'Alerts',
  trades: 'Trades',
  weekly: 'Weekly Reviews',
  news: 'News_Feed',
  ventures: 'Ventures',
  tasks: 'Tasks_Escalations',
  cash: 'Cash_Events'
};

const HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff'
};

function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(function () { controller.abort(); }, Math.max(1, timeoutMs));
  return fetch(url, Object.assign({}, options, { signal: controller.signal }))
    .finally(function () { clearTimeout(timer); });
}

// Constant-ish time string compare.
function safeEqual(a, b) {
  a = String(a || ''); b = String(b || '');
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= (a.charCodeAt(i) ^ b.charCodeAt(i));
  return out === 0;
}

function qs(params) {
  const parts = [];
  (params.fields || []).forEach(function (f) { parts.push('fields%5B%5D=' + encodeURIComponent(f)); });
  if (params.sortField) {
    parts.push('sort%5B0%5D%5Bfield%5D=' + encodeURIComponent(params.sortField));
    parts.push('sort%5B0%5D%5Bdirection%5D=' + encodeURIComponent(params.sortDir || 'desc'));
  }
  parts.push('pageSize=' + (params.pageSize || 10));
  return parts.join('&');
}

async function airtableGet(token, base, table, params) {
  const url = AIRTABLE_BASE_URL + base + '/' + encodeURIComponent(table) + '?' + qs(params);
  const r = await fetchWithTimeout(url, { headers: { Authorization: 'Bearer ' + token } }, GET_TIMEOUT_MS);
  if (!r.ok) throw new Error(table + ' ' + r.status);
  const d = await r.json();
  return (d && Array.isArray(d.records)) ? d.records : [];
}

function f(rec, name) {
  const v = rec && rec.fields ? rec.fields[name] : undefined;
  return (v === undefined || v === null) ? '' : v;
}

function notIn(v, list) {
  const s = String(v || '').toLowerCase();
  for (let i = 0; i < list.length; i++) if (s === list[i]) return false;
  return true;
}

exports.handler = async (event) => {
  if (!event || (event.httpMethod !== 'GET' && event.httpMethod !== 'POST')) {
    return { statusCode: 405, headers: Object.assign({}, HEADERS, { Allow: 'GET' }),
      body: JSON.stringify({ ok: false, error: 'Use GET.' }) };
  }

  // ---- passcode gate ----
  const provided = (event.headers && (event.headers['x-desk-key'] || event.headers['X-Desk-Key'])) || '';
  if (!safeEqual(provided, DESK_KEY)) {
    return { statusCode: 401, headers: HEADERS, body: JSON.stringify({ ok: false, error: 'Locked.' }) };
  }

  const token = process.env.AIRTABLE_TOKEN;
  const base = process.env.AIRTABLE_BASE_ID;
  if (!token || !base) {
    return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ ok: false, error: 'Data source not configured.' }) };
  }

  const get = function (table, params) { return airtableGet(token, base, table, params); };
  const sleep = function (ms) { return new Promise(function (res) { setTimeout(res, ms); }); };

  // Deferred thunks so nothing fires until its wave — keeps us under Airtable's rate limit.
  const jobDefs = [
    ['briefings', function () { return get(TABLES.briefings, { fields: ['Title', 'Type', 'Date', 'Summary', 'Body', 'Journal', 'Created'], sortField: 'Created', sortDir: 'desc', pageSize: 8 }); }],
    ['kpis', function () { return get(TABLES.kpis, { fields: ['Week_Of', 'Business', 'Metric', 'Value', 'Target'], sortField: 'Week_Of', sortDir: 'desc', pageSize: 10 }); }],
    ['alerts', function () { return get(TABLES.alerts, { fields: ['Rule', 'Business', 'Severity', 'Detail', 'Status', 'Created', 'Setups'], sortField: 'Created', sortDir: 'desc', pageSize: 15 }); }],
    ['trades', function () { return get(TABLES.trades, { fields: ['Trade', 'Instrument', 'Direction', 'Account', 'Entry', 'Stop', 'Target', 'Planned R', 'Realized R', 'Status', 'Entry Time'], sortField: 'Entry Time', sortDir: 'desc', pageSize: 20 }); }],
    ['weekly', function () { return get(TABLES.weekly, { fields: ['Week', 'Trades', 'Net R', 'Win Rate', 'Expectancy R', 'Profit Factor', 'Discipline Score', 'Period Start'], sortField: 'Period Start', sortDir: 'desc', pageSize: 1 }); }],
    ['news', function () { return get(TABLES.news, { fields: ['Headline', 'Category', 'Lobe', 'Grade', 'Why', 'Stamp'], pageSize: 6 }); }],
    ['ventures', function () { return get(TABLES.ventures, { fields: ['Name', 'Verdict', 'Price', 'Revenue', 'Passivity', 'Speed', 'Moat', 'Status'], sortField: 'Revenue', sortDir: 'desc', pageSize: 8 }); }],
    ['tasks', function () { return get(TABLES.tasks, { fields: ['Title', 'Business', 'Priority', 'Status', 'Due'], sortField: 'Due', sortDir: 'asc', pageSize: 20 }); }],
    ['cash', function () { return get(TABLES.cash, { fields: ['Date', 'Business', 'Type', 'Amount', 'Category'], sortField: 'Date', sortDir: 'desc', pageSize: 30 }); }]
  ];

  const R = {};
  const degradedKeys = [];
  for (let start = 0; start < jobDefs.length; start += CHUNK) {
    const wave = jobDefs.slice(start, start + CHUNK);
    const settled = await Promise.allSettled(wave.map(function (d) { return d[1](); }));
    wave.forEach(function (d, i) {
      if (settled[i].status === 'fulfilled') { R[d[0]] = settled[i].value; }
      else { R[d[0]] = []; degradedKeys.push(d[0]); }
    });
    if (start + CHUNK < jobDefs.length) await sleep(CHUNK_GAP_MS);
  }

  // ---- shape sections ----
  const kpis = R.kpis.slice(0, 8).map(function (r) {
    return { metric: f(r, 'Metric'), value: f(r, 'Value'), target: f(r, 'Target'), business: f(r, 'Business') };
  });

  const alerts = R.alerts
    .filter(function (r) { return notIn(f(r, 'Status'), ['resolved', 'closed', 'done']); })
    .slice(0, 10)
    .map(function (r) {
      return { rule: f(r, 'Rule'), severity: f(r, 'Severity'), detail: String(f(r, 'Detail')).slice(0, 240), status: f(r, 'Status'), created: f(r, 'Created'), business: f(r, 'Business') };
    });

  // Latest SMC setup board: newest Alerts row carrying a Setups JSON blob.
  let setups = [];
  for (let i = 0; i < R.alerts.length; i++) {
    const raw = f(R.alerts[i], 'Setups');
    if (raw && String(raw).trim()) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) { setups = parsed.slice(0, 8); break; }
        if (parsed && typeof parsed === 'object') { setups = [parsed]; break; }
      } catch (e) { /* keep looking */ }
    }
  }

  const openTrades = R.trades
    .filter(function (r) { return String(f(r, 'Status')).toLowerCase().indexOf('open') !== -1; })
    .slice(0, 8)
    .map(function (r) {
      return { trade: f(r, 'Trade'), instrument: f(r, 'Instrument'), direction: f(r, 'Direction'), account: f(r, 'Account'), entry: f(r, 'Entry'), stop: f(r, 'Stop'), target: f(r, 'Target'), plannedR: f(r, 'Planned R'), entryTime: f(r, 'Entry Time') };
    });

  const recentTrades = R.trades.slice(0, 6).map(function (r) {
    return { trade: f(r, 'Trade'), instrument: f(r, 'Instrument'), direction: f(r, 'Direction'), status: f(r, 'Status'), realizedR: f(r, 'Realized R'), entryTime: f(r, 'Entry Time') };
  });

  let weekly = null;
  if (R.weekly.length) {
    const w = R.weekly[0];
    weekly = { week: f(w, 'Week'), trades: f(w, 'Trades'), netR: f(w, 'Net R'), winRate: f(w, 'Win Rate'), expectancyR: f(w, 'Expectancy R'), profitFactor: f(w, 'Profit Factor'), discipline: f(w, 'Discipline Score') };
  }

  const news = R.news.slice(0, 6).map(function (r) {
    return { headline: f(r, 'Headline'), category: f(r, 'Category'), lobe: f(r, 'Lobe'), grade: f(r, 'Grade'), why: String(f(r, 'Why')).slice(0, 200) };
  });

  const ventures = R.ventures.slice(0, 6).map(function (r) {
    return { name: f(r, 'Name'), verdict: f(r, 'Verdict'), price: f(r, 'Price'), revenue: f(r, 'Revenue'), passivity: f(r, 'Passivity'), speed: f(r, 'Speed'), moat: f(r, 'Moat'), status: f(r, 'Status') };
  });

  const tasks = R.tasks
    .filter(function (r) { return notIn(f(r, 'Status'), ['done', 'complete', 'completed', 'closed', 'resolved']); })
    .slice(0, 10)
    .map(function (r) {
      return { title: f(r, 'Title'), business: f(r, 'Business'), priority: f(r, 'Priority'), status: f(r, 'Status'), due: f(r, 'Due') };
    });

  const cashEvents = R.cash.slice(0, 8).map(function (r) {
    return { date: f(r, 'Date'), type: f(r, 'Type'), amount: f(r, 'Amount'), category: f(r, 'Category'), business: f(r, 'Business') };
  });
  let cashNet = 0;
  R.cash.forEach(function (r) { const a = parseFloat(f(r, 'Amount')); if (isFinite(a)) cashNet += a; });

  // Freshness: newest Alerts.Created (system-written), else newest trade Entry Time.
  let lastHeartbeat = '';
  for (let i = 0; i < R.alerts.length; i++) { const c = f(R.alerts[i], 'Created'); if (c) { lastHeartbeat = c; break; } }
  if (!lastHeartbeat && R.trades.length) lastHeartbeat = f(R.trades[0], 'Entry Time');

  const briefings = R.briefings.slice(0, 8).map(function (r) {
    return {
      type: f(r, 'Type'), title: f(r, 'Title'), date: String(f(r, 'Date')).slice(0, 10),
      summary: String(f(r, 'Summary')).slice(0, 700),
      body: String(f(r, 'Body')).slice(0, 4000),
      journal: String(f(r, 'Journal')).slice(0, 3000),
      created: f(r, 'Created')
    };
  });

  const errors = degradedKeys;

  return {
    statusCode: 200,
    headers: HEADERS,
    body: JSON.stringify({
      ok: true,
      serverTime: new Date().toISOString(),
      lastHeartbeat: lastHeartbeat,
      briefings: briefings,
      heartbeat: { kpis: kpis, alerts: alerts, news: news },
      tradeDesk: { openTrades: openTrades, recentTrades: recentTrades, setups: setups, weekly: weekly },
      mind: { tasks: tasks, ventures: ventures, cashEvents: cashEvents, cashNet: Math.round(cashNet) },
      degraded: errors
    })
  };
};
