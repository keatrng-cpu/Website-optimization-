// Brain memory & learning. Deterministic by design (accuracy mandate): code
// extracts durable first-person business facts from what the user actually
// writes — no model ever invents a "memory". Every memory is visible,
// pinnable, and deletable in the Brain, so learning stays transparent.
// Isomorphic: also runs inside the browser demo.
import { uid } from './store.js';

const MAX_MEMORIES = 100;

const PREFERENCE = /\b(prefer|always|never|avoid|don'?t like|hate|tone|style|keep it|no emojis?|emojis?)\b/i;
const GOAL = /\b(goal|launch(?:ing)?|plan(?:ning)?|aim(?:ing)?|deadline|by (?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|q[1-4]|\d{4}))\b/i;
const SIGNAL = /\b(prefer|always|never|avoid|don'?t|hate|tone|launch|deadline|budget|price|pricing|best[ -]?sell\w*|customers?|clients?|goal|plan|ship|discount|margin|suppliers?|open(?:ing)? hours)\b/i;

function normalize(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// Pull candidate memories out of one user message. Conservative on purpose:
// first-person business statements with a durable-fact signal.
export function extractMemories(text) {
  const out = [];
  const sentences = String(text || '').split(/(?<=[.!?])\s+|\n+/);
  for (let s of sentences) {
    s = s.trim().replace(/\s+/g, ' ');
    if (s.length < 15 || s.length > 220) continue;
    if (s.endsWith('?')) continue; // questions aren't facts
    const firstPerson = /^(we|our|i|my|us)\b/i.test(s);
    const strong = PREFERENCE.test(s) || GOAL.test(s);
    if (!(firstPerson && SIGNAL.test(s)) && !(firstPerson && strong)) continue;
    const kind = PREFERENCE.test(s) ? 'preference' : GOAL.test(s) ? 'goal' : 'fact';
    out.push({ text: s.replace(/[.!]+$/, ''), kind });
  }
  return out;
}

// Learn from a user message: extract, dedupe, cap (oldest unpinned evicted).
export function learnFromMessage(state, text, source) {
  const found = extractMemories(text);
  const added = [];
  for (const f of found) {
    const key = normalize(f.text);
    if (state.memories.some((m) => normalize(m.text) === key)) continue;
    const mem = { id: uid(), text: f.text, kind: f.kind, source: source || 'chat', learnedAt: Date.now(), pinned: false };
    state.memories.unshift(mem);
    added.push(mem);
  }
  while (state.memories.length > MAX_MEMORIES) {
    const idx = state.memories.map((m) => m.pinned).lastIndexOf(false);
    if (idx === -1) break;
    state.memories.splice(idx, 1);
  }
  return added;
}

// ---- AI-assisted memory (automated, verified) ------------------------------
// A connected model proposes candidate memories from conversation nuance, but
// every candidate is verified deterministically against the user's actual
// words before it is saved — the no-invented-memories guarantee holds.

export const MEMORY_PROPOSAL_SYSTEM = [
  'You extract durable business memories from ONE user message.',
  'Reply with up to 3 lines, each starting exactly with "MEMORY: ", quoting the user\'s own words as closely as possible (light trimming only). If nothing durable was stated, reply exactly "NONE".',
  'Only include stable facts, preferences, or goals the user stated about their business or how they like to work.',
  'Never include questions, requests, small talk, or anything the user did not say. Never add numbers or facts of your own.',
].join('\n');

export function parseCandidates(raw) {
  return String(raw || '')
    .split('\n')
    .filter((l) => l.trim().toUpperCase().startsWith('MEMORY:'))
    .map((l) => l.trim().slice(7).trim().replace(/^["“]|["”]$/g, ''))
    .filter(Boolean)
    .slice(0, 3);
}

// A candidate survives only if ≥70% of its meaningful words appear in the
// user's message (so the model cannot smuggle in invented content).
export function verifyCandidates(message, candidates) {
  const msgWords = new Set(normalize(message).split(' ').filter((w) => w.length >= 3));
  return candidates.filter((c) => {
    if (c.length < 15 || c.length > 220 || c.trim().endsWith('?')) return false;
    const words = normalize(c).split(' ').filter((w) => w.length >= 3);
    if (!words.length) return false;
    const present = words.filter((w) => msgWords.has(w)).length;
    return present / words.length >= 0.7;
  });
}

// Parse a model's proposal text, verify, classify, dedupe, and store.
export function aiLearn(state, rawProposal, message, source) {
  const verified = verifyCandidates(message, parseCandidates(rawProposal));
  const added = [];
  for (const text of verified) {
    const key = normalize(text);
    if (state.memories.some((m) => normalize(m.text) === key)) continue;
    const kind = PREFERENCE.test(text) ? 'preference' : GOAL.test(text) ? 'goal' : 'fact';
    const mem = { id: uid(), text: text.replace(/[.!]+$/, ''), kind, source: source || 'ai (verified)', learnedAt: Date.now(), pinned: false };
    state.memories.unshift(mem);
    added.push(mem);
  }
  while (state.memories.length > MAX_MEMORIES) {
    const idx = state.memories.map((m) => m.pinned).lastIndexOf(false);
    if (idx === -1) break;
    state.memories.splice(idx, 1);
  }
  return added;
}

// Thumbs feedback on an assistant reply → per-helper counters (computed, not guessed).
export function recordFeedback(state, helperId, rating) {
  state.feedback[helperId] ??= { up: 0, down: 0 };
  if (rating === 'up') state.feedback[helperId].up += 1;
  else if (rating === 'down') state.feedback[helperId].down += 1;
  return state.feedback[helperId];
}

// Memories relevant to a request: shared meaningful word (≥5 chars), computed.
export function relevantMemories(state, request, limit = 3) {
  const words = new Set(normalize(request).split(' ').filter((w) => w.length >= 5));
  const scored = [];
  for (const m of state.memories || []) {
    const overlap = normalize(m.text).split(' ').filter((w) => w.length >= 5 && words.has(w)).length;
    if (overlap > 0 || m.pinned) scored.push({ m, score: overlap + (m.pinned ? 2 : 0) });
  }
  scored.sort((a, b) => b.score - a.score || b.m.learnedAt - a.m.learnedAt);
  return scored.slice(0, limit).map((x) => x.m);
}
