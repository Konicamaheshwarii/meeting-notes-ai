import { SAMPLES } from '../samples';
import { parseTranscript } from '../transcript/transcript';
import { extractActionItems, extractDecisions, extractOpenQuestions, ruleAnalyze, ruleSentiment } from './rules';

const FRI = new Date(2026, 9, 2, 12); // Friday 2 October 2026
const items = (text: string) =>
  extractActionItems(parseTranscript(text), FRI).map((a) => `${a.task} | ${a.owner ?? '-'} | ${a.due ?? '-'} | ${a.priority}`);

describe('rule-based analyzer', () => {
  it('turns "I\'ll ..." into an item owned by the speaker, with the due date cut from the task', () => {
    expect(items("Dev: I'll write the migration for the orders table by Wednesday.")).toEqual([
      'Write the migration for the orders table | Dev | 2026-10-07 | medium',
    ]);
  });

  it('assigns "Name, can you ..." to the named person and reads urgency and soft asks', () => {
    expect(items('Maya: Priya, can you review the PR asap?\nPriya: Sure.\nMaya: Sam, could you tidy the docs when you get a chance?\nSam: Yes.')).toEqual([
      'Review the PR | Priya | - | high',
      'Tidy the docs | Sam | - | low',
    ]);
  });

  it('lets "I can take that" claim an open request, and keeps team needs unowned', () => {
    expect(items('Maya: Can someone own the rollback plan?\nDev: I can take that. Done by tomorrow.\nSam: We need to update the runbook.')).toEqual([
      'Own the rollback plan | Dev | 2026-10-03 | high',
      'Update the runbook | - | - | medium',
    ]);
  });

  it('ignores conversational "I\'ll" phrases and requests that are not tasks', () => {
    expect(items("Maya: I'll be honest, it was rough. Can you hear me? I'll share my screen.")).toEqual([]);
  });

  it('finds decisions and open questions', () => {
    const segs = parseTranscript("A: Let's go with Postgres for the new service.\nB: Should we also migrate the old reports? I'm not sure whether finance needs them.\nA: Okay?");
    expect(extractDecisions(segs)).toEqual(["Let's go with Postgres for the new service."]);
    expect(extractOpenQuestions(segs)).toEqual(['Should we also migrate the old reports?', "I'm not sure whether finance needs them."]);
  });

  it('reads the tone of a tense meeting', () => {
    const tense = ruleSentiment(parseTranscript('A: This outage is unacceptable, customers are angry.\nB: I am frustrated too, it happened again.\nA: The delay is a real problem.'));
    expect(tense.tone).toBe('tense');
    expect(ruleSentiment(parseTranscript('A: Great work, love it, thanks.\nB: Awesome progress, really happy.')).tone).toBe('positive');
  });

  it('produces complete notes for every bundled sample', () => {
    for (const sample of SAMPLES) {
      const a = ruleAnalyze(parseTranscript(sample.transcript), '2026-10-02');
      expect(a.tldr.length).withContext(sample.id).toBeGreaterThan(40);
      expect(a.keyPoints.length).withContext(sample.id).toBeGreaterThanOrEqual(3);
      expect(a.decisions.length).withContext(sample.id).toBeGreaterThanOrEqual(2);
      expect(a.actionItems.length).withContext(sample.id).toBeGreaterThanOrEqual(5);
      expect(a.actionItems.filter((x) => x.owner).length).withContext(sample.id).toBeGreaterThanOrEqual(4);
      expect(a.actionItems.filter((x) => x.due).length).withContext(sample.id).toBeGreaterThanOrEqual(3);
    }
  });
});
