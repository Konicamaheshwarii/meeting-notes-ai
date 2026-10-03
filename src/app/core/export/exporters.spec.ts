import { Meeting } from '../models';
import { actionItemsToCsv, actionItemsToIcs, csvCell, foldLine, meetingToMarkdown, slug } from './exporters';

const meeting: Meeting = {
  id: 'm1',
  title: 'Launch sync',
  date: '2026-10-02',
  createdAt: '2026-10-02T10:00:00Z',
  updatedAt: '2026-10-02T10:00:00Z',
  source: 'paste',
  segments: [
    { id: 's1', start: 0, end: 60, speaker: 'Maya', text: 'Hello.' },
    { id: 's2', start: 60, end: 90, speaker: 'Dev', text: 'Hi.' },
  ],
  analysis: {
    title: 'AI title',
    tldr: 'We agreed on *the* launch.',
    keyPoints: ['Launch is on track'],
    decisions: ['Ship on Monday'],
    actionItems: [
      { id: 'a1', task: 'Write the post, then tweet', owner: 'Maya', due: '2026-10-09', priority: 'high', done: true },
      { id: 'a2', task: '=HYPERLINK("x")', priority: 'medium', done: false },
    ],
    openQuestions: [],
    sentiment: { tone: 'positive', note: 'Upbeat.' },
  },
};

describe('meetingToMarkdown', () => {
  it('writes headings, a checklist, talk time, and escapes Markdown characters', () => {
    const md = meetingToMarkdown(meeting);
    expect(md).toContain('# Launch sync\n');
    expect(md).toContain('2 speakers: Maya, Dev');
    expect(md).toContain('We agreed on \\*the\\* launch.');
    expect(md).toContain('- [x] Write the post, then tweet (**Maya** · due 2026-10-09 · high priority)');
    expect(md).toContain('- [ ] =HYPERLINK("x")');
    expect(md).toContain('| Maya | 1:00 | 67% |');
    expect(md).not.toContain('## Open questions');
    expect(md).not.toContain('## Transcript');
    expect(meetingToMarkdown(meeting, { includeTranscript: true })).toContain('[1:00] Dev: Hi.');
  });
});

describe('actionItemsToIcs', () => {
  it('creates all-day events for dated items only, escaped and CRLF-terminated', () => {
    const ics = actionItemsToIcs(meeting, meeting.analysis!.actionItems, new Date(Date.UTC(2026, 9, 2, 9, 30)));
    const lines = ics.split('\r\n');
    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(ics.match(/BEGIN:VEVENT/g)!.length).toBe(1);
    expect(lines).toContain('DTSTART;VALUE=DATE:20261009');
    expect(lines).toContain('DTEND;VALUE=DATE:20261010');
    expect(lines).toContain('DTSTAMP:20261002T093000Z');
    expect(lines).toContain('SUMMARY:Write the post\\, then tweet (Maya)');
    expect(lines).toContain('PRIORITY:1');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBeTrue();
    expect(ics.split('\n').every((l) => !l || l.endsWith('\r') || l === '')).toBeTrue();
  });

  it('folds lines over 75 octets', () => {
    const folded = foldLine('DESCRIPTION:' + 'é'.repeat(80));
    const parts = folded.split('\r\n');
    expect(parts.length).toBeGreaterThan(1);
    const enc = new TextEncoder();
    expect(parts.every((p) => enc.encode(p).length <= 75)).toBeTrue();
    expect(parts.slice(1).every((p) => p.startsWith(' '))).toBeTrue();
    expect(folded.replace(/\r\n /g, '')).toBe('DESCRIPTION:' + 'é'.repeat(80));
  });
});

describe('actionItemsToCsv', () => {
  it('quotes cells and defuses spreadsheet formulas', () => {
    const rows = actionItemsToCsv(meeting, meeting.analysis!.actionItems).split('\r\n');
    expect(rows[0]).toBe('Task,Owner,Due,Priority,Done,Meeting,Meeting date');
    expect(rows[1]).toBe('"Write the post, then tweet",Maya,2026-10-09,high,yes,Launch sync,2026-10-02');
    expect(rows[2]).toBe(`"'=HYPERLINK(""x"")",,,medium,no,Launch sync,2026-10-02`);
    expect(csvCell('plain')).toBe('plain');
    expect(slug('Sprint 24: Checkout / Revamp!')).toBe('sprint-24-checkout-revamp');
  });
});
