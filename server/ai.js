// Provider abstraction. Tries the configured LLM provider; falls back to the
// offline engine on any failure so the app always answers.
import { offlineGenerate } from './offline.js';

const TIMEOUT_MS = 60_000;

async function callAnthropic(settings, system, messages) {
  const res = await fetch((settings.baseUrl || 'https://api.anthropic.com') + '/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': settings.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: settings.model || 'claude-sonnet-5',
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
      model: settings.model || 'gpt-4o-mini',
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
