/* HELIX SPA — vanilla JS, hash router, zero dependencies. */
'use strict';

// ---------- utilities ----------
const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `${res.status} error`);
  return data;
}

function toast(msg, isErr = false) {
  let stack = $('#toasts');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'toasts';
    document.body.appendChild(stack);
  }
  const el = document.createElement('div');
  el.className = 'toast' + (isErr ? ' err' : '');
  el.textContent = msg;
  stack.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function timeAgo(ts) {
  if (!ts) return '';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// Minimal markdown → HTML (input is escaped first).
function md(text) {
  let t = esc(text);
  // code blocks
  t = t.replace(/```([\s\S]*?)```/g, (_, c) => `<pre><code>${c.trim()}</code></pre>`);
  // tables
  t = t.replace(/((?:^\|.*\|\s*$\n?)+)/gm, (block) => {
    const rows = block.trim().split('\n').map((r) => r.trim());
    if (rows.length < 2) return block;
    const cells = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    const head = cells(rows[0]);
    const body = rows.slice(rows[1].match(/^\|[\s\-:|]+\|$/) ? 2 : 1);
    return `<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${
      body.map((r) => `<tr>${cells(r).map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  });
  const lines = t.split('\n');
  const out = [];
  let list = null; // 'ul' | 'ol'
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const line of lines) {
    if (/^<(pre|table)/.test(line) || /^<\/(pre|table)/.test(line)) { closeList(); out.push(line); continue; }
    const h = line.match(/^(#{1,3})\s+(.*)/);
    if (h) { closeList(); out.push(`<h${h[1].length}>${h[2]}</h${h[1].length}>`); continue; }
    if (/^\s*[-*]\s+\[[ x]\]\s+/.test(line)) {
      if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; }
      const done = /\[x\]/i.test(line);
      out.push(`<li>${done ? '☑' : '☐'} ${line.replace(/^\s*[-*]\s+\[[ x]\]\s+/i, '')}</li>`);
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; }
      out.push(`<li>${line.replace(/^\s*[-*]\s+/, '')}</li>`);
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol'; }
      out.push(`<li>${line.replace(/^\s*\d+\.\s+/, '')}</li>`);
      continue;
    }
    closeList();
    if (/^---+\s*$/.test(line)) { out.push('<hr>'); continue; }
    if (/^&gt;\s?/.test(line)) { out.push(`<blockquote>${line.replace(/^&gt;\s?/, '')}</blockquote>`); continue; }
    if (line.trim() === '') { out.push(''); continue; }
    out.push(`<p>${line}</p>`);
  }
  closeList();
  let html = out.join('\n');
  html = html
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  return `<div class="md">${html}</div>`;
}

function modal(inner, { wide = false } = {}) {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal${wide ? ' wide' : ''}">${inner}</div>`;
  back.addEventListener('click', (e) => { if (e.target === back) back.remove(); });
  document.body.appendChild(back);
  return back;
}

// ---------- app state ----------
const state = { boot: null, helpers: [], helperMap: {}, powerups: [] };

async function loadBoot() {
  state.boot = await api('GET', '/api/bootstrap');
  state.helpers = state.boot.helpers;
  state.helperMap = Object.fromEntries(state.helpers.map((h) => [h.id, h]));
  state.powerups = state.boot.powerups;
}

// ---------- router ----------
const routes = {};
function navigate() {
  const hash = location.hash.slice(2) || 'dashboard';
  const [page, ...rest] = hash.split('/');
  renderSidebar(page);
  const fn = routes[page] || routes.dashboard;
  // Each navigation renders into its own container. Switching pages detaches
  // the old container, so a slower (stale) route can never overwrite the
  // page the user is actually looking at.
  const root = document.createElement('div');
  root.innerHTML = '<div class="page"><p class="muted">Loading…</p></div>';
  const host = $('#main');
  host.replaceChildren(root);
  closeDrawer();
  fn(root, rest).catch((e) => {
    if (!root.isConnected) return; // superseded by a newer navigation
    root.innerHTML = `<div class="page"><div class="empty"><div class="big">⚠️</div>${esc(e.message)}</div></div>`;
  });
}
window.addEventListener('hashchange', navigate);

// ---------- mobile nav drawer ----------
function closeDrawer() {
  $('#sidebar')?.classList.remove('open');
  $('#backdrop')?.classList.remove('show');
}
$('#menuBtn')?.addEventListener('click', () => {
  $('#sidebar').classList.toggle('open');
  $('#backdrop').classList.toggle('show', $('#sidebar').classList.contains('open'));
});
$('#backdrop')?.addEventListener('click', closeDrawer);
$('#sidebar')?.addEventListener('click', (e) => { if (e.target.closest('a')) closeDrawer(); });

// ---------- sidebar ----------
const NAV = [
  { label: 'Workspace' },
  { id: 'dashboard', icon: '⬢', name: 'Dashboard' },
  { id: 'autopilot', icon: '🚀', name: 'Autopilot' },
  { id: 'helpers', icon: '👥', name: 'AI Team' },
  { id: 'brain', icon: '🧠', name: 'Brain' },
  { id: 'tasks', icon: '✅', name: 'Tasks' },
  { id: 'inbox', icon: '📥', name: 'Inbox', badge: 'unread' },
  { label: 'Create' },
  { id: 'powerups', icon: '⚡', name: 'Power-ups' },
  { id: 'documents', icon: '📄', name: 'Documents' },
  { id: 'sites', icon: '🌐', name: 'Website Studio' },
  { label: 'Grow' },
  { id: 'marketing', icon: '📣', name: 'Marketing' },
  { id: 'seo', icon: '🔍', name: 'SEO' },
  { id: 'automations', icon: '🔁', name: 'Automations' },
  { id: 'analytics', icon: '📊', name: 'Analytics' },
  { label: 'Connect' },
  { id: 'integrations', icon: '🔌', name: 'Integrations', badge: 'integrations' },
  { label: 'Learn' },
  { id: 'about', icon: '✨', name: 'About HELIX' },
  { id: 'howto', icon: '🧭', name: 'How-to & Tips' },
  { label: 'System' },
  { id: 'settings', icon: '⚙️', name: 'Settings' },
];

function renderSidebar(active) {
  const counts = state.boot?.counts || {};
  $('#sidebar').innerHTML = `
    <div class="logo"><span class="mark">⬢</span><span>HELIX<small>AI BUSINESS TEAM</small></span></div>
    <nav class="nav">
      ${NAV.map((n) => n.label
        ? `<div class="nav-label">${n.label}</div>`
        : `<a href="#/${n.id}" class="${active === n.id ? 'active' : ''}">
             <span>${n.icon}</span><span>${n.name}</span>
             ${n.badge && counts[n.badge] ? `<span class="badge acc">${counts[n.badge]}</span>` : ''}
           </a>`).join('')}
    </nav>`;
}

// ---------- pages ----------
routes.dashboard = async (main) => {
  const [brainRes, tasks, docs, analytics, inbox] = await Promise.all([
    api('GET', '/api/brain'), api('GET', '/api/tasks'),
    api('GET', '/api/documents'), api('GET', '/api/analytics'),
    api('GET', '/api/inbox'),
  ]);
  await loadBoot();
  const brain = brainRes.brain;
  const setup = !!brain.businessName;
  const open = tasks.filter((t) => t.status !== 'done').length;
  main.innerHTML = `<div class="page">
    <div class="page-head">
      <div><h1>${setup ? `Welcome back, ${esc(brain.businessName)}` : 'Welcome to HELIX'}</h1>
      <p>Your 12-person AI team is on the clock. ${setup ? 'Here’s where things stand.' : 'Start by teaching the Brain about your business.'}</p></div>
      ${setup ? '' : '<a class="btn" href="#/brain">🧠 Set up your Brain</a>'}
    </div>
    <div class="grid c4" style="margin-bottom:22px">
      <div class="card stat"><div class="num">${open}</div><div class="lbl">Open tasks</div></div>
      <div class="card stat"><div class="num">${docs.length}</div><div class="lbl">Documents created</div></div>
      <div class="card stat"><div class="num">${state.boot.counts.sites}</div><div class="lbl">Live websites</div></div>
      <div class="card stat"><div class="num">${analytics.total}</div><div class="lbl">Site pageviews</div></div>
    </div>
    <div class="grid" style="grid-template-columns: 1.2fr .8fr; align-items:start">
      <div>
        <div class="card pad0">
          <div class="row spread" style="padding:14px 16px;border-bottom:1px solid var(--border)"><b>Quick actions</b></div>
          ${[
            ['#/helpers', '💬', 'Ask your AI team', 'Chat with any of your 12 specialists'],
            ['#/powerups', '⚡', 'Run a power-up', 'One-click deliverables: plans, scripts, briefs'],
            ['#/sites', '🌐', 'Build a website', 'Generate and publish a real site in seconds'],
            ['#/marketing', '📣', 'Plan a week of content', 'Auto-generate a social calendar'],
            ['#/seo', '🔍', 'Audit your SEO', 'Score any page with 13 on-page checks'],
          ].map(([href, ic, t, d]) => `<a class="list-row" href="${href}" style="color:inherit"><span style="font-size:20px">${ic}</span><span><b>${t}</b><div class="dim">${d}</div></span><span style="margin-left:auto" class="dim">→</span></a>`).join('')}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:14px">
        <div class="card">
          <b>Latest from your team</b>
          ${inbox.length ? inbox.slice(0, 5).map((i) => `
            <div style="margin-top:11px;padding-top:11px;border-top:1px solid var(--border)">
              <div class="row spread"><b style="font-size:13px">${esc(i.title)}</b>${i.read ? '' : '<span class="badge acc">new</span>'}</div>
              <div class="dim">${timeAgo(i.createdAt)}${i.documentId ? ` · <a href="#/documents/${i.documentId}">open</a>` : ''}</div>
            </div>`).join('')
          : '<p class="dim" style="margin-top:8px">Nothing yet — run an automation or a power-up and results land here.</p>'}
        </div>
        <div class="card">
          <b>Your AI team</b>
          <div class="row" style="margin-top:10px;gap:6px">
            ${state.helpers.map((h) => `<a href="#/chat/${h.id}" title="${h.name} — ${h.role}" class="avatar" style="background:${h.color}22">${h.emoji}</a>`).join('')}
          </div>
        </div>
      </div>
    </div>
  </div>`;
};

routes.helpers = async (main) => {
  await loadBoot();
  main.innerHTML = `<div class="page">
    <div class="page-head"><div><h1>Your AI Team</h1><p>Twelve specialists, always available, already briefed on your business via the Brain.</p></div></div>
    <div class="grid c3">
      ${state.helpers.map((h) => `
        <a class="card" href="#/chat/${h.id}" style="color:inherit;display:block">
          <div class="row"><span class="avatar" style="background:${h.color}22">${h.emoji}</span>
            <span><b>${h.name}</b><div class="dim">${h.role}</div></span></div>
          <p class="muted" style="margin:10px 0 12px;font-size:13px">${h.blurb}</p>
          <div class="row" style="gap:5px">${h.skills.slice(0, 3).map((s) => `<span class="badge">${s}</span>`).join('')}</div>
        </a>`).join('')}
    </div>
  </div>`;
};

routes.chat = async (main, [helperId, chatId]) => {
  await loadBoot();
  const helper = state.helperMap[helperId];
  if (!helper) { location.hash = '#/helpers'; return; }
  const chats = await api('GET', `/api/chats?helper=${helperId}`);
  let chat = null;
  if (chatId) chat = await api('GET', `/api/chats/${chatId}`).catch(() => null);

  main.innerHTML = `<div class="page">
    <div class="page-head">
      <div class="row">
        <a class="btn ghost sm" href="#/helpers">←</a>
        <span class="avatar" style="background:${helper.color}22">${helper.emoji}</span>
        <div><h1 style="font-size:19px">${helper.name}</h1><div class="dim">${helper.role}</div></div>
      </div>
      <button class="btn ghost" id="newChat">+ New conversation</button>
    </div>
    <div class="chat-layout">
      <div class="chat-list" id="chatList">
        ${chats.length ? chats.map((c) => `
          <div class="item ${chat && c.id === chat.id ? 'active' : ''}" data-id="${c.id}">
            <b style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(c.title)}</b>
            <span class="dim">${c.messageCount} messages · ${timeAgo(c.createdAt)}</span>
          </div>`).join('') : '<div class="dim chat-empty" style="padding:10px">No conversations yet.</div>'}
      </div>
      <div class="chat-panel">
        <div class="chat-msgs" id="msgs">
          ${chat ? '' : `<div class="empty" style="border:none"><div class="big">${helper.emoji}</div>
            <b>${helper.name}</b> is ready.<br><span class="dim">Try: “${helper.skills[0]}”. Start typing below — a conversation is created automatically.</span></div>`}
        </div>
        <div class="chat-input">
          <textarea id="input" placeholder="Ask ${helper.name} anything…" rows="1"></textarea>
          <button class="btn" id="send">Send</button>
        </div>
      </div>
    </div>
  </div>`;

  const msgs = $('#msgs', main);
  const input = $('#input', main);
  const sendBtn = $('#send', main);
  const chatList = $('#chatList', main);
  function renderMsgs() {
    if (!chat) return;
    msgs.innerHTML = chat.messages.map((m) => `
      <div class="msg ${m.role}">
        <div class="meta">${m.role === 'user' ? 'You' : `${helper.emoji} ${helper.name}${m.engine === 'offline' ? ' · offline engine' : ''}`}</div>
        ${m.role === 'user' ? `<div>${esc(m.content)}</div>` : md(m.content)}
      </div>`).join('');
    msgs.scrollTop = msgs.scrollHeight;
  }
  renderMsgs();

  chatList.addEventListener('click', (e) => {
    const item = e.target.closest('.item');
    if (item) location.hash = `#/chat/${helperId}/${item.dataset.id}`;
  });
  $('#newChat', main).onclick = () => { location.hash = `#/chat/${helperId}`; };

  async function send() {
    const content = input.value.trim();
    if (!content) return;
    input.value = '';
    sendBtn.disabled = true;
    try {
      if (!chat) chat = await api('POST', '/api/chats', { helperId });
      chat.messages.push({ role: 'user', content, at: Date.now() });
      renderMsgs();
      msgs.insertAdjacentHTML('beforeend', `<div class="msg assistant" data-typing><div class="typing"><i></i><i></i><i></i></div></div>`);
      msgs.scrollTop = msgs.scrollHeight;
      const { reply } = await api('POST', `/api/chats/${chat.id}/messages`, { content });
      $('[data-typing]', msgs)?.remove();
      chat.messages.push(reply);
      renderMsgs();
      if (chat.messages.length === 2) {
        history.replaceState(null, '', `#/chat/${helperId}/${chat.id}`);
        // show the new conversation in the sidebar list immediately
        $('.chat-empty', chatList)?.remove();
        chatList.insertAdjacentHTML('afterbegin', `
          <div class="item active" data-id="${chat.id}">
            <b style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(content.slice(0, 60))}</b>
            <span class="dim">2 messages · just now</span>
          </div>`);
      }
    } catch (e) {
      $('[data-typing]', msgs)?.remove();
      toast(e.message, true);
    } finally {
      sendBtn.disabled = false;
      input.focus();
    }
  }
  sendBtn.onclick = send;
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });
  input.focus();
};

routes.brain = async (main) => {
  const { brain, knowledge } = await api('GET', '/api/brain');
  const F = (key, label, ph, textarea = false) => `
    <label>${label}</label>
    ${textarea
      ? `<textarea name="${key}" placeholder="${ph}">${esc(brain[key])}</textarea>`
      : `<input name="${key}" placeholder="${ph}" value="${esc(brain[key])}">`}`;
  main.innerHTML = `<div class="page">
    <div class="page-head"><div><h1>🧠 Brain</h1>
      <p>Everything your AI team knows about your business. Fill this in once — every helper, power-up, website, and automation uses it automatically.</p></div></div>
    <div class="grid" style="grid-template-columns:1.1fr .9fr;align-items:start">
      <form class="card" id="brainForm">
        ${F('businessName', 'Business name', 'Acme Studio')}
        ${F('tagline', 'Tagline', 'Design that ships')}
        ${F('industry', 'Industry', 'Design agency')}
        ${F('description', 'What you do', 'One paragraph about your business…', true)}
        ${F('audience', 'Target audience', 'Early-stage startup founders')}
        ${F('products', 'Products / services', 'Brand kits, landing pages, retainers')}
        ${F('tone', 'Brand tone', 'friendly and professional')}
        ${F('goals', 'Current goals', 'Double inbound leads this quarter')}
        ${F('website', 'Existing website', 'https://…')}
        ${F('location', 'Location', 'Austin, TX')}
        <div style="margin-top:16px"><button class="btn" type="submit">Save Brain</button></div>
      </form>
      <div>
        <div class="card">
          <div class="row spread"><b>Knowledge base</b><button class="btn ghost sm" id="addK">+ Add</button></div>
          <p class="dim" style="margin:6px 0 4px">Facts, policies, FAQs, product specs — pasted once, used everywhere.</p>
          <div id="kList">
            ${knowledge.length ? knowledge.map((k) => `
              <div style="margin-top:11px;padding-top:11px;border-top:1px solid var(--border)">
                <div class="row spread"><b style="font-size:13px">${esc(k.title)}</b>
                  <button class="btn danger sm" data-del="${k.id}">✕</button></div>
                <div class="dim" style="max-height:48px;overflow:hidden">${esc(k.content).slice(0, 180)}</div>
              </div>`).join('') : '<p class="dim" style="margin-top:10px">Empty — add your first knowledge item.</p>'}
          </div>
        </div>
      </div>
    </div>
  </div>`;

  $('#brainForm').onsubmit = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target));
    await api('PUT', '/api/brain', body);
    toast('Brain updated — your whole team just got smarter 🧠');
  };
  $('#addK').onclick = () => {
    const m = modal(`
      <h2>Add knowledge</h2><p class="dim">Paste anything your team should know.</p>
      <label>Title</label><input id="kTitle" placeholder="Refund policy">
      <label>Content</label><textarea id="kContent" rows="6" placeholder="Paste the details…"></textarea>
      <div class="actions"><button class="btn ghost" id="kCancel">Cancel</button><button class="btn" id="kSave">Add</button></div>`);
    $('#kCancel', m).onclick = () => m.remove();
    $('#kSave', m).onclick = async () => {
      try {
        await api('POST', '/api/brain/knowledge', { title: $('#kTitle', m).value, content: $('#kContent', m).value });
        m.remove(); toast('Knowledge added'); navigate();
      } catch (err) { toast(err.message, true); }
    };
  };
  $(".page", main).addEventListener('click', async (e) => {
    const id = e.target.dataset?.del;
    if (id) { await api('DELETE', `/api/brain/knowledge/${id}`); navigate(); }
  });
};

routes.tasks = async (main) => {
  await loadBoot();
  const tasks = await api('GET', '/api/tasks');
  const cols = [['todo', 'To do'], ['doing', 'In progress'], ['done', 'Done']];
  const prio = { high: '<span class="badge warn">high</span>', medium: '', low: '<span class="badge">low</span>' };
  main.innerHTML = `<div class="page">
    <div class="page-head"><div><h1>✅ Tasks</h1><p>Assign work to yourself — or to an AI teammate who’ll actually complete it and attach the deliverable.</p></div>
      <button class="btn" id="newTask">+ New task</button></div>
    <div class="kanban">
      ${cols.map(([key, name]) => `
        <div class="col"><h3>${name}<span>${tasks.filter((t) => t.status === key).length}</span></h3>
          ${tasks.filter((t) => t.status === key).map((t) => `
            <div class="task-card">
              <div class="t">${esc(t.title)}</div>
              ${t.notes ? `<div class="dim" style="margin-bottom:6px">${esc(t.notes).slice(0, 100)}</div>` : ''}
              <div class="row spread">
                <span class="row" style="gap:6px">
                  ${t.helperId ? `<span class="avatar sm" style="background:${state.helperMap[t.helperId].color}22" title="${state.helperMap[t.helperId].name}">${state.helperMap[t.helperId].emoji}</span>` : ''}
                  ${prio[t.priority] || ''}
                </span>
                <span class="row" style="gap:5px">
                  ${t.deliverableId ? `<a class="btn ghost sm" href="#/documents/${t.deliverableId}">📄</a>` : ''}
                  ${t.status !== 'done' && t.helperId ? `<button class="btn sm" data-run="${t.id}" title="Let ${state.helperMap[t.helperId].name} complete this">▶ AI run</button>` : ''}
                  ${key !== 'todo' ? `<button class="btn ghost sm" data-move="${t.id}:${key === 'done' ? 'doing' : 'todo'}">←</button>` : ''}
                  ${key !== 'done' ? `<button class="btn ghost sm" data-move="${t.id}:${key === 'todo' ? 'doing' : 'done'}">→</button>` : ''}
                  <button class="btn danger sm" data-del="${t.id}">✕</button>
                </span>
              </div>
            </div>`).join('')}
        </div>`).join('')}
    </div>
  </div>`;

  $('#newTask').onclick = () => {
    const m = modal(`
      <h2>New task</h2>
      <label>Title</label><input id="tTitle" placeholder="Write launch announcement">
      <label>Notes</label><textarea id="tNotes" rows="3" placeholder="Optional details…"></textarea>
      <label>Assign to</label>
      <select id="tHelper"><option value="">Me (no AI)</option>
        ${state.helpers.map((h) => `<option value="${h.id}">${h.emoji} ${h.name} — ${h.role}</option>`).join('')}</select>
      <label>Priority</label>
      <select id="tPrio"><option>medium</option><option>high</option><option>low</option></select>
      <div class="actions"><button class="btn ghost" id="tCancel">Cancel</button><button class="btn" id="tSave">Create</button></div>`);
    $('#tCancel', m).onclick = () => m.remove();
    $('#tSave', m).onclick = async () => {
      try {
        await api('POST', '/api/tasks', {
          title: $('#tTitle', m).value, notes: $('#tNotes', m).value,
          helperId: $('#tHelper', m).value || undefined, priority: $('#tPrio', m).value,
        });
        m.remove(); navigate();
      } catch (err) { toast(err.message, true); }
    };
  };

  $(".page", main).addEventListener('click', async (e) => {
    const t = e.target;
    if (t.dataset.move) {
      const [id, status] = t.dataset.move.split(':');
      await api('PATCH', `/api/tasks/${id}`, { status }); navigate();
    } else if (t.dataset.del) {
      await api('DELETE', `/api/tasks/${t.dataset.del}`); navigate();
    } else if (t.dataset.run) {
      t.disabled = true; t.textContent = '⏳ working…';
      try {
        const { document: doc } = await api('POST', `/api/tasks/${t.dataset.run}/run`);
        toast('Task completed — deliverable attached 📄');
        location.hash = `#/documents/${doc.id}`;
      } catch (err) { toast(err.message, true); navigate(); }
    }
  });
};

routes.inbox = async (main) => {
  const inbox = await api('GET', '/api/inbox');
  await api('POST', '/api/inbox/read');
  await loadBoot();
  main.innerHTML = `<div class="page">
    <div class="page-head"><div><h1>📥 Inbox</h1><p>Results from automations and your AI team land here.</p></div></div>
    ${inbox.length ? `<div class="card pad0">${inbox.map((i) => `
      <a class="list-row" href="${i.documentId ? `#/documents/${i.documentId}` : '#'}" style="color:inherit">
        ${state.helperMap[i.from] ? `<span class="avatar sm" style="background:${state.helperMap[i.from].color}22">${state.helperMap[i.from].emoji}</span>` : '📄'}
        <span style="flex:1"><b>${esc(i.title)}</b><div class="dim">${esc(i.body)}…</div></span>
        <span class="dim">${timeAgo(i.createdAt)}</span>
      </a>`).join('')}</div>`
    : '<div class="empty"><div class="big">📥</div>Nothing yet. Create an automation and results will appear here on schedule.</div>'}
  </div>`;
};

routes.powerups = async (main) => {
  await loadBoot();
  main.innerHTML = `<div class="page">
    <div class="page-head"><div><h1>⚡ Power-ups</h1><p>One-click structured deliverables, produced by the right specialist and saved to your documents.</p></div></div>
    <div class="grid c3">
      ${state.powerups.map((p) => {
        const h = state.helperMap[p.helperId];
        return `<div class="card">
          <div class="row spread"><span style="font-size:24px">${p.icon}</span>
            <span class="avatar sm" title="${h.name}" style="background:${h.color}22">${h.emoji}</span></div>
          <b style="display:block;margin:10px 0 4px">${p.name}</b>
          <p class="dim" style="min-height:34px">${p.desc}</p>
          <button class="btn sm" style="margin-top:10px" data-pu="${p.id}">Run power-up</button>
        </div>`;
      }).join('')}
    </div>
  </div>`;

  $(".page", main).addEventListener('click', (e) => {
    const id = e.target.dataset?.pu;
    if (!id) return;
    const p = state.powerups.find((x) => x.id === id);
    const m = modal(`
      <h2>${p.icon} ${p.name}</h2><p class="dim">${p.desc}</p>
      ${p.fields.map((f) => `<label>${f.label}${f.required ? ' *' : ''}</label><input data-key="${f.key}" placeholder="${esc(f.placeholder)}">`).join('')}
      <div class="actions"><button class="btn ghost" id="puCancel">Cancel</button><button class="btn" id="puRun">⚡ Generate</button></div>`);
    $('#puCancel', m).onclick = () => m.remove();
    $('#puRun', m).onclick = async () => {
      const inputs = {};
      m.querySelectorAll('[data-key]').forEach((i) => { inputs[i.dataset.key] = i.value; });
      const btn = $('#puRun', m);
      btn.disabled = true; btn.textContent = '⏳ Generating…';
      try {
        const doc = await api('POST', `/api/powerups/${id}/run`, { inputs });
        m.remove(); toast('Deliverable ready 📄');
        location.hash = `#/documents/${doc.id}`;
      } catch (err) { btn.disabled = false; btn.textContent = '⚡ Generate'; toast(err.message, true); }
    };
  });
};

routes.documents = async (main, [docId]) => {
  await loadBoot();
  if (docId) {
    const doc = await api('GET', `/api/documents/${docId}`);
    const h = state.helperMap[doc.helperId];
    main.innerHTML = `<div class="page">
      <div class="page-head">
        <div class="row"><a class="btn ghost sm" href="#/documents">←</a>
          <div><h1 style="font-size:19px">${esc(doc.title)}</h1>
          <div class="dim">${h ? `${h.emoji} ${h.name}` : ''} · ${timeAgo(doc.createdAt)} · <span class="badge">${doc.kind}</span>${doc.engine === 'offline' ? ' <span class="badge">offline engine</span>' : ''}</div></div></div>
        <div class="row">
          <button class="btn ghost" id="copyDoc">📋 Copy</button>
          <button class="btn danger" id="delDoc">Delete</button>
        </div>
      </div>
      <div class="card doc-view">${md(doc.content)}</div>
    </div>`;
    $('#copyDoc').onclick = async () => { await navigator.clipboard.writeText(doc.content); toast('Copied to clipboard'); };
    $('#delDoc').onclick = async () => { await api('DELETE', `/api/documents/${docId}`); location.hash = '#/documents'; };
    return;
  }
  const docs = await api('GET', '/api/documents');
  main.innerHTML = `<div class="page">
    <div class="page-head"><div><h1>📄 Documents</h1><p>Every deliverable your team produces, in one library.</p></div></div>
    ${docs.length ? `<div class="card pad0">${docs.map((d) => {
      const h = state.helperMap[d.helperId];
      return `<a class="list-row" href="#/documents/${d.id}" style="color:inherit">
        ${h ? `<span class="avatar sm" style="background:${h.color}22">${h.emoji}</span>` : '📄'}
        <span style="flex:1"><b>${esc(d.title)}</b><div class="dim">${esc(d.preview)}…</div></span>
        <span class="badge">${d.kind}</span><span class="dim">${timeAgo(d.createdAt)}</span>
      </a>`;
    }).join('')}</div>`
    : '<div class="empty"><div class="big">📄</div>No documents yet. Run a <a href="#/powerups">power-up</a> or let a helper complete a <a href="#/tasks">task</a>.</div>'}
  </div>`;
};

routes.automations = async (main) => {
  await loadBoot();
  const autos = await api('GET', '/api/automations');
  main.innerHTML = `<div class="page">
    <div class="page-head"><div><h1>🔁 Automations</h1><p>Recurring work your team does on a schedule — results land in your inbox and documents.</p></div>
      <button class="btn" id="newAuto">+ New automation</button></div>
    ${autos.length ? `<div class="grid c2">${autos.map((a) => {
      const h = state.helperMap[a.helperId];
      const sched = a.schedule.type === 'daily' ? `daily at ${a.schedule.time}` : `every ${a.schedule.minutes} min`;
      return `<div class="card">
        <div class="row spread">
          <div class="row"><span class="avatar sm" style="background:${h.color}22">${h.emoji}</span><b>${esc(a.name)}</b></div>
          <span class="badge ${a.enabled ? 'on' : ''}">${a.enabled ? 'active' : 'paused'}</span>
        </div>
        <p class="dim" style="margin:9px 0">${esc(a.prompt).slice(0, 120)}</p>
        <div class="dim">⏱ ${sched} · ran ${a.runs || 0}× ${a.lastRun ? `· last ${timeAgo(a.lastRun)}` : ''}</div>
        <div class="row" style="margin-top:12px">
          <button class="btn sm" data-run="${a.id}">▶ Run now</button>
          <button class="btn ghost sm" data-toggle="${a.id}:${!a.enabled}">${a.enabled ? '⏸ Pause' : '▶ Resume'}</button>
          <button class="btn danger sm" data-del="${a.id}">✕</button>
        </div>
      </div>`;
    }).join('')}</div>`
    : `<div class="empty"><div class="big">🔁</div>No automations yet.<br><span class="dim">Try: “Every Monday, draft 5 social post ideas” or “Daily competitor-watch checklist”.</span></div>`}
  </div>`;

  $('#newAuto').onclick = () => {
    const m = modal(`
      <h2>New automation</h2>
      <label>Name</label><input id="aName" placeholder="Weekly social ideas">
      <label>Helper</label>
      <select id="aHelper">${state.helpers.map((h) => `<option value="${h.id}">${h.emoji} ${h.name} — ${h.role}</option>`).join('')}</select>
      <label>Prompt (what should they do each run?)</label>
      <textarea id="aPrompt" rows="3" placeholder="Draft 5 social post ideas for this week based on our goals"></textarea>
      <label>Schedule</label>
      <div class="row">
        <select id="aType" style="width:auto"><option value="interval">Every N minutes</option><option value="daily">Daily at time</option></select>
        <input id="aMinutes" type="number" value="1440" min="1" style="width:110px">
        <input id="aTime" type="time" value="09:00" style="width:130px;display:none">
      </div>
      <div class="actions"><button class="btn ghost" id="aCancel">Cancel</button><button class="btn" id="aSave">Create</button></div>`);
    $('#aType', m).onchange = (e) => {
      const daily = e.target.value === 'daily';
      $('#aMinutes', m).style.display = daily ? 'none' : '';
      $('#aTime', m).style.display = daily ? '' : 'none';
    };
    $('#aCancel', m).onclick = () => m.remove();
    $('#aSave', m).onclick = async () => {
      try {
        const type = $('#aType', m).value;
        await api('POST', '/api/automations', {
          name: $('#aName', m).value, prompt: $('#aPrompt', m).value, helperId: $('#aHelper', m).value,
          schedule: type === 'daily' ? { type, time: $('#aTime', m).value } : { type, minutes: Number($('#aMinutes', m).value) },
        });
        m.remove(); navigate();
      } catch (err) { toast(err.message, true); }
    };
  };

  $(".page", main).addEventListener('click', async (e) => {
    const t = e.target;
    if (t.dataset.run) {
      t.disabled = true; t.textContent = '⏳ running…';
      try { await api('POST', `/api/automations/${t.dataset.run}/run`); toast('Done — check your inbox 📥'); }
      catch (err) { toast(err.message, true); }
      navigate();
    } else if (t.dataset.toggle) {
      const [id, enabled] = t.dataset.toggle.split(':');
      await api('PATCH', `/api/automations/${id}`, { enabled: enabled === 'true' }); navigate();
    } else if (t.dataset.del) {
      await api('DELETE', `/api/automations/${t.dataset.del}`); navigate();
    }
  });
};

routes.sites = async (main, [siteId]) => {
  await loadBoot();
  if (siteId) return siteEditor(main, siteId);
  const sites = await api('GET', '/api/sites');
  main.innerHTML = `<div class="page">
    <div class="page-head"><div><h1>🌐 Website Studio</h1><p>Generate a real website from your Brain, edit every section, and it’s live instantly at its own URL.</p></div>
      <button class="btn" id="newSite">+ New website</button></div>
    ${sites.length ? `<div class="grid c2">${sites.map((s) => `
      <div class="card">
        <div class="row spread"><b>${esc(s.name)}</b>
          <span class="badge ${s.published ? 'on' : ''}">${s.published ? 'live' : 'unpublished'}</span></div>
        <div class="dim" style="margin:6px 0 12px">/sites/${s.slug} · ${s.sections.length} sections · ${s.palette}</div>
        <div class="row">
          <a class="btn sm" href="#/sites/${s.id}">✏️ Edit</a>
          <a class="btn ghost sm" href="/sites/${s.slug}" target="_blank">↗ View live</a>
          <button class="btn danger sm" data-del="${s.id}">✕</button>
        </div>
      </div>`).join('')}</div>`
    : '<div class="empty"><div class="big">🌐</div>No websites yet. Click “New website” — you’ll have a live page in under ten seconds.</div>'}
  </div>`;

  $('#newSite').onclick = () => {
    const m = modal(`
      <h2>New website</h2><p class="dim">Content is generated from your Brain profile — set that up first for best results.</p>
      <label>Site name</label><input id="sName" placeholder="My Business">
      <label>Color palette</label>
      <select id="sPalette">${state.boot.palettes.map((p) => `<option>${p}</option>`).join('')}</select>
      <div class="actions"><button class="btn ghost" id="sCancel">Cancel</button><button class="btn" id="sSave">Create & generate</button></div>`);
    $('#sCancel', m).onclick = () => m.remove();
    $('#sSave', m).onclick = async () => {
      const btn = $('#sSave', m);
      btn.disabled = true; btn.textContent = '⏳ Building…';
      try {
        const site = await api('POST', '/api/sites', { name: $('#sName', m).value, palette: $('#sPalette', m).value });
        await api('POST', `/api/sites/${site.id}/generate`);
        m.remove(); toast('Website is live 🎉');
        location.hash = `#/sites/${site.id}`;
      } catch (err) { btn.disabled = false; btn.textContent = 'Create & generate'; toast(err.message, true); }
    };
  };
  $(".page", main).addEventListener('click', async (e) => {
    if (e.target.dataset?.del) {
      await api('DELETE', `/api/sites/${e.target.dataset.del}`); navigate();
    }
  });
};

async function siteEditor(main, siteId) {
  const site = await api('GET', `/api/sites/${siteId}`);
  const secFields = {
    hero: ['headline', 'sub', 'cta', 'ctaLink'],
    features: ['title'],
    about: ['title', 'text'],
    testimonials: ['title'],
    cta: ['headline', 'sub', 'cta', 'ctaLink'],
    contact: ['title', 'email', 'phone', 'address'],
  };
  main.innerHTML = `<div class="page">
    <div class="page-head">
      <div class="row"><a class="btn ghost sm" href="#/sites">←</a>
        <div><h1 style="font-size:19px">${esc(site.name)}</h1>
        <div class="dim">Live at <a href="/sites/${site.slug}" target="_blank">/sites/${site.slug}</a></div></div></div>
      <div class="row">
        <select id="palette" style="width:auto">${state.boot.palettes.map((p) => `<option ${p === site.palette ? 'selected' : ''}>${p}</option>`).join('')}</select>
        <button class="btn ghost" id="regen">🪄 Regenerate copy</button>
        <button class="btn ghost" id="chatToggle">${site.chatEnabled === false ? '💬 Enable chat' : '💬 Chat: on'}</button>
        <button class="btn ghost" id="toggle">${site.published ? '⏸ Unpublish' : '▶ Publish'}</button>
        <a class="btn ghost" id="exportBtn" href="/api/sites/${site.id}/export" download>⬇ Export for Netlify</a>
        <a class="btn" href="/sites/${site.slug}" target="_blank">↗ View live</a>
      </div>
    </div>
    <div class="grid" style="grid-template-columns:1fr 1fr;align-items:start">
      <div id="sections">
        ${site.sections.map((sec, i) => `
          <div class="card" style="margin-bottom:12px">
            <div class="row spread"><b style="text-transform:capitalize">${sec.type}</b><span class="badge">#${i + 1}</span></div>
            ${(secFields[sec.type] || []).map((f) => `
              <label>${f}</label>
              ${f === 'text' || f === 'sub'
                ? `<textarea data-sec="${i}" data-f="${f}" rows="2">${esc(sec[f] || '')}</textarea>`
                : `<input data-sec="${i}" data-f="${f}" value="${esc(sec[f] || '')}">`}`).join('')}
            ${Array.isArray(sec.items) ? sec.items.map((item, j) => `
              <div style="margin-top:10px;padding:10px;border:1px solid var(--border);border-radius:9px">
                ${Object.keys(item).map((k) => `
                  <label>item ${j + 1} · ${k}</label>
                  <input data-sec="${i}" data-item="${j}" data-f="${k}" value="${esc(item[k])}">`).join('')}
              </div>`).join('') : ''}
          </div>`).join('')}
        <button class="btn" id="saveSections">💾 Save changes</button>
      </div>
      <div class="card pad0" style="position:sticky;top:20px;height:calc(100vh - 140px)">
        <iframe id="preview" src="/api/sites/${site.id}/preview" style="width:100%;height:100%;border:none;border-radius:var(--radius);background:#fff"></iframe>
      </div>
    </div>
  </div>`;

  const frame = $('#preview', main);
  const refresh = () => { frame.src = `/api/sites/${site.id}/preview?t=${Date.now()}`; };
  $('#palette', main).onchange = async (e) => { await api('PATCH', `/api/sites/${siteId}`, { palette: e.target.value }); refresh(); };
  $('#toggle', main).onclick = async () => { await api('PATCH', `/api/sites/${siteId}`, { published: !site.published }); navigate(); };
  $('#chatToggle', main).onclick = async () => { await api('PATCH', `/api/sites/${siteId}`, { chatEnabled: site.chatEnabled === false }); navigate(); };
  $('#exportBtn', main).onclick = () => toast('Building your Netlify bundle — check your downloads 📦');
  $('#regen', main).onclick = async (e) => {
    e.target.disabled = true; e.target.textContent = '⏳ Writing…';
    await api('POST', `/api/sites/${siteId}/generate`); navigate();
  };
  $('#saveSections', main).onclick = async () => {
    const sections = structuredClone(site.sections);
    main.querySelectorAll('[data-sec]').forEach((el) => {
      const sec = sections[Number(el.dataset.sec)];
      if (el.dataset.item !== undefined) sec.items[Number(el.dataset.item)][el.dataset.f] = el.value;
      else sec[el.dataset.f] = el.value;
    });
    await api('PATCH', `/api/sites/${siteId}`, { sections });
    site.sections = sections;
    toast('Saved — live site updated');
    refresh();
  };
}

routes.marketing = async (main, [tab = 'calendar']) => {
  await loadBoot();
  const [calendar, emails] = await Promise.all([api('GET', '/api/calendar'), api('GET', '/api/emails')]);
  const platBadge = { LinkedIn: 'acc', Instagram: 'warn', X: '', TikTok: 'on', Facebook: 'acc' };
  main.innerHTML = `<div class="page">
    <div class="page-head"><div><h1>📣 Marketing</h1><p>Social calendar and email campaigns, generated on-brand from your Brain.</p></div></div>
    <div class="tabs">
      <button class="${tab === 'calendar' ? 'active' : ''}" onclick="location.hash='#/marketing/calendar'">🗓 Content calendar</button>
      <button class="${tab === 'emails' ? 'active' : ''}" onclick="location.hash='#/marketing/emails'">✉️ Email campaigns</button>
    </div>
    <div id="tabBody"></div>
  </div>`;
  const body = $('#tabBody', main);

  if (tab === 'calendar') {
    const sorted = [...calendar].sort((a, b) => a.date.localeCompare(b.date));
    body.innerHTML = `
      <div class="row" style="margin-bottom:16px">
        <button class="btn" id="genWeek">🪄 Generate a week of posts</button>
        <button class="btn ghost" id="addPost">+ Add post</button>
      </div>
      ${sorted.length ? `<div class="grid c2">${sorted.map((p) => `
        <div class="card">
          <div class="row spread">
            <span class="row"><span class="badge ${platBadge[p.platform] ?? ''}">${esc(p.platform)}</span><b>${p.date}</b></span>
            <select data-status="${p.id}" style="width:auto;padding:4px 8px;font-size:12px">
              ${['draft', 'scheduled', 'posted'].map((s) => `<option ${p.status === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </div>
          <div style="margin:10px 0;white-space:pre-wrap;font-size:13px">${esc(p.content)}</div>
          <div class="row spread">
            <button class="btn ghost sm" data-copy="${p.id}">📋 Copy</button>
            <button class="btn danger sm" data-del="${p.id}">✕</button>
          </div>
        </div>`).join('')}</div>`
      : '<div class="empty"><div class="big">🗓</div>Empty calendar. Hit “Generate a week of posts” — Soshie will fill it.</div>'}`;

    $('#genWeek').onclick = async (e) => {
      e.target.disabled = true; e.target.textContent = '⏳ Soshie is writing…';
      try { await api('POST', '/api/calendar/generate', {}); toast('7 posts drafted 🗓'); navigate(); }
      catch (err) { toast(err.message, true); navigate(); }
    };
    $('#addPost').onclick = () => {
      const m = modal(`
        <h2>New post</h2>
        <label>Platform</label><select id="pPlat"><option>LinkedIn</option><option>Instagram</option><option>X</option><option>TikTok</option><option>Facebook</option></select>
        <label>Date</label><input id="pDate" type="date" value="${new Date().toISOString().slice(0, 10)}">
        <label>Content</label><textarea id="pContent" rows="4"></textarea>
        <div class="actions"><button class="btn ghost" id="pCancel">Cancel</button><button class="btn" id="pSave">Add</button></div>`);
      $('#pCancel', m).onclick = () => m.remove();
      $('#pSave', m).onclick = async () => {
        try {
          await api('POST', '/api/calendar', { platform: $('#pPlat', m).value, date: $('#pDate', m).value, content: $('#pContent', m).value });
          m.remove(); navigate();
        } catch (err) { toast(err.message, true); }
      };
    };
    body.addEventListener('click', async (e) => {
      if (e.target.dataset.del) { await api('DELETE', `/api/calendar/${e.target.dataset.del}`); navigate(); }
      if (e.target.dataset.copy) {
        const post = calendar.find((p) => p.id === e.target.dataset.copy);
        await navigator.clipboard.writeText(post.content); toast('Post copied');
      }
    });
    body.addEventListener('change', async (e) => {
      if (e.target.dataset.status) await api('PATCH', `/api/calendar/${e.target.dataset.status}`, { status: e.target.value });
    });
  } else {
    body.innerHTML = `
      <div class="row" style="margin-bottom:16px">
        <button class="btn" id="genEmail">🪄 Generate a campaign</button>
      </div>
      ${emails.length ? `<div class="grid c2">${emails.map((e) => `
        <div class="card">
          <div class="row spread"><b>${esc(e.subject)}</b><span class="badge">${e.status}</span></div>
          <div class="dim" style="margin:4px 0 10px">${esc(e.audience)} · ${timeAgo(e.createdAt)}</div>
          <div style="max-height:130px;overflow:hidden;font-size:13px" class="muted">${md(e.body.slice(0, 400))}</div>
          <div class="row spread" style="margin-top:10px">
            <button class="btn ghost sm" data-copy="${e.id}">📋 Copy body</button>
            <button class="btn danger sm" data-del="${e.id}">✕</button>
          </div>
        </div>`).join('')}</div>`
      : '<div class="empty"><div class="big">✉️</div>No campaigns yet — Emmie is ready when you are.</div>'}`;

    $('#genEmail').onclick = () => {
      const m = modal(`
        <h2>Generate campaign</h2>
        <label>Campaign goal</label><input id="eGoal" placeholder="Announce our summer sale">
        <div class="actions"><button class="btn ghost" id="eCancel">Cancel</button><button class="btn" id="eGen">🪄 Generate</button></div>`);
      $('#eCancel', m).onclick = () => m.remove();
      $('#eGen', m).onclick = async () => {
        const btn = $('#eGen', m);
        btn.disabled = true; btn.textContent = '⏳ Emmie is writing…';
        try { await api('POST', '/api/emails/generate', { goal: $('#eGoal', m).value }); m.remove(); toast('Campaign drafted ✉️'); navigate(); }
        catch (err) { btn.disabled = false; toast(err.message, true); }
      };
    };
    body.addEventListener('click', async (e) => {
      if (e.target.dataset.del) { await api('DELETE', `/api/emails/${e.target.dataset.del}`); navigate(); }
      if (e.target.dataset.copy) {
        const em = emails.find((x) => x.id === e.target.dataset.copy);
        await navigator.clipboard.writeText(em.body); toast('Copied');
      }
    });
  }
};

routes.seo = async (main) => {
  await loadBoot();
  const [audits, sites] = await Promise.all([api('GET', '/api/seo/audits'), api('GET', '/api/sites')]);
  main.innerHTML = `<div class="page">
    <div class="page-head"><div><h1>🔍 SEO</h1><p>Real on-page audits with 13 weighted checks — score your Studio sites or any live URL.</p></div></div>
    <div class="card" style="margin-bottom:18px">
      <div class="row">
        <input id="seoUrl" placeholder="https://example.com — or pick a Studio site →" style="flex:1;min-width:220px">
        <select id="seoSite" style="width:auto"><option value="">Studio site…</option>
          ${sites.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select>
        <button class="btn" id="runAudit">🔍 Audit</button>
      </div>
    </div>
    <div id="auditResult"></div>
    ${audits.length ? `<h2 style="font-size:15px;margin:24px 0 10px">Past audits</h2>
      <div class="card pad0">${audits.map((a) => `
        <div class="list-row" data-audit="${a.id}">
          <span class="score-ring" style="font-size:18px;color:${a.score >= 75 ? 'var(--green)' : a.score >= 50 ? 'var(--yellow)' : 'var(--red)'}">${a.grade}</span>
          <span style="flex:1"><b>${esc(a.target)}</b><div class="dim">${a.passed} passed · ${a.failed} to fix</div></span>
          <span class="badge">${a.score}/100</span><span class="dim">${timeAgo(a.createdAt)}</span>
        </div>`).join('')}</div>` : ''}
  </div>`;

  function showReport(r) {
    $('#auditResult').innerHTML = `<div class="card">
      <div class="row spread">
        <div><b style="font-size:16px">${esc(r.target)}</b><div class="dim">${r.passed} checks passed · ${r.failed} need attention</div></div>
        <div class="score-ring" style="color:${r.score >= 75 ? 'var(--green)' : r.score >= 50 ? 'var(--yellow)' : 'var(--red)'}">${r.score}<span class="dim" style="font-size:14px">/100 · ${r.grade}</span></div>
      </div>
      <div style="margin-top:14px">
        ${r.checks.map((c) => `<div class="check">
          <span class="ic">${c.pass ? '✅' : '❌'}</span>
          <span style="flex:1"><b>${esc(c.label)}</b>${c.detail ? ` <span class="dim">— ${esc(c.detail)}</span>` : ''}
            ${c.advice ? `<div class="dim">💡 ${esc(c.advice)}</div>` : ''}</span>
          <span class="badge">w${c.weight}</span>
        </div>`).join('')}
      </div>
    </div>`;
    $('#auditResult').scrollIntoView({ behavior: 'smooth' });
  }

  $('#runAudit').onclick = async (e) => {
    const url = $('#seoUrl').value.trim();
    const siteId = $('#seoSite').value;
    if (!url && !siteId) return toast('Enter a URL or pick a Studio site', true);
    e.target.disabled = true; e.target.textContent = '⏳ Auditing…';
    try { showReport(await api('POST', '/api/seo/audit', siteId ? { siteId } : { url })); }
    catch (err) { toast(err.message, true); }
    e.target.disabled = false; e.target.textContent = '🔍 Audit';
  };
  $(".page", main).addEventListener('click', (e) => {
    const row = e.target.closest('[data-audit]');
    if (row) { const a = audits.find((x) => x.id === row.dataset.audit); if (a) showReport(a); }
  });
};

routes.analytics = async (main) => {
  const a = await api('GET', '/api/analytics');
  const max = Math.max(1, ...a.series.map((d) => d.count));
  main.innerHTML = `<div class="page">
    <div class="page-head"><div><h1>📊 Analytics</h1><p>Real pageviews for every website you publish from the Studio. No cookies, no third parties — tracked locally.</p></div></div>
    <div class="grid c4" style="margin-bottom:18px">
      <div class="card stat"><div class="num">${a.total}</div><div class="lbl">Total pageviews</div></div>
      <div class="card stat"><div class="num">${Object.keys(a.bySite).length}</div><div class="lbl">Sites with traffic</div></div>
      <div class="card stat"><div class="num">${a.series.slice(-7).reduce((x, d) => x + d.count, 0)}</div><div class="lbl">Last 7 days</div></div>
      <div class="card stat"><div class="num">${a.series.at(-1)?.count ?? 0}</div><div class="lbl">Today</div></div>
    </div>
    <div class="card">
      <b>Views — last 14 days</b>
      <div class="bars">${a.series.map((d) => `<div class="bar" style="height:${Math.round((d.count / max) * 100)}%"><span>${d.count || ''}</span></div>`).join('')}</div>
      <div class="bars-x">${a.series.map((d) => `<div>${d.day.slice(5)}</div>`).join('')}</div>
    </div>
    ${Object.keys(a.bySite).length ? `<div class="card" style="margin-top:14px"><b>By site</b>
      ${Object.entries(a.bySite).map(([slug, s]) => `
        <div class="row spread" style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
          <a href="/sites/${slug}" target="_blank">/sites/${slug}</a><b>${s.total} views</b>
        </div>`).join('')}</div>` : ''}
  </div>`;
};

routes.settings = async (main) => {
  const s = await api('GET', '/api/settings');
  main.innerHTML = `<div class="page">
    <div class="page-head"><div><h1>⚙️ Settings</h1><p>HELIX works fully offline out of the box. Connect a model provider for bespoke AI output.</p></div></div>
    <div class="grid" style="grid-template-columns:1fr 1fr;align-items:start">
      <form class="card" id="settingsForm">
        <b>AI provider</b>
        <label>Provider</label>
        <select name="provider" id="provSel">
          ${[['offline', '⬢ Built-in offline engine (no key needed)'], ['anthropic', 'Anthropic (Claude)'], ['openai', 'OpenAI / compatible'], ['ollama', 'Ollama (local models)']]
            .map(([v, l]) => `<option value="${v}" ${s.provider === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
        <label>API key ${s.hasKey ? '<span class="badge on">saved</span>' : ''}</label>
        <input name="apiKey" type="password" placeholder="${s.hasKey ? '•••••••• (leave blank to keep)' : 'Not needed for offline or Ollama'}">
        <label>Model (optional)</label>
        <input name="model" value="${esc(s.model)}" placeholder="claude-sonnet-5 / gpt-4o-mini / llama3.2">
        <label>Base URL (optional)</label>
        <input name="baseUrl" value="${esc(s.baseUrl)}" placeholder="e.g. http://localhost:11434 for Ollama">
        <div style="margin-top:16px"><button class="btn">Save settings</button></div>
        <p class="dim" style="margin-top:12px">Your key is stored only in the local <code>data/db.json</code> on this machine and is never echoed back to the browser.</p>
      </form>
      <div style="display:flex;flex-direction:column;gap:14px">
        <div class="card">
          <b>Your data</b>
          <p class="dim" style="margin:6px 0 12px">Everything lives locally. Export a full backup or restore one.</p>
          <div class="row">
            <a class="btn ghost" href="/api/export" download>⬇ Export everything</a>
            <button class="btn ghost" id="importBtn">⬆ Import backup</button>
            <input type="file" id="importFile" accept="application/json" style="display:none">
          </div>
        </div>
        <div class="card">
          <b>About HELIX</b>
          <p class="dim" style="margin-top:6px">A local-first AI business suite: 12 AI teammates, Brain knowledge base, power-ups, automations, website studio, SEO auditing, marketing tools, and analytics — with zero dependencies and zero data leaving your machine.</p>
        </div>
      </div>
    </div>
  </div>`;

  $('#settingsForm').onsubmit = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target));
    if (!body.apiKey) delete body.apiKey; // keep existing
    await api('PUT', '/api/settings', body);
    toast('Settings saved');
    navigate();
  };
  $('#importBtn').onclick = () => $('#importFile').click();
  $('#importFile').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      await api('POST', '/api/import', data);
      toast('Backup imported ✅');
      location.hash = '#/dashboard';
    } catch (err) { toast('Import failed: ' + err.message, true); }
  };
};

routes.about = async (main) => {
  await loadBoot();
  const FUNCTIONS = [
    { icon: '🧠', name: 'Brain', href: '#/brain', text: 'The single source of truth for your business. Fill it in once — every teammate, power-up, website, and automation reads from it, so everything stays on-brand without you repeating yourself.' },
    { icon: '👥', name: 'AI Team', href: '#/helpers', text: 'Twelve specialists — copy, sales, SEO, support, social, data and more — each briefed on your business, ready to think alongside you in plain conversation.' },
    { icon: '⚡', name: 'Power-ups', href: '#/powerups', text: 'One click turns a blank page into a finished deliverable: a content plan, a sales script, a hiring kit, an SEO brief — drafted by the right specialist.' },
    { icon: '✅', name: 'Tasks', href: '#/tasks', text: 'A board where you can hand a job to a teammate and they actually complete it, attaching the finished work — not just advice about it.' },
    { icon: '🔁', name: 'Automations', href: '#/automations', text: 'Standing orders that run on their own schedule. Your team keeps working while you sleep; results appear in your inbox.' },
    { icon: '🌐', name: 'Website Studio', href: '#/sites', text: 'Describe your business and get a real, publishable website in seconds — then edit every section with a live preview.' },
    { icon: '📣', name: 'Marketing', href: '#/marketing', text: 'A month of on-brand social posts and email campaigns, generated and organized so you never stare at an empty calendar.' },
    { icon: '🔍', name: 'SEO', href: '#/seo', text: 'Honest, weighted on-page audits with concrete fixes — score your own sites or any URL and know exactly what to improve.' },
    { icon: '📊', name: 'Analytics', href: '#/analytics', text: 'Private, cookie-free pageview tracking for the sites you publish, so growth is something you can see.' },
  ];
  main.innerHTML = `<div class="page learn">
    <div class="hero-band">
      <div class="eyebrow">The autonomous business ecosystem</div>
      <h1>Your ideas, brought to life — by a team that never clocks out.</h1>
      <p class="lede">HELIX exists for one reason: the distance between <em>“I have an idea”</em> and <em>“it’s live in the world”</em> should be minutes, not months. You bring the vision. Your AI team handles the building, writing, designing, marketing, and measuring — end to end, on your machine, on your terms.</p>
      <div class="row" style="gap:10px;margin-top:6px">
        <a class="btn" href="#/brain">🧠 Start with your Brain</a>
        <a class="btn ghost" href="#/howto">🧭 See how it works</a>
      </div>
    </div>

    <section class="learn-section">
      <h2>What “autonomous ecosystem” actually means</h2>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(230px,1fr));margin-top:14px">
        <div class="card"><div class="learn-ic">🌱</div><b>One shared memory</b><p class="muted">Everything grows from your Brain. Tell it about your business once and all twelve teammates inherit that context — no re-briefing, no drift.</p></div>
        <div class="card"><div class="learn-ic">🔗</div><b>Connected, not siloed</b><p class="muted">A power-up feeds your documents. A task becomes a deliverable. A site feeds your analytics and your SEO score. Each part makes the others smarter.</p></div>
        <div class="card"><div class="learn-ic">🔒</div><b>Yours alone</b><p class="muted">It runs locally. Your ideas, customers, and strategy never leave your device. Autonomy without surveillance.</p></div>
        <div class="card"><div class="learn-ic">♾️</div><b>Always working</b><p class="muted">Automations run on schedule and deliverables pile up while you focus on the next idea. The ecosystem compounds.</p></div>
      </div>
    </section>

    <section class="learn-section">
      <h2>Everything HELIX does for you</h2>
      <p class="muted" style="max-width:640px">Nine connected functions that take an idea from a sentence to something real — a page, a plan, a campaign, a measurable result.</p>
      <div class="grid c2" style="margin-top:16px">
        ${FUNCTIONS.map((f) => `
          <a class="card func-card" href="${f.href}">
            <div class="row" style="gap:11px;align-items:flex-start">
              <span class="learn-ic">${f.icon}</span>
              <span><b>${f.name}</b><p class="muted" style="margin-top:3px">${f.text}</p></span>
            </div>
            <span class="func-go">Open ${f.name} →</span>
          </a>`).join('')}
      </div>
    </section>

    <section class="learn-section">
      <div class="card cta-learn">
        <h2 style="border:none;margin:0">The whole point: momentum.</h2>
        <p class="muted" style="max-width:600px;margin:8px auto 18px">Most tools give you one more thing to manage. HELIX gives you a team that manages the work — so the only thing left for you to do is have the next idea.</p>
        <a class="btn" href="#/howto">🧭 Read the How-to & secret tips</a>
      </div>
    </section>
  </div>`;
};

routes.howto = async (main) => {
  await loadBoot();
  const STEPS = [
    { n: '01', icon: '🧠', title: 'Feed the Brain first', body: 'This is the highest-leverage five minutes in HELIX. Open <a href="#/brain">Brain</a> and fill in your business name, audience, what you sell, and your tone. Every other feature reads from here — the richer it is, the more on-brand everything else becomes.', href: '#/brain', cta: 'Set up Brain' },
    { n: '02', icon: '💬', title: 'Talk to a specialist', body: 'Open the <a href="#/helpers">AI Team</a> and pick whoever fits the job — Penn for copy, Milli for sales, Seomi for SEO. Chat like you would with a real teammate. They already know your business, so skip the context and get to the ask.', href: '#/helpers', cta: 'Meet the team' },
    { n: '03', icon: '⚡', title: 'Run a power-up for finished work', body: 'When you want a complete deliverable rather than a conversation, use a <a href="#/powerups">Power-up</a>. Fill in a field or two and get a full content plan, sales script, or SEO brief — saved straight to your Documents.', href: '#/powerups', cta: 'Browse power-ups' },
    { n: '04', icon: '🌐', title: 'Build and publish a site', body: 'In <a href="#/sites">Website Studio</a>, create a site and hit generate — it writes the copy from your Brain. Edit any section with the live preview on the right, then view it live. Re-generate anytime to get fresh angles.', href: '#/sites', cta: 'Open Studio' },
    { n: '05', icon: '📣', title: 'Fill your calendar in one click', body: 'In <a href="#/marketing">Marketing</a>, generate a week of platform-native posts, then move each from draft → scheduled → posted as you go. Generate an email campaign the same way.', href: '#/marketing', cta: 'Plan content' },
    { n: '06', icon: '🔁', title: 'Put it on autopilot', body: 'Turn any recurring job into an <a href="#/automations">Automation</a> — “draft 5 post ideas every Monday,” “weekly competitor checklist.” It runs on schedule and drops results in your <a href="#/inbox">Inbox</a>.', href: '#/automations', cta: 'Create automation' },
  ];
  const TIPS = [
    { icon: '🎯', title: 'Add knowledge items, not just the profile', text: 'Paste your pricing, FAQs, refund policy, and product specs as Brain knowledge items. Teammates quote them verbatim — turning generic advice into answers that are actually true for your business.' },
    { icon: '🔗', title: 'Chain the functions', text: 'Run an SEO brief power-up → hand it to Penn in chat to write the article → drop the article as a Brain knowledge item. Each step makes the next output sharper. The ecosystem rewards sequences.' },
    { icon: '🗣️', title: 'Set your tone deliberately', text: 'The “Brand tone” field is a superpower. Try “bold and irreverent” vs “calm and expert” — every helper, email, and site instantly shifts voice. Tune it until replies sound like you.' },
    { icon: '⚙️', title: 'Assign tasks to the right specialist', text: 'When you create a Task, assign a helper and use “AI run.” The teammate completes it in their voice and attaches the deliverable — great for batching a to-do list into finished work.' },
    { icon: '🔍', title: 'Audit before you publish', text: 'Run an SEO audit on a Studio site before sharing it. Fix the flagged items (title length, meta description, one H1) and your score climbs fast — free ranking wins most people skip.' },
    { icon: '🔌', title: 'Go bespoke with a provider', text: 'HELIX is fully useful offline, but connect an AI provider in <a href="#/settings">Settings</a> (Anthropic, OpenAI, or a local Ollama model) and every generation becomes uniquely tailored instead of template-based.' },
    { icon: '💾', title: 'Export is your undo button', text: 'Before a big change or import, hit Export in Settings for a full JSON snapshot you own. It’s a backup, a way to move between machines, and a safety net all in one.' },
    { icon: '📥', title: 'Let automations stack up', text: 'Set a couple of daily automations and simply check your Inbox each morning — a steady stream of ideas and drafts waiting, with zero effort from you. This is the “never clocks out” payoff.' },
  ];
  main.innerHTML = `<div class="page learn">
    <div class="page-head"><div>
      <div class="eyebrow">How-to & secret tips</div>
      <h1>Get from idea to done — the fast way.</h1>
      <p class="muted" style="max-width:620px">Follow the six steps to run the full loop, then steal the power-user tips most people never discover.</p>
    </div></div>

    <section class="learn-section">
      <h2>The core loop, in six steps</h2>
      <div class="steps">
        ${STEPS.map((s) => `
          <div class="step">
            <div class="step-n">${s.n}</div>
            <div class="step-body">
              <b>${s.icon} ${s.title}</b>
              <p class="muted">${s.body}</p>
              <a class="btn ghost sm" href="${s.href}">${s.cta} →</a>
            </div>
          </div>`).join('')}
      </div>
    </section>

    <section class="learn-section">
      <h2>Secret tips for the best results</h2>
      <p class="muted" style="max-width:620px">Small habits that separate “nice tool” from “unfair advantage.”</p>
      <div class="grid c2" style="margin-top:16px">
        ${TIPS.map((t) => `
          <div class="card tip-card">
            <div class="row" style="gap:11px;align-items:flex-start">
              <span class="learn-ic">${t.icon}</span>
              <span><b>${t.title}</b><p class="muted" style="margin-top:3px">${t.text}</p></span>
            </div>
          </div>`).join('')}
      </div>
    </section>

    <section class="learn-section">
      <div class="card cta-learn">
        <h2 style="border:none;margin:0">Ready? Pick where to start.</h2>
        <div class="row" style="justify-content:center;gap:10px;margin-top:16px;flex-wrap:wrap">
          <a class="btn" href="#/brain">🧠 Set up Brain</a>
          <a class="btn ghost" href="#/powerups">⚡ Run a power-up</a>
          <a class="btn ghost" href="#/sites">🌐 Build a site</a>
        </div>
      </div>
    </section>
  </div>`;
};

routes.autopilot = async (main) => {
  await loadBoot();
  const tools = await api('GET', '/api/agent/tools');
  const toolCount = tools.length;
  const provider = state.boot.settings.provider;
  const live = provider !== 'offline' && (provider === 'ollama' || state.boot.settings.hasKey);
  const examples = [
    'Launch my new product with a website and a week of social content',
    'Grow my audience — build an SEO brief and a content calendar',
    'Set up a sales push: script, outreach plan, and follow-up tasks',
    'Get me online: build and audit a website for my business',
  ];
  main.innerHTML = `<div class="page">
    <div class="hero-band" style="margin-bottom:22px">
      <div class="eyebrow">Autopilot</div>
      <h1>Give one goal. Watch your team do the work.</h1>
      <p class="lede">Describe an outcome and Autopilot breaks it into steps and <em>actually executes them</em> — creating tasks, building sites, running audits, generating content, and calling your connected tools. Not advice. Done work.</p>
      <div class="row" style="gap:8px;margin-top:4px">
        <input id="goal" placeholder="e.g. ${esc(examples[0])}" style="flex:1;min-width:260px" value="">
        <button class="btn" id="go">🚀 Run Autopilot</button>
      </div>
      <div class="row" style="gap:6px;margin-top:12px;flex-wrap:wrap">
        ${examples.map((e) => `<button class="chip" data-ex="${esc(e)}">${esc(e)}</button>`).join('')}
      </div>
      <div class="dim" style="margin-top:12px">
        ${live
          ? `⚡ <b>Live agent mode</b> — ${esc(provider)} plans and calls tools autonomously.`
          : `🧭 <b>Planner mode</b> — runs a deterministic plan of real actions, no key needed. Connect a provider in <a href="#/settings">Settings</a> for full LLM-driven planning.`}
      </div>
    </div>
    <div id="runOut"></div>
    <details style="margin-top:20px">
      <summary class="dim" style="cursor:pointer">What can Autopilot do? (${toolCount} tools)</summary>
      <div class="grid c2" style="margin-top:12px">
        ${tools.map((t) => `<div class="card"><b>${esc(t.name)}</b><p class="muted" style="margin-top:3px;font-size:12.5px">${esc(t.description)}</p></div>`).join('')}
      </div>
    </details>
  </div>`;

  const out = $('#runOut', main);
  const toolIcon = { create_task: '✅', run_powerup: '⚡', create_website: '🌐', run_seo_audit: '🔍', generate_content_calendar: '📣', draft_email_campaign: '✉️', call_integration: '🔌', get_workspace_summary: '📊' };
  const linkFor = (s) => {
    if (s.tool === 'create_website' && s.result?.slug) return ` — <a href="/sites/${s.result.slug}" target="_blank">view site</a>`;
    if (s.tool === 'run_powerup' && s.result?.id) return ` — <a href="#/documents/${s.result.id}">open doc</a>`;
    if (s.tool === 'generate_content_calendar') return ` — <a href="#/marketing">open calendar</a>`;
    if (s.tool === 'draft_email_campaign') return ` — <a href="#/marketing/emails">open email</a>`;
    if (s.tool === 'create_task') return ` — <a href="#/tasks">open board</a>`;
    if (s.tool === 'run_seo_audit') return ` — <a href="#/seo">open SEO</a>`;
    return '';
  };

  async function run(goal) {
    if (!goal.trim()) return;
    $('#go', main).disabled = true; $('#go', main).textContent = '⏳ Working…';
    out.innerHTML = `<div class="card"><div class="row" style="gap:10px"><div class="typing"><i></i><i></i><i></i></div><b>Autopilot is working on “${esc(goal)}”…</b></div></div>`;
    try {
      const res = await api('POST', '/api/agent/run', { goal });
      out.innerHTML = `<div class="card">
        <div class="row spread"><b>✅ Autopilot finished</b><span class="badge ${res.mode === 'provider' ? 'on' : 'acc'}">${res.mode === 'provider' ? 'live agent' : 'planner'}</span></div>
        <p class="muted" style="margin:8px 0 14px">${esc(res.summary)}</p>
        <div class="steps">
          ${res.steps.map((s, i) => `
            <div class="step">
              <div class="step-n">${toolIcon[s.tool] || '•'}</div>
              <div class="step-body">
                <b>${esc(s.tool.replace(/_/g, ' '))}</b>${linkFor(s)}
                <p class="muted" style="margin:4px 0 0">${s.result?.error ? '⚠️ ' + esc(s.result.error) : esc(JSON.stringify(s.result).slice(0, 180))}</p>
              </div>
            </div>`).join('')}
        </div>
        ${res.note ? `<p class="dim" style="margin-top:12px">ℹ️ ${esc(res.note)}</p>` : ''}
      </div>`;
      toast('Autopilot completed — results are live across your workspace 🚀');
    } catch (e) {
      out.innerHTML = `<div class="empty"><div class="big">⚠️</div>${esc(e.message)}</div>`;
    } finally {
      $('#go', main).disabled = false; $('#go', main).textContent = '🚀 Run Autopilot';
    }
  }

  $('#go', main).onclick = () => run($('#goal', main).value);
  $('#goal', main).addEventListener('keydown', (e) => { if (e.key === 'Enter') run(e.target.value); });
  $('.page', main).addEventListener('click', (e) => {
    const ex = e.target.closest('[data-ex]');
    if (ex) { $('#goal', main).value = ex.dataset.ex; run(ex.dataset.ex); }
  });
};

routes.integrations = async (main) => {
  await loadBoot();
  const [presets, connected] = await Promise.all([
    api('GET', '/api/integrations/presets'),
    api('GET', '/api/integrations'),
  ]);
  const statusBadge = (i) => {
    if (!i.lastTest) return '<span class="badge">not tested</span>';
    if (i.lastTest.sandbox) return '<span class="badge warn">saved</span>';
    return i.lastTest.ok ? '<span class="badge on">connected</span>' : '<span class="badge" style="color:var(--red)">failed</span>';
  };
  main.innerHTML = `<div class="page">
    <div class="page-head"><div><h1>🔌 Integrations</h1>
      <p>Connect the tools your business already runs on. Bring your own keys — everything is stored locally on your machine and used to make real, authenticated calls. Nothing is pre-connected, and no key ever leaves your device.</p></div></div>

    ${connected.length ? `
    <h2 style="font-size:15px;margin:6px 0 12px">Your connections</h2>
    <div class="grid c2" style="margin-bottom:26px">
      ${connected.map((i) => `
        <div class="card">
          <div class="row spread">
            <div class="row" style="gap:10px"><span class="learn-ic">${i.icon || '🔗'}</span>
              <span><b>${esc(i.name)}</b><div class="dim">${esc(i.baseUrl || '—')}</div></span></div>
            ${statusBadge(i)}
          </div>
          <div class="dim" style="margin:10px 0">
            ${i.type.toUpperCase()} · ${i.hasSecret ? `key ${esc(i.secretHint)}` : 'no key'}
            ${i.lastTest ? ` · ${esc(i.lastTest.detail)}${i.lastTest.ms ? ` (${i.lastTest.ms}ms)` : ''}` : ''}
          </div>
          <div class="row">
            <button class="btn sm" data-test="${i.id}">⚡ Test</button>
            <button class="btn ghost sm" data-toggle="${i.id}:${!i.enabled}">${i.enabled ? '⏸ Disable' : '▶ Enable'}</button>
            <button class="btn danger sm" data-del="${i.id}">✕</button>
          </div>
        </div>`).join('')}
    </div>` : ''}

    <h2 style="font-size:15px;margin:6px 0 4px">Add a connection</h2>
    <p class="dim" style="margin-bottom:14px">Pick a service to pre-fill the details, then paste your key.</p>
    <div class="grid c3">
      ${presets.map((p) => `
        <button class="card func-card" data-preset="${p.id}" style="text-align:left;cursor:pointer">
          <div class="row" style="gap:10px;align-items:flex-start">
            <span class="learn-ic">${p.icon}</span>
            <span><b>${esc(p.name)}</b><p class="muted" style="margin-top:3px">${esc(p.desc)}</p></span>
          </div>
          <span class="func-go">${esc(p.category)} · ${p.type} → connect</span>
        </button>`).join('')}
    </div>
  </div>`;

  function openForm(preset) {
    const needsUrl = ['custom-rest', 'custom-webhook', 'custom-mcp'].includes(preset.id) || !preset.baseUrl;
    const urlSecret = preset.urlIsSecret;
    const m = modal(`
      <h2>${preset.icon} Connect ${esc(preset.name)}</h2>
      <p class="dim">${esc(preset.desc)}</p>
      <label>Display name</label><input id="iName" value="${esc(preset.name)}">
      ${needsUrl && !urlSecret ? `<label>Base URL</label><input id="iUrl" placeholder="${esc(preset.urlNote || 'https://api.example.com')}" value="${esc(preset.baseUrl || '')}">${preset.urlNote ? `<div class="dim" style="margin-top:4px">e.g. ${esc(preset.urlNote)}</div>` : ''}` : ''}
      ${preset.auth?.kind !== 'none' || urlSecret
        ? `<label>${esc(preset.keyLabel)}${urlSecret ? '' : ' <span class="dim">(stored locally, never shown again)</span>'}</label>
           <input id="iSecret" type="password" placeholder="${esc(preset.keyHint || '')}">`
        : '<p class="dim" style="margin-top:10px">No key required for this connection.</p>'}
      ${['custom-rest'].includes(preset.id) ? `
        <label>Auth style</label>
        <select id="iAuthKind"><option value="bearer">Bearer token</option><option value="header">Custom header</option><option value="query">Query param</option><option value="none">None</option></select>
        <label>Health check path</label><input id="iTestPath" value="/" placeholder="/health">` : ''}
      <div class="actions"><button class="btn ghost" id="iCancel">Cancel</button><button class="btn" id="iSave">Save connection</button></div>`);
    $('#iCancel', m).onclick = () => m.remove();
    $('#iSave', m).onclick = async () => {
      const body = { preset: preset.id, name: $('#iName', m)?.value };
      if ($('#iUrl', m)) body.baseUrl = $('#iUrl', m).value;
      if ($('#iSecret', m)) body.secret = $('#iSecret', m).value;
      if ($('#iAuthKind', m)) body.authKind = $('#iAuthKind', m).value;
      if ($('#iTestPath', m)) body.testPath = $('#iTestPath', m).value;
      try {
        const integ = await api('POST', '/api/integrations', body);
        m.remove();
        toast('Connection saved 🔌');
        // immediately test it so the user gets real feedback
        try {
          const { result } = await api('POST', `/api/integrations/${integ.id}/test`, {});
          toast(result.sandbox ? 'Saved — test it live in the installed app' : result.ok ? 'Connected ✅' : `Test: ${result.detail}`, !result.ok && !result.sandbox);
        } catch { /* test is best-effort */ }
        navigate();
      } catch (err) { toast(err.message, true); }
    };
  }

  $('.page', main).addEventListener('click', async (e) => {
    const t = e.target;
    const presetBtn = t.closest('[data-preset]');
    if (presetBtn) { openForm(presets.find((p) => p.id === presetBtn.dataset.preset)); return; }
    if (t.dataset.test) {
      t.disabled = true; t.textContent = '⏳ testing…';
      try {
        const { result } = await api('POST', `/api/integrations/${t.dataset.test}/test`, {});
        toast(result.sandbox ? result.detail : result.ok ? `Connected (${result.ms}ms) ✅` : `Failed: ${result.detail}`, !result.ok && !result.sandbox);
      } catch (err) { toast(err.message, true); }
      navigate();
    } else if (t.dataset.toggle) {
      const [id, enabled] = t.dataset.toggle.split(':');
      await api('PATCH', `/api/integrations/${id}`, { enabled: enabled === 'true' }); navigate();
    } else if (t.dataset.del) {
      await api('DELETE', `/api/integrations/${t.dataset.del}`); navigate();
    }
  });
};

// ---------- boot ----------
loadBoot().then(navigate).catch((e) => {
  $('#main').innerHTML = `<div class="page"><div class="empty">Could not reach the HELIX server: ${esc(e.message)}</div></div>`;
});
