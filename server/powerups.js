// Power-ups: one-click structured deliverables. Each has an id, owner helper,
// input fields, and a prompt builder. Output is generated via ai.generate and
// saved to the documents library.

export const POWERUPS = [
  {
    id: 'content-plan', name: '30-Day Content Plan', helperId: 'soshie', icon: '🗓️',
    desc: 'A month of platform-specific post ideas mapped to your goals.',
    fields: [
      { key: 'platforms', label: 'Platforms', placeholder: 'LinkedIn, Instagram', required: false },
      { key: 'focus', label: 'Focus / campaign', placeholder: 'Product launch, brand awareness…', required: false },
    ],
    buildPrompt: (f) => `Create a 30-day social media content plan${f.platforms ? ` for ${f.platforms}` : ''}${f.focus ? ` focused on: ${f.focus}` : ''}. Organize by week with post ideas, hooks, formats, and CTAs.`,
  },
  {
    id: 'sales-script', name: 'Sales Call Script', helperId: 'milli', icon: '📞',
    desc: 'Discovery-to-close call script with objection handling.',
    fields: [{ key: 'offer', label: 'What are you selling?', placeholder: 'Your offer', required: false }],
    buildPrompt: (f) => `Write a complete sales call script${f.offer ? ` for selling: ${f.offer}` : ''} — opening, discovery questions, pitch, objection handling, and close.`,
  },
  {
    id: 'business-proposal', name: 'Business Proposal', helperId: 'buddy', icon: '📄',
    desc: 'Client-ready proposal: scope, timeline, pricing structure.',
    fields: [
      { key: 'client', label: 'Client / prospect', placeholder: 'Acme Co', required: false },
      { key: 'project', label: 'Project', placeholder: 'What you are proposing', required: false },
    ],
    buildPrompt: (f) => `Write a business proposal${f.client ? ` for ${f.client}` : ''}${f.project ? ` covering: ${f.project}` : ''}. Include executive summary, scope, deliverables, timeline, pricing structure, and terms.`,
  },
  {
    id: 'welcome-sequence', name: 'Email Welcome Sequence', helperId: 'emmie', icon: '💌',
    desc: '5-email onboarding sequence with subject lines.',
    fields: [{ key: 'goal', label: 'Sequence goal', placeholder: 'Convert trials to paid', required: false }],
    buildPrompt: (f) => `Write a 5-email welcome/onboarding drip sequence${f.goal ? ` with the goal: ${f.goal}` : ''}. For each email give subject, preheader, body, and CTA, plus send timing.`,
  },
  {
    id: 'seo-brief', name: 'SEO Content Brief', helperId: 'seomi', icon: '📈',
    desc: 'Keyword-targeted brief a writer can execute immediately.',
    fields: [{ key: 'topic', label: 'Topic / keyword', placeholder: 'best crm for freelancers', required: true }],
    buildPrompt: (f) => `Create an SEO content brief for the topic "${f.topic}": primary/secondary keywords, search intent, title options, H2/H3 outline, questions to answer, internal link suggestions, and target word count.`,
  },
  {
    id: 'landing-copy', name: 'Landing Page Copy', helperId: 'penn', icon: '🎯',
    desc: 'Full landing page: hero, benefits, proof, FAQ, CTA.',
    fields: [{ key: 'offer', label: 'Offer', placeholder: 'What the page sells', required: false }],
    buildPrompt: (f) => `Write complete landing page copy${f.offer ? ` for: ${f.offer}` : ''} — hero headline + subhead, 3 benefit blocks, social proof section, FAQ (5 questions), and closing CTA.`,
  },
  {
    id: 'job-kit', name: 'Hiring Kit', helperId: 'scouty', icon: '🧲',
    desc: 'Job post, screening questions, and interview scorecard.',
    fields: [{ key: 'role', label: 'Role', placeholder: 'Marketing manager', required: true }],
    buildPrompt: (f) => `Create a complete hiring kit for the role "${f.role}": job description, 5 screening questions, interview plan, and a scorecard.`,
  },
  {
    id: 'kpi-dashboard', name: 'KPI Framework', helperId: 'dexter', icon: '📊',
    desc: 'The metrics that matter for your business, with targets.',
    fields: [],
    buildPrompt: () => `Design a KPI framework for this business: north-star metric, supporting KPI tree, weekly targets, data sources, and a review cadence.`,
  },
  {
    id: 'faq-pack', name: 'Help Center Starter', helperId: 'cassie', icon: '🛟',
    desc: '10 FAQ articles drafted from your business profile.',
    fields: [],
    buildPrompt: () => `Draft a help-center starter pack: the 10 most likely customer questions for this business, each with a clear, friendly answer.`,
  },
  {
    id: 'quarter-plan', name: 'Quarterly Goals Plan', helperId: 'gigi', icon: '🎯',
    desc: 'OKR-style quarter plan broken into weekly commitments.',
    fields: [{ key: 'goal', label: 'Main goal', placeholder: 'Double revenue', required: false }],
    buildPrompt: (f) => `Create a quarterly plan${f.goal ? ` for the goal: ${f.goal}` : ''} — 3 objectives with measurable key results, broken into weekly commitments and a review ritual.`,
  },
  {
    id: 'product-listing', name: 'Product Listing Pack', helperId: 'commet', icon: '🏷️',
    desc: 'Conversion-optimized product description + variants.',
    fields: [{ key: 'product', label: 'Product', placeholder: 'What you sell', required: true }],
    buildPrompt: (f) => `Write a conversion-optimized product listing for "${f.product}": title, description, benefit bullets, specs section, and 2 alternative angles for A/B testing.`,
  },
  {
    id: 'sop-builder', name: 'SOP Builder', helperId: 'vizzy', icon: '📋',
    desc: 'Turn any recurring process into a step-by-step SOP.',
    fields: [{ key: 'process', label: 'Process', placeholder: 'Client onboarding', required: true }],
    buildPrompt: (f) => `Write a standard operating procedure for "${f.process}": purpose, trigger, inputs, numbered steps, quality checks, and handoff.`,
  },
];

export const POWERUP_MAP = Object.fromEntries(POWERUPS.map((p) => [p.id, p]));
