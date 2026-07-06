// Offline generation engine: deterministic, brand-aware, persona-flavored
// structured output. Used when no LLM provider is configured, and as the
// fallback when a provider call fails — so every feature works with zero
// network access and zero API keys.

function biz(brain) {
  return brain.businessName || 'your business';
}
function aud(brain) {
  return brain.audience || 'your target customers';
}
function prod(brain) {
  return brain.products || 'your products and services';
}

function detectIntent(text) {
  const t = text.toLowerCase();
  const has = (...ws) => ws.some((w) => t.includes(w));
  if (has('subject line', 'email', 'newsletter', 'drip', 'sequence')) return 'email';
  if (has('social', 'post', 'instagram', 'linkedin', 'tiktok', 'tweet', 'caption', 'hashtag')) return 'social';
  if (has('seo', 'keyword', 'rank', 'meta description', 'search')) return 'seo';
  if (has('landing', 'headline', 'copy', 'tagline', 'slogan', 'ad ')) return 'copy';
  if (has('sales', 'cold', 'outreach', 'pitch', 'objection', 'close', 'proposal')) return 'sales';
  if (has('support', 'refund', 'complaint', 'apolog', 'faq', 'help article')) return 'support';
  if (has('job', 'hire', 'hiring', 'candidate', 'interview', 'recruit')) return 'recruiting';
  if (has('kpi', 'metric', 'report', 'analyz', 'analys', 'data', 'forecast', 'a/b')) return 'data';
  if (has('plan', 'strategy', 'roadmap', 'goal', 'grow')) return 'plan';
  if (has('sop', 'checklist', 'agenda', 'summar', 'organize', 'schedule')) return 'ops';
  if (has('product description', 'listing', 'cart', 'pricing', 'store')) return 'ecommerce';
  return 'general';
}

const GENERATORS = {
  email(req, brain) {
    return `# Email campaign draft

**Goal:** ${req}

## Subject line options
1. ${biz(brain)}: the shortcut ${aud(brain)} have been waiting for
2. A smarter way to get results (inside)
3. Quick question about your goals
4. You're leaving results on the table — here's the fix
5. 3 wins in 5 minutes with ${biz(brain)}

**Preheader:** One small change, measurable results this week.

## Body

Hi {{first_name}},

Most ${aud(brain)} struggle with the same thing: too much to do, not enough leverage.

${biz(brain)} fixes that with ${prod(brain)} — built for exactly your situation.

Here's what changes in week one:
- A clear plan you can act on immediately
- The busywork handled for you
- Visible progress you can measure

**[Get started →]**

Reply to this email with any question — a human reads every reply.

— The ${biz(brain)} team

## Send checklist
- [ ] Personalization tokens verified
- [ ] Single CTA, above the fold
- [ ] Plain-text version included
- [ ] Link tracking + UTM tags set
- [ ] Test send to seed list`;
  },

  social(req, brain) {
    return `# Social content pack

**Brief:** ${req}

## LinkedIn
Most ${aud(brain)} don't have a strategy problem. They have an execution problem.

Here's how we approach it at ${biz(brain)}:
1. Pick ONE outcome that matters this month
2. Cut everything that doesn't feed it
3. Ship something small every single day

The compounding is the strategy.

What's the one outcome you're committing to this month? 👇

## Instagram
✨ Real talk for ${aud(brain)}:

Progress > perfection. Every time.

At ${biz(brain)} we've seen it over and over — the ones who win are the ones who ship.

Save this as your sign to start today. 🚀

#smallbusiness #growth #entrepreneur #productivity #marketing

## X / Twitter
Unpopular opinion: most "strategy" is procrastination in a suit.

Pick one metric. Move it this week. Repeat.

That's the whole playbook.

## Posting notes
- Best windows: Tue–Thu, 9–11am local
- Reply to every comment in the first hour
- Repurpose the LinkedIn post as a carousel next week`;
  },

  seo(req, brain) {
    return `# SEO action brief

**Request:** ${req}

## Target keyword themes for ${biz(brain)}
| Theme | Intent | Difficulty | Priority |
|---|---|---|---|
| "${(brain.industry || 'your industry').toLowerCase()} for ${aud(brain).toLowerCase()}" | Commercial | Medium | P0 |
| "best ${prod(brain).toLowerCase().split(',')[0] || 'solution'}" | Commercial | High | P1 |
| "how to choose ${(brain.industry || 'a provider').toLowerCase()}" | Informational | Low | P0 |
| "${biz(brain).toLowerCase()} alternatives / reviews" | Branded | Low | P1 |

## On-page checklist
- [ ] One H1 per page containing the primary keyword
- [ ] Title tag ≤ 60 chars, keyword near the front
- [ ] Meta description 140–160 chars with a call to action
- [ ] Descriptive alt text on every image
- [ ] Internal links from your 3 highest-traffic pages
- [ ] FAQ section targeting long-tail questions

## Content plan (next 4 weeks)
1. Pillar page: the definitive guide for ${aud(brain)}
2. Comparison post: your approach vs. the default alternative
3. Case study / results post with real numbers
4. FAQ roundup targeting question keywords

Measure: impressions and average position weekly; refresh titles on pages stuck on page 2.`;
  },

  copy(req, brain) {
    return `# Copy kit

**Brief:** ${req}

## Headline options
1. ${brain.tagline || `The smarter way for ${aud(brain)} to get results`}
2. Everything ${aud(brain)} need. Nothing they don't.
3. Stop juggling. Start finishing.
4. ${biz(brain)} — built for how you actually work
5. Results in days, not quarters

## Landing page skeleton
**Hero:** {Headline} + subhead naming the #1 pain of ${aud(brain)} + primary CTA.

**Problem:** Name the daily frustration in the reader's own words.

**Solution:** ${prod(brain)} — three benefit bullets, each tied to an outcome (time saved, money earned, stress removed).

**Proof:** Testimonial, metric, or guarantee.

**CTA:** One action, repeated. "Get started" beats "Learn more."

## Microcopy
- Button: "Get started free"
- Reassurance: "No credit card. Cancel anytime."
- 404: "This page wandered off. The good stuff is still on the homepage."`;
  },

  sales(req, brain) {
    return `# Sales playbook snippet

**Request:** ${req}

## Cold outreach (email)
**Subject:** Quick idea for {{company}}

Hi {{first_name}},

Noticed {{trigger — recent post, launch, or hire}}. Teams like yours usually hit a wall with {top pain of ${aud(brain)}}.

${biz(brain)} helps with exactly that: ${prod(brain)}. {Similar customer} saw {specific result} in {timeframe}.

Worth a 15-minute look this week? I'll bring a plan specific to {{company}}.

— {your name}

## Discovery call flow
1. Context: "Walk me through how you handle X today."
2. Pain: "What breaks first when things get busy?"
3. Impact: "What does that cost you per month?"
4. Vision: "If that disappeared, what would you do with the time?"
5. Close: propose next step with a date.

## Objection handling
| Objection | Response |
|---|---|
| "Too expensive" | Reframe against cost of the problem: "What is the current approach costing monthly?" |
| "No time" | "That's exactly why this exists — setup is {short}; the point is giving you time back." |
| "Need to think" | "Totally fair — what specifically would you want to be sure about?" |
| "Using a competitor" | "Great — what would have to be true for a switch to be worth it?" |`;
  },

  support(req, brain) {
    return `# Support response kit

**Scenario:** ${req}

## Reply draft
Hi {{customer_name}},

Thanks for reaching out — and I'm sorry for the trouble. That's not the experience we want you to have with ${biz(brain)}.

Here's what I've done: {action taken}. {If refund/fix: confirmation and timeline.}

To prevent this going forward: {one-line cause + fix}.

Anything else I can help with? I'm here.

Warmly,
{{agent_name}} — ${biz(brain)} Support

## Escalation rules
- Refund requested + order < 30 days → approve, notify billing
- Repeated issue (2+ tickets) → escalate to lead, add account note
- Angry tone → respond within 1 hour, offer a call

## Help-center article outline
1. Symptom in the customer's words
2. 3-step fix with screenshots
3. Why it happens (one paragraph)
4. Still stuck? → contact link`;
  },

  recruiting(req, brain) {
    return `# Hiring kit

**Role brief:** ${req}

## Job post
**{Role title} @ ${biz(brain)}**

${brain.description || `We help ${aud(brain)} win with ${prod(brain)}.`}

**What you'll do**
- Own {core responsibility} end to end
- Ship measurable improvements every week
- Work directly with the founder/team — no bureaucracy

**What we look for**
- Proof you've done {core skill} before (show, don't tell)
- Bias to action and clear written communication
- Care for customers: ${aud(brain)}

**How to apply:** Send 3 bullet points on what you'd do in your first 30 days.

## Screening questions
1. Describe a project you owned from idea to result. What was the metric?
2. What would you do in week one here?
3. What's a strong opinion you hold about {domain}?

## Scorecard (1–5 each)
Ownership · Craft · Communication · Speed · Customer empathy — hire at avg ≥ 4 with no 2s.`;
  },

  data(req, brain) {
    return `# Analysis brief

**Question:** ${req}

## KPI tree for ${biz(brain)}
- **North star:** revenue (or active customers)
  - Acquisition: visits → signups (conversion %)
  - Activation: signups → first value (activation %)
  - Retention: 30-day return rate
  - Monetization: average order value / ARPU

## What to measure this week
| Metric | Source | Target | Owner |
|---|---|---|---|
| Site visits | Analytics tab | +10% w/w | Marketing |
| Conversion rate | Orders / visits | ≥ 2% | Site |
| Repeat rate | Orders | ≥ 25% | Product |

## Method
1. Pull last 4 weeks; compare week-over-week, not day-to-day noise.
2. Segment by source before drawing conclusions.
3. One experiment at a time; write the hypothesis *before* looking at results.

**Decision rule:** if a metric moves ±15% w/w, investigate the same day; otherwise review weekly.`;
  },

  plan(req, brain) {
    return `# Strategic plan

**Objective:** ${req}

## 30/60/90 for ${biz(brain)}

**Days 1–30 — Foundation**
- Nail the offer: one sentence, one audience (${aud(brain)}), one outcome
- Publish/refresh the website and one lead magnet
- Set up weekly metrics review (visits, leads, sales)

**Days 31–60 — Traction**
- Double down on the single best-performing channel
- Ship 2 content pieces/week aimed at ${aud(brain)}
- Launch outreach: 20 personalized contacts/week

**Days 61–90 — Scale**
- Systematize what worked into SOPs and automations
- Add a second channel only if the first is repeatable
- Review pricing against delivered value

## Weekly operating rhythm
- Mon: pick the ONE priority · Wed: mid-week check · Fri: metrics + retro

## Risks
| Risk | Mitigation |
|---|---|
| Spreading too thin | One channel, one offer, 90 days |
| No feedback loop | Weekly metric review is non-negotiable |
| Shiny-object drift | New ideas go to a backlog, not the calendar |`;
  },

  ops(req, brain) {
    return `# Operations doc

**Request:** ${req}

## SOP
**Purpose:** make this repeatable by anyone on the ${biz(brain)} team.

1. **Trigger** — when does this process start?
2. **Inputs** — what's needed before starting (access, files, info)
3. **Steps** — numbered, one action per line, with the tool named
4. **Quality check** — how to verify it was done right
5. **Handoff** — who is notified, where the output lives

## Checklist template
- [ ] Inputs gathered
- [ ] Steps completed in order
- [ ] Output reviewed against the quality check
- [ ] Stakeholder notified
- [ ] Notes logged for next time

## Meeting agenda template
1. Wins since last time (5 min)
2. Numbers review (5 min)
3. The ONE decision to make today (15 min)
4. Blockers + owners (5 min) — every blocker leaves with a name and a date`;
  },

  ecommerce(req, brain) {
    return `# E-commerce optimization pack

**Request:** ${req}

## Product description framework
**Title:** {Product} — {primary benefit} for {audience}

**Opening line:** the transformation, not the features.

**Bullets (benefit → proof):**
- {Benefit 1} — {spec/material/mechanism that makes it true}
- {Benefit 2} — {proof}
- {Benefit 3} — {proof}

**Close:** guarantee + shipping/returns reassurance.

## Conversion checklist for ${biz(brain)}
- [ ] Hero image shows the product in use
- [ ] Price anchored (compare-at or bundle)
- [ ] Reviews visible above the fold
- [ ] Shipping cost known before checkout
- [ ] Abandoned-cart email fires at 1h and 24h

## Cart recovery email (1h)
**Subject:** You left something great behind

Your cart is saved — and it's popular. {Product} tends to sell out.

**[Complete your order →]** Questions? Just reply.`;
  },

  general(req, brain, helper) {
    return `# ${helper ? helper.name + "'s" : ''} response

**Your request:** ${req}

## Recommendation for ${biz(brain)}
Based on your business profile${brain.industry ? ` (${brain.industry})` : ''} and audience (${aud(brain)}):

1. **Clarify the outcome.** Define what "done" looks like in one measurable sentence.
2. **Do the smallest valuable version first.** Ship it this week, not this quarter.
3. **Leverage what exists.** ${prod(brain)} — lead with your strongest asset.
4. **Measure one number.** Pick the single metric this should move and check it weekly.

## Next steps
- [ ] Write the one-sentence outcome
- [ ] Block 2 hours to produce the first version
- [ ] Set a 7-day review reminder

*Tip: connect an AI provider in Settings (Anthropic, OpenAI, or local Ollama) for fully bespoke answers — this response was produced by the built-in offline engine.*`;
  },
};

export function offlineGenerate({ helper, brain, message }) {
  const intent = detectIntent(message || '');
  const gen = GENERATORS[intent] || GENERATORS.general;
  return gen(message, brain, helper);
}
