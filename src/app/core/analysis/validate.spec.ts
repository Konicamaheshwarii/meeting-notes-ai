import { extractJson, matchOwner, parseAnalysis } from './validate';

const ctx = { meetingDate: '2026-10-02', speakers: ['Priya Nair', 'Dev Patel'] };

describe('parseAnalysis', () => {
  it('extracts JSON from fenced, chatty or <think> replies', () => {
    expect(extractJson('<think>hmm {"x":0}</think>Sure! ```json\n{"a":1}\n``` hope that helps')).toEqual({ a: 1 });
    expect(() => extractJson('no json here')).toThrowError(/not valid JSON/);
  });

  it('validates and normalises a snake_case reply', () => {
    const a = parseAnalysis(JSON.stringify({
      title: 'Planning',
      summary: 'We planned.',
      key_points: ['- First point', '', 42],
      decisions: [{ decision: 'Ship Friday' }],
      action_items: [
        { task: 'Review PR', owner: 'priya', due: 'Friday', priority: 'URGENT' },
        { title: 'Write docs', assignee: 'unassigned', due_date: '2026-10-20', priority: 'p3' },
        { owner: 'Dev' },
        'Plain string task',
      ],
      open_questions: 'Who owns QA?',
      sentiment: 'Mostly positive and focused',
    }), ctx);
    expect(a.tldr).toBe('We planned.');
    expect(a.keyPoints).toEqual(['First point', '42']);
    expect(a.decisions).toEqual(['Ship Friday']);
    expect(a.actionItems.map((x) => [x.task, x.owner, x.due, x.priority, x.done])).toEqual([
      ['Review PR', 'Priya Nair', '2026-10-09', 'high', false],
      ['Write docs', undefined, '2026-10-20', 'low', false],
      ['Plain string task', undefined, undefined, 'medium', false],
    ]);
    expect(a.openQuestions).toEqual(['Who owns QA?']);
    expect(a.sentiment.tone).toBe('positive');
  });

  it('rejects replies with no notes and wrong shapes', () => {
    expect(() => parseAnalysis('{"title":"x"}', ctx)).toThrowError(/no notes/);
    expect(() => parseAnalysis('[1,2]', ctx)).toThrowError(/wrong shape/);
  });

  it('matches owners to speakers by full or first name', () => {
    expect(matchOwner('DEV PATEL', ctx.speakers)).toBe('Dev Patel');
    expect(matchOwner('Priya', ctx.speakers)).toBe('Priya Nair');
    expect(matchOwner('Legal team', ctx.speakers)).toBe('Legal team');
    expect(matchOwner('N/A', ctx.speakers)).toBeUndefined();
  });
});
