// On-page SEO audit engine. Audits raw HTML (from a local Studio site or a
// fetched URL) with weighted checks and returns a scored report.

function extract(re, html, group = 1) {
  const m = html.match(re);
  return m ? m[group].trim() : null;
}
function countMatches(re, html) {
  return (html.match(re) || []).length;
}
function textContent(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function auditHTML(html, target) {
  const checks = [];
  const add = (id, label, pass, detail, weight = 1, advice = '') =>
    checks.push({ id, label, pass, detail, weight, advice: pass ? '' : advice });

  const title = extract(/<title[^>]*>([\s\S]*?)<\/title>/i, html);
  add('title', 'Title tag present', !!title, title ? `"${title}"` : 'No <title> found', 3,
    'Add a unique, descriptive <title> with your primary keyword near the front.');
  if (title) {
    add('title-length', 'Title length 15–60 chars', title.length >= 15 && title.length <= 60,
      `${title.length} characters`, 2, 'Keep titles between 15 and 60 characters so they display fully in results.');
  }

  const metaDesc = extract(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i, html)
    || extract(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i, html);
  add('meta-desc', 'Meta description present', !!metaDesc, metaDesc ? `${metaDesc.length} chars` : 'Missing', 3,
    'Add a meta description (140–160 chars) that sells the click.');
  if (metaDesc) {
    add('meta-desc-length', 'Meta description 50–160 chars', metaDesc.length >= 50 && metaDesc.length <= 160,
      `${metaDesc.length} characters`, 1, 'Aim for 140–160 characters — long enough to persuade, short enough to avoid truncation.');
  }

  const h1s = countMatches(/<h1[\s>]/gi, html);
  add('h1', 'Exactly one H1', h1s === 1, `${h1s} H1 tag(s) found`, 3,
    h1s === 0 ? 'Add one H1 containing your primary keyword.' : 'Use a single H1; demote the rest to H2/H3.');

  const h2s = countMatches(/<h2[\s>]/gi, html);
  add('h2', 'Uses H2 subheadings', h2s >= 1, `${h2s} H2 tag(s)`, 1,
    'Break content into scannable sections with H2 subheadings.');

  const imgs = html.match(/<img[^>]*>/gi) || [];
  const missingAlt = imgs.filter((i) => !/alt=["'][^"']+["']/i.test(i)).length;
  add('img-alt', 'All images have alt text', imgs.length === 0 || missingAlt === 0,
    imgs.length ? `${missingAlt}/${imgs.length} images missing alt` : 'No images', 2,
    'Add descriptive alt text to every image for accessibility and image search.');

  const words = textContent(html).split(' ').filter(Boolean).length;
  add('word-count', 'Substantial content (300+ words)', words >= 300, `${words} words`, 2,
    'Thin pages rarely rank — expand toward 300+ words of genuinely useful content.');

  add('viewport', 'Mobile viewport meta', /<meta[^>]+name=["']viewport["']/i.test(html), '', 2,
    'Add <meta name="viewport" content="width=device-width, initial-scale=1"> for mobile usability.');

  add('lang', 'HTML lang attribute', /<html[^>]+lang=/i.test(html), '', 1,
    'Declare the page language: <html lang="en">.');

  add('charset', 'Charset declared', /<meta[^>]+charset/i.test(html), '', 1,
    'Add <meta charset="utf-8"> in <head>.');

  const links = countMatches(/<a[^>]+href=/gi, html);
  add('links', 'Contains links', links >= 1, `${links} link(s)`, 1,
    'Add internal links to related pages and at least one clear call-to-action link.');

  add('canonical', 'Canonical URL set', /<link[^>]+rel=["']canonical["']/i.test(html), '', 1,
    'Add <link rel="canonical"> to prevent duplicate-content dilution.');

  add('og', 'Open Graph tags', /<meta[^>]+property=["']og:/i.test(html), '', 1,
    'Add og:title, og:description, and og:image so shares look good on social.');

  const totalWeight = checks.reduce((a, c) => a + c.weight, 0);
  const gained = checks.reduce((a, c) => a + (c.pass ? c.weight : 0), 0);
  const score = Math.round((gained / totalWeight) * 100);

  return {
    target,
    score,
    grade: score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F',
    passed: checks.filter((c) => c.pass).length,
    failed: checks.filter((c) => !c.pass).length,
    checks,
    createdAt: Date.now(),
  };
}

export async function fetchAndAudit(url) {
  const res = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(15_000),
    headers: { 'user-agent': 'HELIX-SEO-Audit/1.0' },
  });
  if (!res.ok) throw new Error(`fetch failed: HTTP ${res.status}`);
  const html = await res.text();
  return auditHTML(html, url);
}
