// Autonomous agent layer. Gives helpers real, executable tools that mutate the
// workspace and call registered integrations. Two execution modes:
//   • provider mode — a connected LLM plans and calls tools in a loop
//   • offline planner — a deterministic goal→tool-sequence orchestrator that
//     still performs REAL actions, so autonomy works with zero API keys.
import { uid } from './store.js';
import { POWERUP_MAP } from './powerups.js';
import { PALETTES, slugify, defaultSections, renderSite } from './sites.js';
import { auditHTML } from './seo.js';
import { callIntegration } from './integrations.js';
import { GUARDRAILS } from './helpers.js';

// Each tool: name, description, JSON-schema input, and an async run(ctx, args).
// ctx = { store, ask } where ask(helperId, message) -> { text, engine }.
export function buildTools() {
  return {
    get_workspace_summary: {
      description: 'Get counts and recent items across the whole workspace (tasks, sites, documents, calendar, automations, integrations).',
      input_schema: { type: 'object', properties: {} },
      async run(ctx) {
        const s = ctx.store.state;
        return {
          openTasks: s.tasks.filter((t) => t.status !== 'done').map((t) => t.title),
          sites: s.sites.map((x) => ({ name: x.name, slug: x.slug, live: x.published })),
          documents: s.documents.length,
          calendarPosts: s.calendar.length,
          automations: s.automations.filter((a) => a.enabled).length,
          integrations: s.integrations.filter((i) => i.enabled).map((i) => i.name),
          lastSeoScore: s.seoAudits[0]?.score ?? null,
        };
      },
    },
    create_task: {
      description: 'Create a task on the board, optionally assigned to a helper.',
      input_schema: { type: 'object', properties: { title: { type: 'string' }, helperId: { type: 'string' }, priority: { type: 'string', enum: ['low', 'medium', 'high'] } }, required: ['title'] },
      async run(ctx, { title, helperId, priority }) {
        const task = { id: uid(), title: String(title), notes: '', status: 'todo', helperId: helperId || null, priority: priority || 'medium', createdAt: Date.now(), deliverableId: null };
        ctx.store.state.tasks.unshift(task);
        ctx.store.save();
        return { created: task.title, id: task.id };
      },
    },
    run_powerup: {
      description: 'Run a power-up to produce a finished deliverable document. Valid ids: ' + Object.keys(POWERUP_MAP).join(', ') + '.',
      input_schema: { type: 'object', properties: { powerupId: { type: 'string' }, inputs: { type: 'object' } }, required: ['powerupId'] },
      async run(ctx, { powerupId, inputs = {} }) {
        const pu = POWERUP_MAP[powerupId];
        if (!pu) throw new Error(`unknown power-up "${powerupId}"`);
        const { text, engine } = await ctx.ask(pu.helperId, pu.buildPrompt(inputs));
        const doc = { id: uid(), title: pu.name, kind: 'powerup', helperId: pu.helperId, content: text, engine, source: pu.id, createdAt: Date.now() };
        ctx.store.state.documents.unshift(doc);
        ctx.store.save();
        return { document: doc.title, id: doc.id };
      },
    },
    create_website: {
      description: 'Create and generate a website from the Brain, published live.',
      input_schema: { type: 'object', properties: { name: { type: 'string' }, palette: { type: 'string' } }, required: ['name'] },
      async run(ctx, { name, palette }) {
        const s = ctx.store.state;
        // idempotent: a site with this name/slug already exists → reuse, don't duplicate
        const wanted = slugify(name);
        const existing = s.sites.find((x) => x.slug === wanted || x.name.toLowerCase() === String(name).toLowerCase());
        if (existing) {
          return { site: existing.name, slug: existing.slug, url: `/sites/${existing.slug}`, existing: true };
        }
        let slug = wanted;
        while (s.sites.some((x) => x.slug === slug)) slug += '-' + uid().slice(0, 4);
        const site = { id: uid(), name: String(name), slug, palette: PALETTES[palette] ? palette : 'midnight', sections: defaultSections(s.brain), published: true, createdAt: Date.now(), updatedAt: Date.now() };
        site.birthScore = auditHTML(renderSite(site, s.brain), `Studio site: ${site.name}`).score;
        s.sites.unshift(site);
        ctx.store.save();
        return { site: site.name, slug: site.slug, url: `/sites/${site.slug}`, birthScore: site.birthScore };
      },
    },
    run_seo_audit: {
      description: 'Run an on-page SEO audit on a Studio site (defaults to the most recent site).',
      input_schema: { type: 'object', properties: { siteId: { type: 'string' } } },
      async run(ctx, { siteId }) {
        const s = ctx.store.state;
        const site = siteId ? s.sites.find((x) => x.id === siteId) : s.sites[0];
        if (!site) throw new Error('no site to audit — create one first');
        const report = auditHTML(renderSite(site, s.brain), `Studio site: ${site.name}`);
        report.id = uid();
        s.seoAudits.unshift(report);
        if (s.seoAudits.length > 50) s.seoAudits.length = 50;
        ctx.store.save();
        return { target: report.target, score: report.score, grade: report.grade, issues: report.failed };
      },
    },
    generate_content_calendar: {
      description: 'Generate a week of platform-native social posts.',
      input_schema: { type: 'object', properties: { platforms: { type: 'array', items: { type: 'string' } } } },
      async run(ctx, { platforms }) {
        const plats = Array.isArray(platforms) && platforms.length ? platforms.map(String) : ['LinkedIn', 'Instagram', 'X'];
        const angles = ['a customer pain point and how you solve it', 'a behind-the-scenes look', 'a practical tip', 'a myth debunked', 'a success story', 'a question that starts a conversation', 'your offer with a clear CTA'];
        const created = [];
        for (let i = 0; i < 7; i++) {
          const platform = plats[i % plats.length];
          const { text } = await ctx.ask('soshie', `Write ONE ${platform} post about ${angles[i]}. Return only the post text.`);
          const date = new Date(Date.now() + i * 86_400_000).toISOString().slice(0, 10);
          const post = { id: uid(), platform, content: text, date, status: 'draft', helperId: 'soshie', createdAt: Date.now() };
          ctx.store.state.calendar.unshift(post);
          created.push(platform);
        }
        ctx.store.save();
        return { postsCreated: created.length, platforms: [...new Set(created)] };
      },
    },
    draft_email_campaign: {
      description: 'Draft an email campaign for a specific goal.',
      input_schema: { type: 'object', properties: { goal: { type: 'string' } }, required: ['goal'] },
      async run(ctx, { goal }) {
        const { text } = await ctx.ask('emmie', `Write an email campaign for: ${goal}. Include subject, preheader, and body.`);
        const subj = text.match(/subject[^:\n]*:\s*(.+)/i);
        const email = { id: uid(), subject: (subj ? subj[1] : `Campaign: ${goal}`).slice(0, 120).replace(/[*_#]/g, '').trim(), preheader: '', body: text, audience: 'All subscribers', status: 'draft', createdAt: Date.now() };
        ctx.store.state.emails.unshift(email);
        ctx.store.save();
        return { subject: email.subject, id: email.id };
      },
    },
    call_integration: {
      description: 'Make an authenticated request through a connected integration (by name or id). Use for live data (e.g. Stripe revenue) or to push results (e.g. a Slack webhook).',
      input_schema: { type: 'object', properties: { integration: { type: 'string' }, method: { type: 'string' }, path: { type: 'string' }, body: {} }, required: ['integration'] },
      async run(ctx, { integration, method, path, body }) {
        const list = ctx.store.state.integrations.filter((i) => i.enabled);
        const integ = list.find((i) => i.id === integration || i.name.toLowerCase() === String(integration).toLowerCase());
        if (!integ) throw new Error(`no connected integration matching "${integration}"`);
        const res = await callIntegration(integ, { method, path, body });
        return { integration: integ.name, status: res.status, ok: res.ok, data: res.data };
      },
    },
  };
}

export function toolMeta() {
  const tools = buildTools();
  return Object.entries(tools).map(([name, t]) => ({ name, description: t.description, input_schema: t.input_schema }));
}

export async function executeTool(ctx, name, args = {}) {
  const tools = buildTools();
  const tool = tools[name];
  if (!tool) throw new Error(`unknown tool "${name}"`);
  return tool.run(ctx, args || {});
}

export const AGENT_SYSTEM = 'You are HELIX Autopilot, an autonomous operator for this business. Break the user\'s goal into steps and use the available tools to actually do the work. Prefer real actions (create tasks, build sites, run audits, generate content, call integrations) over describing them. When finished, stop calling tools and give a short summary of what you accomplished.\n\n' + GUARDRAILS;

// Provider-driven loop. `callModel` is a stateful closure that owns the native
// provider conversation and is called as:
//   callModel({ goal })                        -> first turn
//   callModel({ toolResults: [{ id, name, content }] })  -> subsequent turns
// returning { type: 'final', text } or { type: 'tool_use', calls: [{ id, name, input }] }.
export async function runAgent(ctx, { goal, callModel, maxSteps = 8 }) {
  const steps = [];
  let action = await callModel({ goal });
  for (let i = 0; i < maxSteps; i++) {
    if (action.type === 'final') return { mode: 'provider', steps, summary: action.text };
    const toolResults = [];
    for (const call of action.calls) {
      let result;
      try { result = await executeTool(ctx, call.name, call.input); }
      catch (e) { result = { error: e.message }; }
      steps.push({ tool: call.name, args: call.input, result });
      toolResults.push({ id: call.id, name: call.name, content: JSON.stringify(result).slice(0, 2000) });
    }
    action = await callModel({ toolResults });
  }
  return { mode: 'provider', steps, summary: 'Reached the step limit — see the actions completed so far.' };
}

// Deterministic offline planner: maps a goal to a real sequence of tool calls.
// No LLM required — autonomy that works with zero keys.
export async function runPlanner(ctx, { goal }) {
  const g = String(goal || '').toLowerCase();
  const has = (...ws) => ws.some((w) => g.includes(w));
  const plan = [];
  const biz = ctx.store.state.brain.businessName || 'the business';

  if (has('launch', 'product', 'release', 'new')) {
    plan.push(['run_powerup', { powerupId: 'quarter-plan', inputs: { goal } }]);
    plan.push(['create_task', { title: `Finalize launch plan for ${biz}`, helperId: 'gigi', priority: 'high' }]);
  }
  if (has('website', 'site', 'landing', 'launch', 'online', 'web')) {
    plan.push(['create_website', { name: biz }]);
    plan.push(['run_seo_audit', {}]);
  }
  if (has('market', 'social', 'content', 'grow', 'awareness', 'launch', 'audience')) {
    plan.push(['generate_content_calendar', {}]);
  }
  if (has('email', 'newsletter', 'campaign', 'nurture')) {
    plan.push(['draft_email_campaign', { goal }]);
  }
  if (has('sell', 'sales', 'revenue', 'pipeline', 'outreach')) {
    plan.push(['run_powerup', { powerupId: 'sales-script', inputs: { offer: goal } }]);
  }
  if (has('seo', 'rank', 'search', 'traffic')) {
    plan.push(['run_powerup', { powerupId: 'seo-brief', inputs: { topic: goal } }]);
  }
  // sensible default so any goal produces real output
  if (!plan.length) {
    plan.push(['run_powerup', { powerupId: 'quarter-plan', inputs: { goal } }]);
    plan.push(['create_task', { title: goal.slice(0, 80) || 'Follow up on this goal', helperId: 'vizzy', priority: 'medium' }]);
  }

  // dedupe identical steps within a run (e.g. two branches both adding an audit)
  const seen = new Set();
  const deduped = plan.filter(([tool, args]) => {
    const key = tool + JSON.stringify(args);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const steps = [];
  for (const [tool, args] of deduped) {
    let result;
    try { result = await executeTool(ctx, tool, args); }
    catch (e) { result = { error: e.message }; }
    steps.push({ tool, args, result });
  }
  const summary = `Autopilot completed ${steps.filter((s) => !s.result?.error).length} action(s) toward: “${goal}”. Review the results in Tasks, Documents, Website Studio, and Marketing.`;
  return { mode: 'offline-planner', steps, summary };
}
