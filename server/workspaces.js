// Multiple businesses per device. The live state object stays the ACTIVE
// workspace (so every existing route keeps working); inactive workspaces are
// snapshots parked in state.workspaces[].data. Settings, account and
// telemetry are device-global and never swapped.

export const WORKSPACE_FIELDS = [
  'brain', 'knowledge', 'chats', 'tasks', 'documents', 'automations', 'sites',
  'calendar', 'emails', 'seoAudits', 'analytics', 'inbox', 'memories',
  'feedback', 'usageLog', 'integrations', 'agentRuns',
];

// Plan ladder: free = 1 business, Pro = 5, Agency & founder = unlimited.
// Entitlement comes from a server-verified license (account.entitlement),
// not a client-typed string — the founder email is the only local override.
export function planFor(account = {}) {
  if (account.role === 'owner') return { tier: 'owner', limit: Infinity };
  const ent = account.entitlement || {};
  const active = ent.tier && (!ent.exp || ent.exp * 1000 > Date.now());
  if (active && ent.tier === 'agency') return { tier: 'agency', limit: Infinity };
  if (active && ent.tier === 'pro') return { tier: 'pro', limit: 5 };
  return { tier: 'free', limit: 1 };
}

function freshFields() {
  const out = {};
  for (const f of WORKSPACE_FIELDS) out[f] = f === 'feedback' ? {} : [];
  out.brain = {
    businessName: '', tagline: '', industry: '', description: '', audience: '',
    tone: 'friendly and professional', products: '', goals: '', website: '', location: '',
  };
  return out;
}

function snapshot(state) {
  const out = {};
  for (const f of WORKSPACE_FIELDS) out[f] = state[f];
  return JSON.parse(JSON.stringify(out));
}

// Make sure the meta list exists and points at the live state.
export function ensureWorkspaces(state, uid) {
  if (!Array.isArray(state.workspaces) || !state.workspaces.length) {
    state.workspaces = [{ id: 'w-' + uid(), name: state.brain?.businessName || 'My business', createdAt: Date.now(), data: null }];
    state.activeWorkspace = state.workspaces[0].id;
  }
  if (!state.workspaces.some((w) => w.id === state.activeWorkspace)) state.activeWorkspace = state.workspaces[0].id;
  return state;
}

export function listWorkspaces(state) {
  return state.workspaces.map((w) => ({
    id: w.id,
    name: w.id === state.activeWorkspace ? (state.brain?.businessName || w.name || 'My business') : (w.name || 'My business'),
    active: w.id === state.activeWorkspace,
    createdAt: w.createdAt,
  }));
}

export function createWorkspace(state, uid, name) {
  const plan = planFor(state.account);
  if (state.workspaces.length >= plan.limit) {
    const err = new Error(plan.tier === 'free'
      ? 'The free plan includes 1 business. Upgrade to Pro for 5, or Agency for unlimited.'
      : `Your plan includes ${plan.limit} businesses — Agency removes the limit.`);
    err.statusCode = 402;
    throw err;
  }
  const ws = { id: 'w-' + uid(), name: String(name || 'New business').slice(0, 60), createdAt: Date.now(), data: freshFields() };
  state.workspaces.push(ws);
  return ws;
}

export function switchWorkspace(state, toId) {
  if (toId === state.activeWorkspace) return false;
  const target = state.workspaces.find((w) => w.id === toId);
  if (!target) { const e = new Error('no such workspace'); e.statusCode = 404; throw e; }
  const current = state.workspaces.find((w) => w.id === state.activeWorkspace);
  if (current) {
    current.data = snapshot(state);
    current.name = state.brain?.businessName || current.name;
  }
  Object.assign(state, target.data);
  target.data = null; // the live state IS this workspace now
  state.activeWorkspace = toId;
  return true;
}

export function renameWorkspace(state, id, name) {
  const ws = state.workspaces.find((w) => w.id === id);
  if (!ws) { const e = new Error('no such workspace'); e.statusCode = 404; throw e; }
  ws.name = String(name || '').slice(0, 60) || ws.name;
  return ws;
}

export function deleteWorkspace(state, id) {
  if (id === state.activeWorkspace) { const e = new Error('switch to another business before deleting this one'); e.statusCode = 400; throw e; }
  const i = state.workspaces.findIndex((w) => w.id === id);
  if (i === -1) { const e = new Error('no such workspace'); e.statusCode = 404; throw e; }
  state.workspaces.splice(i, 1);
}
