// Website Studio: section-based site model rendered to a real, standalone,
// responsive HTML page served live at /sites/:slug.

export const PALETTES = {
  midnight: { bg: '#0b1020', surface: '#141a2e', text: '#e8ecf7', muted: '#93a0bf', accent: '#6366f1', accent2: '#22d3ee' },
  daylight: { bg: '#ffffff', surface: '#f4f6fb', text: '#101828', muted: '#5b6474', accent: '#2563eb', accent2: '#7c3aed' },
  forest:   { bg: '#0c1512', surface: '#14211c', text: '#e7f2ec', muted: '#8fa89c', accent: '#22c55e', accent2: '#a3e635' },
  sunset:   { bg: '#180f0f', surface: '#241615', text: '#f7ece8', muted: '#bf9a93', accent: '#f97316', accent2: '#f43f5e' },
  mono:     { bg: '#0a0a0a', surface: '#161616', text: '#f5f5f5', muted: '#9c9c9c', accent: '#fafafa', accent2: '#a3a3a3' },
};

export function slugify(name) {
  return String(name).toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'site';
}

export function defaultSections(brain) {
  const name = brain.businessName || 'Your Business';
  const aud = brain.audience || 'the people we serve';
  const prod = brain.products || 'our products and services';
  const about = [
    brain.description || `${name} exists to make life simpler for ${aud}.`,
    `We focus on ${prod}, delivered with care, clear communication, and attention to the details that matter.`,
    brain.goals ? `Right now our focus is simple: ${brain.goals}.` : 'Our promise is simple: do excellent work, communicate clearly, and treat every customer like our most important one.',
    brain.location ? `We're proudly based in ${brain.location} and love working with our community.` : 'Wherever you are, we make working together easy from the very first conversation.',
  ].join(' ');
  return [
    { type: 'hero', headline: brain.tagline || `Welcome to ${name}`, sub: brain.description || `We help ${aud} get real results, faster — with ${prod} built around your needs.`, cta: 'Get started', ctaLink: '#contact' },
    {
      type: 'features', title: 'Why choose us', items: [
        { icon: '⚡', title: 'Fast', text: `Results in days, not months — we move at the speed ${aud} actually need.` },
        { icon: '🎯', title: 'Focused', text: `Everything we offer is built around exactly what you need, nothing you don't.` },
        { icon: '🤝', title: 'Personal', text: 'Real support from real people who know your name and pick up the phone.' },
      ],
    },
    { type: 'about', title: `About ${name}`, text: about },
    {
      type: 'testimonials', title: 'What customers say', items: [
        { quote: 'Exactly what we needed — professional, fast, and genuinely easy to work with.', author: 'A happy customer' },
        { quote: 'The results speak for themselves. We came back, and we tell our friends.', author: 'A repeat client' },
      ],
    },
    {
      type: 'faq', title: 'Frequently asked questions', items: [
        { q: `What does ${name} actually do?`, a: brain.description || `We provide ${prod} for ${aud}. In short: we take a real problem off your plate and handle it properly, end to end.` },
        { q: 'Who do you work with?', a: `Primarily ${aud} — but if you're not sure you fit, just ask. A quick conversation costs nothing and we'll point you in the right direction either way.` },
        { q: 'How do I get started?', a: 'Use the contact section below to reach out. We respond quickly, ask a few questions to understand what you need, and give you a clear next step — no pressure, no jargon.' },
        { q: 'What makes you different?', a: brain.tone ? `Our style is ${brain.tone} — and we back it with careful work, honest communication, and follow-through you can rely on.` : 'Care and follow-through. We do what we say, when we said we would, and keep you informed the whole way.' },
        { q: 'What if I have more questions?', a: 'Ask away — the chat on this page can answer right now, or send a message via the contact section and a real person will get back to you.' },
      ],
    },
    { type: 'cta', headline: 'Ready to get started?', sub: 'Reach out today — it takes two minutes and there is no obligation.', cta: 'Contact us', ctaLink: '#contact' },
    { type: 'contact', title: 'Contact', email: '', phone: '', address: brain.location || '' },
  ];
}

// Deterministic <title>: always 15–60 chars, "{Business} — {tagline}" pattern.
export function composeTitle(site, brain) {
  const name = site.name || brain.businessName || 'Welcome';
  let t = brain.tagline ? `${name} — ${brain.tagline}` : name;
  if (t.length < 15) t = `${t} — ${brain.industry || 'Official Site'}`;
  if (t.length < 15) t = `${t} | Quality & Care`;
  if (t.length > 60) {
    const cut = t.slice(0, 60).lastIndexOf(' ');
    t = t.slice(0, cut > 40 ? cut : 60).trim();
  }
  return t;
}

// Deterministic meta description: always 140–158 chars, composed from Brain.
export function composeMeta(site, brain) {
  const name = brain.businessName || site.name;
  const parts = [];
  if (brain.description) parts.push(brain.description.trim());
  if (brain.products) parts.push(`Offering ${brain.products.trim()}.`);
  if (brain.audience) parts.push(`Built for ${brain.audience.trim()}.`);
  if (brain.location) parts.push(`Based in ${brain.location.trim()}.`);
  parts.push(`Get in touch with ${name} today.`);
  let m = parts.join(' ').replace(/\s+/g, ' ').trim();
  if (m.length < 140) m += ` Fast, friendly, and focused on results — discover what ${name} can do for you.`;
  if (m.length < 140) m += ' Quality service, clear communication, and care in every detail.';
  if (m.length > 158) {
    const cut = m.slice(0, 158).lastIndexOf(' ');
    m = m.slice(0, cut > 140 ? cut : 158).trim();
  }
  return m;
}

const esc = (s) => String(s ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

const RENDERERS = {
  hero: (s) => `
  <header class="hero" id="top">
    <h1>${esc(s.headline)}</h1>
    <p>${esc(s.sub)}</p>
    ${s.cta ? `<a class="btn" href="${esc(s.ctaLink || '#contact')}">${esc(s.cta)}</a>` : ''}
  </header>`,
  features: (s) => `
  <section class="features">
    <h2>${esc(s.title)}</h2>
    <div class="grid">
      ${(s.items || []).map((i) => `<div class="card"><div class="icon">${esc(i.icon)}</div><h3>${esc(i.title)}</h3><p>${esc(i.text)}</p></div>`).join('')}
    </div>
  </section>`,
  about: (s) => `
  <section class="about">
    <h2>${esc(s.title)}</h2>
    <p>${esc(s.text)}</p>
  </section>`,
  testimonials: (s) => `
  <section class="testimonials">
    <h2>${esc(s.title)}</h2>
    <div class="grid">
      ${(s.items || []).map((i) => `<figure class="card"><blockquote>“${esc(i.quote)}”</blockquote><figcaption>— ${esc(i.author)}</figcaption></figure>`).join('')}
    </div>
  </section>`,
  cta: (s) => `
  <section class="cta-band">
    <h2>${esc(s.headline)}</h2>
    <p>${esc(s.sub)}</p>
    ${s.cta ? `<a class="btn" href="${esc(s.ctaLink || '#contact')}">${esc(s.cta)}</a>` : ''}
  </section>`,
  faq: (s) => `
  <section class="faq">
    <h2>${esc(s.title)}</h2>
    ${(s.items || []).map((i) => `<details><summary>${esc(i.q)}</summary><p>${esc(i.a)}</p></details>`).join('')}
  </section>`,
  contact: (s) => `
  <section class="contact" id="contact">
    <h2>${esc(s.title)}</h2>
    <ul>
      ${s.email ? `<li>📧 <a href="mailto:${esc(s.email)}">${esc(s.email)}</a></li>` : ''}
      ${s.phone ? `<li>📞 ${esc(s.phone)}</li>` : ''}
      ${s.address ? `<li>📍 ${esc(s.address)}</li>` : ''}
    </ul>
  </section>`,
};

// A floating Claude-powered chat widget. `endpoint` is where it POSTs
// {messages:[{role,content}]} and expects {reply}. Palette-matched, and it
// degrades to a friendly message if the endpoint is unreachable.
export function chatWidget(name, endpoint, slug = '') {
  const greeting = `Hi! I'm the assistant for ${name}. Ask me anything.`;
  return `
<div id="hx-chat">
  <button id="hx-chat-btn" aria-label="Open chat">💬</button>
  <div id="hx-chat-panel" hidden>
    <div id="hx-chat-head"><span>${esc(name)}</span><button id="hx-chat-close" aria-label="Close">✕</button></div>
    <div id="hx-chat-msgs"></div>
    <form id="hx-chat-form"><input id="hx-chat-in" placeholder="Type a message…" autocomplete="off"><button type="submit">Send</button></form>
  </div>
</div>
<style>
  #hx-chat{position:fixed;right:20px;bottom:20px;z-index:9999;font-family:system-ui,sans-serif}
  #hx-chat-btn{width:56px;height:56px;border-radius:50%;border:none;cursor:pointer;font-size:24px;color:#fff;background:linear-gradient(135deg,var(--accent),var(--accent2));box-shadow:0 8px 24px rgba(0,0,0,.3)}
  #hx-chat-panel{position:absolute;right:0;bottom:70px;width:min(360px,86vw);height:min(480px,70vh);background:var(--surface);border:1px solid rgba(255,255,255,.12);border-radius:16px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 16px 48px rgba(0,0,0,.4)}
  #hx-chat-head{display:flex;justify-content:space-between;align-items:center;padding:12px 14px;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;font-weight:600}
  #hx-chat-head button{background:none;border:none;color:#fff;font-size:16px;cursor:pointer}
  #hx-chat-msgs{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px}
  .hx-m{max-width:82%;padding:9px 12px;border-radius:12px;font-size:14px;line-height:1.45}
  .hx-m.user{align-self:flex-end;background:var(--accent);color:#fff;border-bottom-right-radius:3px}
  .hx-m.bot{align-self:flex-start;background:rgba(255,255,255,.08);color:var(--text);border-bottom-left-radius:3px}
  #hx-chat-form{display:flex;gap:8px;padding:12px;border-top:1px solid rgba(255,255,255,.1)}
  #hx-chat-in{flex:1;padding:9px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.15);background:var(--bg);color:var(--text);font:inherit}
  #hx-chat-form button{padding:9px 14px;border:none;border-radius:10px;background:var(--accent);color:#fff;font-weight:600;cursor:pointer}
</style>
<script>
(function(){
  var ENDPOINT=${JSON.stringify(endpoint)};
  var msgs=[{role:'assistant',content:${JSON.stringify(greeting)}}];
  var panel=document.getElementById('hx-chat-panel'),box=document.getElementById('hx-chat-msgs');
  var btn=document.getElementById('hx-chat-btn'),form=document.getElementById('hx-chat-form'),input=document.getElementById('hx-chat-in');
  var KEY=${JSON.stringify('hx-chat-open-' + (slug || 'site'))};
  function render(){box.innerHTML=msgs.map(function(m){return '<div class="hx-m '+(m.role==='user'?'user':'bot')+'">'+m.content.replace(/[<>&]/g,function(c){return {'<':'&lt;','>':'&gt;','&':'&amp;'}[c];})+'</div>';}).join('');box.scrollTop=box.scrollHeight;}
  // Starts CLOSED (bubble only); remembers the visitor's choice per site.
  function toggle(open){panel.hidden=!open;try{localStorage.setItem(KEY,open?'1':'0');}catch(e){}if(open){render();input.focus();}}
  btn.onclick=function(){toggle(panel.hidden);};
  try{if(localStorage.getItem(KEY)==='1'){panel.hidden=false;render();}}catch(e){}
  document.getElementById('hx-chat-close').onclick=function(){toggle(false);};
  form.onsubmit=function(e){
    e.preventDefault();var t=input.value.trim();if(!t)return;input.value='';
    msgs.push({role:'user',content:t});msgs.push({role:'assistant',content:'…'});render();
    var send=msgs.filter(function(m){return m.content!=='…';});
    fetch(ENDPOINT,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({messages:send})})
      .then(function(r){return r.json();})
      .then(function(d){msgs.pop();msgs.push({role:'assistant',content:(d&&d.reply)||"Thanks! Please use the contact section and we'll follow up."});render();})
      .catch(function(){msgs.pop();msgs.push({role:'assistant',content:"I'm having trouble connecting — please use the contact section and we'll follow up."});render();});
  };
})();
<\/script>`;
}

export function renderSite(site, brain, opts = {}) {
  const p = PALETTES[site.palette] || PALETTES.midnight;
  const name = brain.businessName || site.name;
  const title = composeTitle(site, brain);
  const desc = composeMeta(site, brain);
  const canonical = opts.canonical || `/sites/${site.slug}`;
  const body = (site.sections || []).map((s) => (RENDERERS[s.type] || (() => ''))(s)).join('\n');
  const chatOn = opts.chat !== false && site.chatEnabled !== false;
  const widget = chatOn ? chatWidget(name, opts.chatEndpoint || `/api/sites/${site.slug}/chat`, site.slug) : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="website">
<style>
  :root{--bg:${p.bg};--surface:${p.surface};--text:${p.text};--muted:${p.muted};--accent:${p.accent};--accent2:${p.accent2}}
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,"Segoe UI",sans-serif;line-height:1.6}
  main{max-width:960px;margin:0 auto;padding:0 24px}
  h1{font-size:clamp(2rem,6vw,3.5rem);line-height:1.1;letter-spacing:-.02em}
  h2{font-size:clamp(1.4rem,4vw,2rem);margin-bottom:20px;letter-spacing:-.01em}
  p{color:var(--muted)}
  .hero{padding:96px 0 72px;text-align:center}
  .hero p{font-size:1.15rem;margin:20px auto 32px;max-width:600px}
  .btn{display:inline-block;background:linear-gradient(135deg,var(--accent),var(--accent2));color:#fff;padding:14px 32px;border-radius:12px;text-decoration:none;font-weight:600;transition:transform .15s}
  .btn:hover{transform:translateY(-2px)}
  section{padding:56px 0}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:20px}
  .card{background:var(--surface);border-radius:16px;padding:28px}
  .card .icon{font-size:1.8rem;margin-bottom:12px}
  .card h3{margin-bottom:8px}
  blockquote{font-size:1.05rem;color:var(--text);margin-bottom:12px}
  figcaption{color:var(--muted);font-size:.9rem}
  .cta-band{text-align:center;background:var(--surface);border-radius:24px;padding:56px 32px;margin:32px 0}
  .cta-band p{margin:12px 0 28px}
  .faq details{background:var(--surface);border-radius:12px;padding:14px 18px;margin-bottom:10px}
  .faq summary{cursor:pointer;font-weight:600}
  .faq p{margin-top:8px}
  .contact ul{list-style:none}
  .contact li{margin:8px 0}
  .contact a{color:var(--accent)}
  footer{text-align:center;padding:40px 0;color:var(--muted);font-size:.85rem}
</style>
</head>
<body>
<main>
${body}
</main>
<footer>© ${new Date().getFullYear()} ${esc(name)} · Built with HELIX</footer>
${widget}
</body>
</html>`;
}

// Parse the AI's JSON site-content response defensively.
export function parseSiteContent(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

export function siteGenPrompt(site, brain) {
  return `Generate website copy for "${site.name}". Respond with ONLY a JSON object shaped exactly like:
{"hero":{"headline":"","sub":"","cta":""},"features":{"title":"","items":[{"icon":"","title":"","text":""},{"icon":"","title":"","text":""},{"icon":"","title":"","text":""}]},"about":{"title":"","text":""},"cta":{"headline":"","sub":"","cta":""}}
Make it specific to the business, punchy, and conversion-focused. No markdown, no commentary.`;
}

export function applyGeneratedContent(site, content) {
  for (const sec of site.sections || []) {
    const c = content[sec.type];
    if (!c) continue;
    if (sec.type === 'hero' || sec.type === 'cta') {
      if (c.headline) sec.headline = String(c.headline);
      if (c.sub) sec.sub = String(c.sub);
      if (c.cta) sec.cta = String(c.cta);
    } else if (sec.type === 'features') {
      if (c.title) sec.title = String(c.title);
      if (Array.isArray(c.items) && c.items.length) {
        sec.items = c.items.slice(0, 6).map((i) => ({
          icon: String(i.icon || '✨'), title: String(i.title || ''), text: String(i.text || ''),
        }));
      }
    } else if (sec.type === 'about') {
      if (c.title) sec.title = String(c.title);
      if (c.text) sec.text = String(c.text);
    }
  }
}
