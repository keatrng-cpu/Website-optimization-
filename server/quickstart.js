// Quick Start: one description → Brain filled, website live (with a computed
// born-SEO score), a week of content, a weekly automation, and an audit.
// Deterministic field extraction (accuracy mandate: code parses, models are
// not asked to guess facts). Isomorphic — also runs inside the browser demo.
import { executeTool } from './agent.js';
import { uid } from './store.js';

// Heuristic Brain extraction from a plain-English description.
export function parseBrain(name, description) {
  const d = String(description || '').replace(/\s+/g, ' ').trim();
  const brain = { businessName: String(name || '').trim(), description: d };

  const audience = d.match(/\bfor ([^.;]{3,70}?)(?:[.;]|,? (?:we|our|and we|based)|$)/i);
  if (audience) brain.audience = audience[1].trim();

  const products = d.match(/\b(?:we )?(?:sell|offer|provide|make|build|create|serve)s? ([^.;]{3,90}?)(?:[.;]|,? (?:for|based)|$)/i);
  if (products) brain.products = products[1].trim();

  const location = d.match(/\b(?:based in|located in|out of) ([A-Z][A-Za-z .]{2,40}?)(?:[.,;]|$)/i);
  if (location) brain.location = location[1].trim();

  const first = d.split(/[.!?]/)[0].trim();
  if (first && first.length <= 60 && first.toLowerCase() !== d.toLowerCase()) brain.tagline = first;

  return brain;
}

// ctx = { store, ask } (the agent context). Returns everything created, linked.
export async function runQuickstart(ctx, { name, description }) {
  const s = ctx.store.state;
  const extracted = parseBrain(name, description);
  for (const [k, v] of Object.entries(extracted)) {
    if (v) s.brain[k] = v;
  }
  ctx.store.save();

  const steps = [];
  const site = await executeTool(ctx, 'create_website', { name: s.brain.businessName });
  steps.push({ tool: 'create_website', result: site });

  const created = s.sites.find((x) => x.slug === site.slug);

  const audit = await executeTool(ctx, 'run_seo_audit', { siteId: created?.id });
  steps.push({ tool: 'run_seo_audit', result: audit });

  const calendar = await executeTool(ctx, 'generate_content_calendar', {});
  steps.push({ tool: 'generate_content_calendar', result: calendar });

  const automation = {
    id: uid(), name: 'Weekly content ideas', prompt: 'Draft 5 social post ideas for this week based on our goals.',
    helperId: 'soshie', schedule: { type: 'interval', minutes: 10080 },
    enabled: true, lastRun: null, nextRun: Date.now() + 10080 * 60_000, runs: 0, createdAt: Date.now(),
  };
  if (!s.automations.some((a) => a.name === automation.name)) s.automations.unshift(automation);
  steps.push({ tool: 'create_automation', result: { name: automation.name, cadence: 'weekly' } });

  s.inbox.unshift({
    id: uid(), title: 'Quick Start finished — your business scaffold is live',
    body: `Website /sites/${site.slug} (SEO ${audit.score}/100), 7 posts drafted, weekly automation running.`,
    from: 'vizzy', read: false, documentId: null, createdAt: Date.now(),
  });
  ctx.store.save();

  return {
    brain: s.brain,
    site: { name: site.site, slug: site.slug, url: site.url, existing: !!site.existing, birthScore: created?.birthScore ?? audit.score },
    audit: { score: audit.score, grade: audit.grade, issues: audit.issues },
    posts: calendar.postsCreated,
    automation: { name: automation.name, cadence: 'weekly' },
    steps,
  };
}
