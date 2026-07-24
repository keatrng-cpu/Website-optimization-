// Provider abstraction. Tries the configured LLM provider; falls back to the
// offline engine on any failure so the app always answers.
import { offlineGenerate } from './offline.js';

const TIMEOUT_MS = 60_000;

// Model auto-discovery (forge-web-stack crown jewel): hardcoded model ids 404
// silently when retired. Discover the newest matching model live and cache it;
// an explicit settings.model always wins, a constant is the last resort.
const _modelCache = new Map();
const DEFAULT_MODEL = { anthropic: 'claude-sonnet-5', openai: 'gpt-4o-mini' };

export async function pickModel(settings) {
  if (settings.model) return settings.model; // user choice wins
  const provider = settings.provider;
  const key = `${provider}:${settings.baseUrl || ''}`;
  if (_modelCache.has(key)) return _modelCache.get(key);
  const fallback = DEFAULT_MODEL[provider];
  try {
    let url, headers, match;
    if (provider === 'anthropic') {
      url = (settings.baseUrl || 'https://api.anthropic.com') + '/v1/models';
      headers = { 'x-api-key': settings.apiKey, 'anthropic-version': '2023-06-01' };
      match = 'sonnet';
    } else {
      url = (settings.baseUrl || 'https://api.openai.com') + '/v1/models';
      headers = { authorization: `Bearer ${settings.apiKey}` };
      match = 'gpt-4';
    }
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`models ${res.status}`);
    const data = await res.json();
    const list = (data.data || []).filter((m) => String(m.id).toLowerCase().includes(match));
    // newest first: prefer created/created_at desc, else lexical desc
    list.sort((a, b) => (b.created_at || b.created || 0) - (a.created_at || a.created || 0) || String(b.id).localeCompare(String(a.id)));
    // gateways/relays may list non-matching (e.g. Claude) models — use the first listed
    const chosen = list[0]?.id || (data.data || [])[0]?.id || fallback;
    _modelCache.set(key, chosen);
    return chosen;
  } catch {
    return fallback;
  }
}

async function callAnthropic(settings, system, messages) {
  const res = await fetch((settings.baseUrl || 'https://api.anthropic.com') + '/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': settings.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: await pickModel(settings),
      max_tokens: 2048,
      system,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return data.content?.map((b) => b.text || '').join('') || '';
}

async function callOpenAI(settings, system, messages) {
  const res = await fetch((settings.baseUrl || 'https://api.openai.com') + '/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: await pickModel(settings),
      max_tokens: 1024, // spend guard; also the cap gateway relays enforce
      messages: [{ role: 'system', content: system }, ...messages],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function callOllama(settings, system, messages) {
  const res = await fetch((settings.baseUrl || 'http://localhost:11434') + '/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: settings.model || 'llama3.2',
      stream: false,
      messages: [{ role: 'system', content: system }, ...messages],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`ollama ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return data.message?.content || '';
}

const PROVIDERS = { anthropic: callAnthropic, openai: callOpenAI, ollama: callOllama };

/**
 * generate({ settings, helper, brain, system, messages }) → { text, engine }
 * messages: [{role:'user'|'assistant', content}] — last one is the request.
 */
// Build a stateful tool-calling closure for the agent loop, or null when no
// tool-capable provider is configured. Contract matches runAgent's callModel.
export function makeToolCaller({ settings, system, tools }) {
  const provider = settings?.provider;
  if (!(provider === 'anthropic' || provider === 'openai') || !settings.apiKey) return null;

  if (provider === 'anthropic') {
    const messages = [];
    const anthTools = tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema }));
    return async function callModel(turn) {
      if (turn.goal) messages.push({ role: 'user', content: turn.goal });
      else if (turn.toolResults) {
        messages.push({ role: 'user', content: turn.toolResults.map((r) => ({ type: 'tool_result', tool_use_id: r.id, content: r.content })) });
      }
      const res = await fetch((settings.baseUrl || 'https://api.anthropic.com') + '/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': settings.apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: await pickModel(settings), max_tokens: 2048, system, tools: anthTools, messages }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = await res.json();
      messages.push({ role: 'assistant', content: data.content });
      const calls = (data.content || []).filter((b) => b.type === 'tool_use').map((b) => ({ id: b.id, name: b.name, input: b.input }));
      if (calls.length) return { type: 'tool_use', calls };
      return { type: 'final', text: (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('') };
    };
  }

  // openai (and compatible)
  const messages = [{ role: 'system', content: system }];
  const oaTools = tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } }));
  return async function callModel(turn) {
    if (turn.goal) messages.push({ role: 'user', content: turn.goal });
    else if (turn.toolResults) {
      for (const r of turn.toolResults) messages.push({ role: 'tool', tool_call_id: r.id, content: r.content });
    }
    const res = await fetch((settings.baseUrl || 'https://api.openai.com') + '/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${settings.apiKey}` },
      body: JSON.stringify({ model: await pickModel(settings), messages, tools: oaTools }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    const msg = data.choices?.[0]?.message || {};
    messages.push(msg);
    const tc = msg.tool_calls || [];
    if (tc.length) {
      return { type: 'tool_use', calls: tc.map((c) => ({ id: c.id, name: c.function.name, input: safeParse(c.function.arguments) })) };
    }
    return { type: 'final', text: msg.content || '' };
  };
}

function safeParse(s) { try { return JSON.parse(s); } catch { return {}; } }

// A single direct model call with NO offline fallback — used for auxiliary
// jobs like memory proposal, where "no model" should mean "no output".
export async function aiPropose(settings, system, user) {
  const provider = settings?.provider;
  const configured = provider === 'ollama' || ((provider === 'anthropic' || provider === 'openai') && settings.apiKey);
  if (!configured) return '';
  try {
    const fn = PROVIDERS[provider];
    return (await fn(settings, system, [{ role: 'user', content: user }])) || '';
  } catch {
    return '';
  }
}

export async function generate({ settings, helper, brain, system, messages, workspace }) {
  const provider = PROVIDERS[settings?.provider];
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  if (provider && (settings.provider === 'ollama' || settings.apiKey)) {
    try {
      const text = await provider(settings, system, messages);
      if (text && text.trim()) return { text, engine: settings.provider };
    } catch (err) {
      console.error(`[ai] ${settings.provider} failed, using offline engine:`, err.message);
    }
  }
  return {
    text: offlineGenerate({ helper, brain, message: lastUser?.content || '', workspace }),
    engine: 'offline',
  };
}
