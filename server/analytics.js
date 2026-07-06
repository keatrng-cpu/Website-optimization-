// Pageview capture and rollups for published Studio sites.

function dayKey(ts = Date.now()) {
  return new Date(ts).toISOString().slice(0, 10);
}

export function recordView(store, siteSlug, path = '/') {
  const day = dayKey();
  const rows = store.state.analytics;
  let row = rows.find((r) => r.siteSlug === siteSlug && r.path === path && r.day === day);
  if (row) row.count += 1;
  else rows.push({ siteSlug, path, day, count: 1 });
  store.save();
}

export function summarize(store) {
  const rows = store.state.analytics;
  const bySite = {};
  for (const r of rows) {
    bySite[r.siteSlug] ??= { total: 0, days: {} };
    bySite[r.siteSlug].total += r.count;
    bySite[r.siteSlug].days[r.day] = (bySite[r.siteSlug].days[r.day] || 0) + r.count;
  }
  // last 14 days series
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    days.push(d);
  }
  const series = days.map((d) => ({
    day: d,
    count: rows.filter((r) => r.day === d).reduce((a, r) => a + r.count, 0),
  }));
  return { bySite, series, total: rows.reduce((a, r) => a + r.count, 0) };
}
