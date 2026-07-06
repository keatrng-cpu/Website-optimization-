// In-process automation scheduler. Automations are recurring prompts run by a
// helper; each run produces a document and an inbox notification.
import { uid } from './store.js';
import { HELPER_MAP, systemPrompt } from './helpers.js';
import { generate } from './ai.js';

const TICK_MS = 30_000;

export function computeNextRun(schedule, from = Date.now()) {
  if (schedule.type === 'interval') {
    const mins = Math.max(1, Number(schedule.minutes) || 60);
    return from + mins * 60_000;
  }
  // daily at HH:MM local time
  const [h, m] = String(schedule.time || '09:00').split(':').map((n) => parseInt(n, 10) || 0);
  const d = new Date(from);
  d.setHours(h, m, 0, 0);
  if (d.getTime() <= from) d.setDate(d.getDate() + 1);
  return d.getTime();
}

export async function runAutomation(store, automation) {
  const s = store.state;
  const helper = HELPER_MAP[automation.helperId] || HELPER_MAP.vizzy;
  const system = systemPrompt(helper, s.brain, s.knowledge);
  const { text, engine } = await generate({
    settings: s.settings,
    helper,
    brain: s.brain,
    system,
    messages: [{ role: 'user', content: automation.prompt }],
  });
  const doc = {
    id: uid(),
    title: `${automation.name} — ${new Date().toLocaleDateString()}`,
    kind: 'automation',
    helperId: helper.id,
    content: text,
    engine,
    source: automation.id,
    createdAt: Date.now(),
  };
  s.documents.unshift(doc);
  s.inbox.unshift({
    id: uid(),
    title: `${helper.name} finished “${automation.name}”`,
    body: text.slice(0, 200),
    from: helper.id,
    read: false,
    documentId: doc.id,
    createdAt: Date.now(),
  });
  automation.lastRun = Date.now();
  automation.runs = (automation.runs || 0) + 1;
  automation.nextRun = computeNextRun(automation.schedule);
  store.save();
  return doc;
}

export function startScheduler(store) {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const now = Date.now();
      const due = store.state.automations.filter((a) => a.enabled && a.nextRun && a.nextRun <= now);
      for (const a of due) {
        try { await runAutomation(store, a); }
        catch (e) {
          console.error(`[automation] "${a.name}" failed:`, e.message);
          a.nextRun = computeNextRun(a.schedule); // don't tight-loop a failing job
          store.save();
        }
      }
    } finally { running = false; }
  }, TICK_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}
