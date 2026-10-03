import { mergeAnalyses } from '../analysis/merge';
import { ChunkInput, MergeInput } from '../analysis/prompts';
import { ruleAnalyze } from '../analysis/rules';
import { analysisToJson } from '../analysis/validate';
import { LlmProvider, LlmRequest } from './llm-provider';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Offline provider so every feature works without a key. It answers the same requests a real
 * model gets, using the rule-based analyzer for each chunk and a local merge for the reduce step.
 */
export class DemoProvider implements LlmProvider {
  constructor(private readonly delayMs = 500) {}

  async complete(req: LlmRequest): Promise<string> {
    await sleep(this.delayMs);
    switch (req.task) {
      case 'analyze-chunk': {
        const { segments, meetingDate } = req.input as ChunkInput;
        return JSON.stringify(analysisToJson(ruleAnalyze(segments, meetingDate)));
      }
      case 'merge':
        return JSON.stringify(analysisToJson(mergeAnalyses((req.input as MergeInput).partials)));
      default:
        return '{"ok":true}';
    }
  }

  async *stream(req: LlmRequest, signal?: AbortSignal): AsyncIterable<string> {
    const text = await this.complete(req);
    const size = Math.max(40, Math.ceil(text.length / 12));
    for (let i = 0; i < text.length; i += size) {
      if (signal?.aborted) return;
      await sleep(this.delayMs / 12);
      yield text.slice(i, i + size);
    }
  }
}
