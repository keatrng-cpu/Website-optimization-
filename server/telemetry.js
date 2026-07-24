// Device-local usage telemetry: which actions run, how often, on which days.
// Metadata only — normalized route patterns and counts, never payloads.

const DAY_CAP = 120;

export function recordAction(state, method, pattern) {
  if (method === 'GET') return; // reads are not "actions" (and polls would swamp the stats)
  if (pattern.startsWith('/api/telemetry') || pattern === '/api/inbox/read') return;
  const t = state.telemetry && state.telemetry.keys ? state.telemetry : (state.telemetry = { keys: {}, days: {} });
  const key = `${method} ${pattern}`;
  t.keys[key] = (t.keys[key] || 0) + 1;
  const day = new Date().toISOString().slice(0, 10);
  t.days[day] = (t.days[day] || 0) + 1;
  const days = Object.keys(t.days).sort();
  if (days.length > DAY_CAP) for (const d of days.slice(0, days.length - DAY_CAP)) delete t.days[d];
}

// Human names for the actions that matter on the Command Center. Anything not
// listed still shows, labeled by its route.
export const ACTION_LABELS = {
  'POST /api/chats/:id/messages': '💬 Chat with the AI team',
  'POST /api/powerups/:id/run': '⚡ Run a power-up',
  'POST /api/sites': '🌐 Build a website',
  'POST /api/seo/audit': '🔍 SEO audit',
  'POST /api/agent/run': '🚀 Autopilot run',
  'POST /api/agent/plan': '🧭 Autopilot plan preview',
  'POST /api/quickstart': '✨ Quick Start',
  'POST /api/tasks': '✅ Create a task',
  'POST /api/tasks/:id/run': '▶ Task completed by AI',
  'POST /api/marketing/calendar': '📣 Content calendar',
  'POST /api/marketing/emails': '✉️ Email campaign',
  'POST /api/automations': '🔁 Create an automation',
  'POST /api/automations/:id/run': '🔁 Run an automation',
  'POST /api/integrations': '🔌 Connect an integration',
  'PUT /api/brain': '🧠 Update the Brain',
  'POST /api/stats/ticker/suggest': '📊 Ticker AI suggest',
  'PUT /api/account': '👤 Account update',
  'PUT /api/settings': '⚙️ Settings change',
  'POST /api/export': '📦 Workspace export',
  'POST /api/inbox/read': '📥 Inbox read',
};

export function telemetrySummary(state) {
  const t = state.telemetry || { keys: {}, days: {} };
  const entries = Object.entries(t.keys);
  const totalActions = entries.reduce((a, [, n]) => a + n, 0);
  const ranked = entries
    .map(([key, count]) => ({ key, count, label: ACTION_LABELS[key] || key }))
    .sort((a, b) => b.count - a.count);
  const used = new Set(entries.map(([k]) => k));
  const untouched = Object.entries(ACTION_LABELS)
    .filter(([k]) => !used.has(k))
    .map(([key, label]) => ({ key, label }));
  const days = Object.entries(t.days).sort((a, b) => a[0] < b[0] ? -1 : 1);
  const last30cut = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const activeDays30 = days.filter(([d]) => d >= last30cut).length;
  let busiest = null;
  for (const [d, n] of days) if (!busiest || n > busiest.count) busiest = { day: d, count: n };
  return { totalActions, top: ranked.slice(0, 8), untouched, activeDays30, firstDay: days[0]?.[0] || null, busiest };
}
