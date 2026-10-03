import { ActionItem, Analysis, Tone } from '../models';
import { dedupe, jaccard } from './text';
import { splitSentences } from '../transcript/transcript';

/** Takes up to `max` items, round-robin across partials so every part of the meeting is represented. */
function interleave(lists: string[][], max: number): string[] {
  const out: string[] = [];
  for (let i = 0; out.length < max && lists.some((l) => l[i] !== undefined); i++) {
    for (const l of lists) if (l[i] !== undefined) out.push(l[i]);
  }
  return dedupe(out).slice(0, max);
}

export function mergeActionItems(lists: ActionItem[][]): ActionItem[] {
  const out: ActionItem[] = [];
  for (const item of lists.flat()) {
    const dup = out.find((o) => jaccard(o.task, item.task) >= 0.6);
    if (!dup) { out.push({ ...item }); continue; }
    dup.owner ??= item.owner;
    dup.due ??= item.due;
    if (item.priority === 'high') dup.priority = 'high';
  }
  return out;
}

const SEVERITY: Record<Tone, number> = { positive: 0, neutral: 1, mixed: 2, negative: 3, tense: 4 };

function mergeTone(tones: Tone[]): Tone {
  if (!tones.length) return 'neutral';
  const counts = new Map<Tone, number>();
  tones.forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1));
  const [top] = [...counts].sort((a, b) => b[1] - a[1] || SEVERITY[b[0]] - SEVERITY[a[0]]);
  // A tense stretch in an otherwise positive meeting reads as mixed, not as all-positive.
  if (top[0] === 'positive' && tones.some((t) => SEVERITY[t] >= 3)) return 'mixed';
  return top[0];
}

/**
 * Reduce step of map-reduce summarisation, done locally. Used by Demo mode and as a fallback
 * when the model's own merge reply cannot be parsed.
 */
export function mergeAnalyses(partials: Analysis[]): Analysis {
  if (partials.length === 1) return partials[0];
  const tldr = partials
    .map((p) => splitSentences(p.tldr)[0])
    .filter(Boolean);
  return {
    title: partials.find((p) => p.title)?.title ?? 'Meeting notes',
    tldr: dedupe(tldr).slice(0, 3).join(' '),
    keyPoints: interleave(partials.map((p) => p.keyPoints), 8),
    decisions: dedupe(partials.flatMap((p) => p.decisions)).slice(0, 10),
    actionItems: mergeActionItems(partials.map((p) => p.actionItems)),
    openQuestions: dedupe(partials.flatMap((p) => p.openQuestions)).slice(0, 6),
    sentiment: {
      tone: mergeTone(partials.map((p) => p.sentiment.tone)),
      note: partials.map((p) => p.sentiment.note).find(Boolean) ?? '',
    },
  };
}
