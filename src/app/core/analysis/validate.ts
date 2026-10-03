import { ActionItem, Analysis, PRIORITIES, Priority, TONES, Tone, fromIsoDate, uid } from '../models';
import { normalizeDue } from './dates';

/** Models sometimes wrap JSON in prose, code fences or <think> blocks. */
export function extractJson(text: string): any {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```(?:json)?/gi, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        // fall through
      }
    }
    throw new Error('The AI reply was not valid JSON. Please try again.');
  }
}

export interface ValidateContext {
  /** Meeting day, YYYY-MM-DD, for resolving due dates the model left relative. */
  meetingDate: string;
  speakers: string[];
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');

function strings(v: unknown, max: number): string[] {
  if (!Array.isArray(v)) return typeof v === 'string' && v.trim() ? [v.trim()] : [];
  return v
    .map((x) => (typeof x === 'string' ? x : str(x?.text ?? x?.decision ?? x?.question ?? x?.point ?? x?.summary)))
    .map((x) => x.trim().replace(/^[-*•]\s*/, ''))
    .filter(Boolean)
    .slice(0, max);
}

function priority(v: unknown): Priority {
  const p = str(v).toLowerCase();
  if (PRIORITIES.includes(p as Priority)) return p as Priority;
  if (/urgent|critical|p0|p1|asap/.test(p)) return 'high';
  if (/p3|p4|minor|nice/.test(p)) return 'low';
  return 'medium';
}

/** Maps a model-written owner onto a real speaker label where possible ("priya" -> "Priya Nair"). */
export function matchOwner(raw: unknown, speakers: string[]): string | undefined {
  const owner = str(raw);
  if (!owner || /^(none|null|n\/a|unassigned|unknown|tbd|-)$/i.test(owner)) return undefined;
  const lower = owner.toLowerCase();
  return speakers.find((s) => s.toLowerCase() === lower)
    ?? speakers.find((s) => s.split(/\s+/)[0].toLowerCase() === lower.split(/\s+/)[0])
    ?? owner.slice(0, 60);
}

function actionItems(v: unknown, ctx: ValidateContext): ActionItem[] {
  if (!Array.isArray(v)) return [];
  const date = fromIsoDate(ctx.meetingDate);
  return v
    .map((x): ActionItem | null => {
      const task = typeof x === 'string' ? x.trim() : str(x?.task ?? x?.title ?? x?.description ?? x?.action);
      if (!task) return null;
      const owner = typeof x === 'object' ? matchOwner(x?.owner ?? x?.assignee ?? x?.who, ctx.speakers) : undefined;
      const due = typeof x === 'object' ? normalizeDue(x?.due ?? x?.dueDate ?? x?.due_date ?? x?.deadline, date) : undefined;
      return {
        id: uid('a'),
        task: task.slice(0, 240),
        ...(owner ? { owner } : {}),
        ...(due ? { due } : {}),
        priority: priority(typeof x === 'object' ? x?.priority : ''),
        done: false,
      };
    })
    .filter((x): x is ActionItem => !!x)
    .slice(0, 40);
}

function sentiment(v: any): Analysis['sentiment'] {
  if (typeof v === 'string') {
    const tone = TONES.find((t) => v.toLowerCase().includes(t)) ?? 'neutral';
    return { tone, note: v.trim() };
  }
  const raw = str(v?.tone ?? v?.label ?? v?.overall).toLowerCase();
  const tone: Tone = TONES.find((t) => raw.includes(t))
    ?? (/tension|heated|conflict/.test(raw) ? 'tense' : /upbeat|optimis|happy/.test(raw) ? 'positive' : 'neutral');
  return { tone, note: str(v?.note ?? v?.summary ?? v?.explanation) };
}

/** Parses and validates an analysis reply. Accepts camelCase or snake_case keys. */
export function parseAnalysis(text: string, ctx: ValidateContext): Analysis {
  const raw = extractJson(text);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('The AI reply had the wrong shape. Please try again.');
  const analysis: Analysis = {
    title: str(raw.title).slice(0, 120),
    tldr: str(raw.tldr ?? raw.tl_dr ?? raw.summary),
    keyPoints: strings(raw.keyPoints ?? raw.key_points, 12),
    decisions: strings(raw.decisions, 12),
    actionItems: actionItems(raw.actionItems ?? raw.action_items, ctx),
    openQuestions: strings(raw.openQuestions ?? raw.open_questions, 10),
    sentiment: sentiment(raw.sentiment ?? raw.tone),
  };
  if (!analysis.tldr && !analysis.keyPoints.length && !analysis.actionItems.length && !analysis.decisions.length) {
    throw new Error('The AI reply had no notes in it. Please try again.');
  }
  return analysis;
}

/** The compact JSON shape the prompts ask for (and the merge step sends back to the model). */
export function analysisToJson(a: Analysis): object {
  return {
    title: a.title,
    tldr: a.tldr,
    keyPoints: a.keyPoints,
    decisions: a.decisions,
    actionItems: a.actionItems.map(({ task, owner, due, priority }) => ({ task, owner: owner ?? null, due: due ?? null, priority })),
    openQuestions: a.openQuestions,
    sentiment: a.sentiment,
  };
}
