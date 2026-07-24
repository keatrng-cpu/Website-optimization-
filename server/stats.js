// Ticker stats: business KPIs computed from the store (accuracy mandate — the
// ticker shows only code-computed numbers), plus the LABEL-line parser for
// AI-suggested stat *definitions* (AI names stats; it never supplies values).

export function buildTickerStats(state) {
  const stats = [];
  const openTasks = (state.tasks || []).filter((t) => t.status !== 'done').length;
  stats.push({ id: 'tasks', label: 'Open tasks', value: openTasks });
  stats.push({ id: 'docs', label: 'Documents', value: (state.documents || []).length });
  stats.push({ id: 'sites', label: 'Live websites', value: (state.sites || []).filter((s) => s.published).length });

  // pageviews: last 7 days vs the 7 before (changePct only when a prior exists)
  const day = (offset) => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);
  const last7 = new Set(Array.from({ length: 7 }, (_, i) => day(i)));
  const prev7 = new Set(Array.from({ length: 7 }, (_, i) => day(i + 7)));
  let cur = 0, prev = 0;
  for (const r of state.analytics || []) {
    if (last7.has(r.day)) cur += r.count;
    else if (prev7.has(r.day)) prev += r.count;
  }
  const pv = { id: 'views', label: 'Pageviews (7d)', value: cur };
  if (prev > 0) pv.changePct = Math.round(((cur - prev) / prev) * 10000) / 100;
  stats.push(pv);

  const audit = (state.seoAudits || [])[0];
  if (audit) stats.push({ id: 'seo', label: 'SEO score', value: audit.score });
  const mems = (state.memories || []).length;
  if (mems) stats.push({ id: 'memories', label: 'Brain memories', value: mems });
  return stats;
}

export const TICKER_SUGGEST_SYSTEM = [
  'You suggest KPI stat definitions for a small-business dashboard ticker.',
  'Reply ONLY with 3 to 5 lines of the form "LABEL: <short stat name>".',
  'No values, no numbers, no other text. Never invent numeric values.',
].join('\n');

export function parseLabelLines(raw) {
  return String(raw || '')
    .split('\n')
    .map((l) => { const m = l.match(/LABEL:\s*(.+)/i); return m ? m[1].trim() : null; })
    .filter(Boolean)
    .slice(0, 5)
    .map((label) => ({ label: label.slice(0, 60), value: '—' }));
}
