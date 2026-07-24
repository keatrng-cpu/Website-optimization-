// Ticker stats: business KPIs computed from the store (accuracy mandate — the
// ticker shows only code-computed numbers), plus the LABEL-line parser for
// AI-suggested stat *definitions* (AI names stats; it never supplies values).

export function buildTickerStats(state) {
  const stats = [];
  const openTasks = (state.tasks || []).filter((t) => t.status !== 'done').length;
  stats.push({
    id: 'tasks', label: 'Open tasks', value: openTasks,
    desc: 'Tasks on your board that are not done yet.',
    tip: openTasks === 0 ? 'Clear board — ask Autopilot for this week’s plan and it will fill itself with real work.'
      : openTasks > 5 ? `${openTasks} open — delegate: every task can be completed by its AI teammate straight from the board (▶).`
      : 'Manageable load. Hit ▶ on any task and the assigned teammate completes it with a deliverable attached.',
    href: '#/tasks',
  });
  const docCount = (state.documents || []).length;
  stats.push({
    id: 'docs', label: 'Documents', value: docCount,
    desc: 'Deliverables your AI team has produced — plans, scripts, briefs, audits.',
    tip: docCount === 0 ? 'Run a Power-up: a structured deliverable in seconds, saved here automatically.'
      : 'Every doc is copy-ready — open one and \u{1f4cb} Copy to use it anywhere.',
    href: '#/documents',
  });
  const liveSites = (state.sites || []).filter((s) => s.published).length;
  stats.push({
    id: 'sites', label: 'Live websites', value: liveSites,
    desc: 'Published sites served by HELIX right now.',
    tip: liveSites === 0 ? 'Website Studio births sites at 95+ SEO — one description, one click.'
      : 'Export any site as a deploy-ready bundle (with an AI chat widget) from Website Studio.',
    href: '#/sites',
  });

  // pageviews: last 7 days vs the 7 before (changePct only when a prior exists)
  const day = (offset) => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);
  const last7 = new Set(Array.from({ length: 7 }, (_, i) => day(i)));
  const prev7 = new Set(Array.from({ length: 7 }, (_, i) => day(i + 7)));
  let cur = 0, prev = 0;
  for (const r of state.analytics || []) {
    if (last7.has(r.day)) cur += r.count;
    else if (prev7.has(r.day)) prev += r.count;
  }
  const pv = {
    id: 'views', label: 'Pageviews (7d)', value: cur,
    desc: 'Views across your HELIX-hosted sites in the last 7 days, compared with the 7 days before.',
    href: '#/analytics',
  };
  if (prev > 0) pv.changePct = Math.round(((cur - prev) / prev) * 10000) / 100;
  pv.tip = pv.changePct > 0 ? `Up ${pv.changePct}% week-over-week — double down on whatever you published; Marketing can plan the follow-up week.`
    : pv.changePct < 0 ? `Down ${Math.abs(pv.changePct)}% vs last week — schedule a content week in Marketing to bring traffic back.`
    : cur === 0 ? 'No views counted yet — publish a site and share the link; every visit lands here.'
    : 'Steady vs last week. A fresh content calendar is the cheapest way to bend this up.';
  stats.push(pv);

  const audit = (state.seoAudits || [])[0];
  if (audit) stats.push({
    id: 'seo', label: 'SEO score', value: audit.score,
    desc: 'Your latest score from the built-in 13-check on-page auditor.',
    tip: audit.score >= 95 ? 'Excellent — re-audit after any big edit to keep it there.'
      : `Open SEO and clear the flagged checks — each one shows exactly what to fix.`,
    href: '#/seo',
  });
  const mems = (state.memories || []).length;
  if (mems) stats.push({
    id: 'memories', label: 'Brain memories', value: mems,
    desc: 'Facts, preferences and goals your Brain has learned — every teammate uses them automatically.',
    tip: 'Pin the ones that matter most in Brain — pinned memories are never evicted.',
    href: '#/brain',
  });
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
