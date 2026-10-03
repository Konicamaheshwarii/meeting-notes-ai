import { ActionItem, Analysis, Segment } from '../models';
import { LlmProvider, LlmRequest } from '../llm/llm-provider';
import { chunkSegments, speakersOf } from '../transcript/transcript';
import { mergeAnalyses } from './merge';
import { analyzeChunkRequest, mergeRequest } from './prompts';
import { jaccard } from './text';
import { parseAnalysis } from './validate';

export interface AnalysisProgress {
  /** 1-based step currently running. */
  step: number;
  total: number;
  label: string;
  /** Characters of the reply received so far for this step. */
  received: number;
}

export interface PipelineOptions {
  meetingDate: string;
  chunkChars: number;
  onProgress?: (p: AnalysisProgress) => void;
  signal?: AbortSignal;
}

async function collect(llm: LlmProvider, req: LlmRequest, onChars: (n: number) => void, signal?: AbortSignal): Promise<string> {
  let text = '';
  for await (const piece of llm.stream(req, signal)) {
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    text += piece;
    onChars(text.length);
  }
  return text;
}

/**
 * Map-reduce summarisation: each chunk of the transcript is summarised on its own (map),
 * then the partial notes are merged into one (reduce). Short meetings are a single step.
 */
export async function runAnalysis(llm: LlmProvider, segments: Segment[], opts: PipelineOptions): Promise<Analysis> {
  if (!segments.length) throw new Error('The transcript is empty.');
  const ctx = { meetingDate: opts.meetingDate, speakers: speakersOf(segments) };
  const chunks = chunkSegments(segments, opts.chunkChars);
  const total = chunks.length + (chunks.length > 1 ? 1 : 0);
  const report = (step: number, label: string, received = 0) => opts.onProgress?.({ step, total, label, received });

  const partials: Analysis[] = [];
  for (const [i, chunk] of chunks.entries()) {
    const label = chunks.length > 1 ? `Summarising part ${i + 1} of ${chunks.length}` : 'Summarising the meeting';
    report(i + 1, label);
    const text = await collect(llm, analyzeChunkRequest(chunk, i + 1, chunks.length, ctx), (n) => report(i + 1, label, n), opts.signal);
    partials.push(parseAnalysis(text, ctx));
  }
  if (partials.length === 1) return partials[0];

  const label = `Merging ${partials.length} partial summaries`;
  report(total, label);
  try {
    const text = await collect(llm, mergeRequest(partials, ctx), (n) => report(total, label, n), opts.signal);
    return parseAnalysis(text, ctx);
  } catch (e) {
    if (opts.signal?.aborted || (e as Error).name === 'AbortError') throw e;
    // The partial notes are still good; merge them locally rather than failing the whole run.
    return mergeAnalyses(partials);
  }
}

/** Keeps ticked checkboxes when a meeting is analysed again and the same task comes back. */
export function carryOverDone(next: ActionItem[], previous: ActionItem[] | undefined): ActionItem[] {
  if (!previous?.length) return next;
  return next.map((item) => {
    const match = previous.find((p) => p.done && jaccard(p.task, item.task) >= 0.75);
    return match ? { ...item, done: true } : item;
  });
}
