import { Segment } from '../models';
import { chunkSegments, parseTime, parseTranscript, renameSpeaker, segmentsToText, talkTime } from './transcript';
import { whisperLanguage, whisperToSegments } from './whisper';

const seg = (speaker: string, start: number, text: string, end?: number): Segment =>
  ({ id: `${speaker}-${start}`, speaker, start, text, ...(end !== undefined ? { end } : {}) });

describe('parseTranscript', () => {
  it('reads "Name: text" lines with bracketed and bare timestamps', () => {
    const s = parseTranscript(`[00:05] Maya Chen: Let's start.\n00:01:10 Dev: I'll take the migration.\ncontinued on the next line\n\nPriya Nair (2:30): Sounds good.`);
    expect(s.map((x) => [x.speaker, x.start, x.text])).toEqual([
      ['Maya Chen', 5, "Let's start."],
      ['Dev', 70, "I'll take the migration. continued on the next line"],
      ['Priya Nair', 150, 'Sounds good.'],
    ]);
    expect(s.some((x) => x.estimated)).toBeFalse();
  });

  it('handles WebVTT voice tags, SRT numbering and Zoom-style header lines', () => {
    const vtt = parseTranscript('WEBVTT\n\n1\n00:00:01.000 --> 00:00:04.500\n<v Alex Morgan>Hello there.</v>\n\n00:00:05.000 --> 00:00:07.000\n<v Rita>Hi!</v>');
    expect(vtt.map((x) => [x.speaker, x.start, x.end, x.text])).toEqual([['Alex Morgan', 1, 4.5, 'Hello there.'], ['Rita', 5, 7, 'Hi!']]);

    const zoom = parseTranscript('Jordan Reyes  0:00\nThanks for joining.\n\nTom Becker  0:12\nHappy to be here.');
    expect(zoom.map((x) => [x.speaker, x.start])).toEqual([['Jordan Reyes', 0], ['Tom Becker', 12]]);
  });

  it('estimates times from word count when there are no timestamps, and ignores label-like words', () => {
    const s = parseTranscript('Note: this is not a speaker.\nAnd another line.\n\nSecond paragraph here.');
    expect(s.length).toBe(2);
    expect(s[0].speaker).toBe('Speaker 1');
    expect(s[0].start).toBe(0);
    expect(s[1].start).toBeCloseTo(9 / 2.5, 1); // 9 words at 150 wpm
    expect(s.every((x) => x.estimated)).toBeTrue();
  });

  it('parses clock strings and round-trips through segmentsToText', () => {
    expect(parseTime('1:02:03.5')).toBe(3723.5);
    expect(parseTime('12:05')).toBe(725);
    expect(parseTime('nope')).toBeNull();
    const text = segmentsToText([seg('A', 65, 'one'), seg('B', 3700, 'two')]);
    expect(text).toBe('[1:05] A: one\n[1:01:40] B: two');
    expect(parseTranscript(text).map((x) => [x.speaker, x.start])).toEqual([['A', 65], ['B', 3700]]);
  });

  it('renames a speaker everywhere and merges into an existing name', () => {
    const list = [seg('Speaker 1', 0, 'a'), seg('Speaker 2', 1, 'b'), seg('Speaker 1', 2, 'c')];
    expect(renameSpeaker(list, 'Speaker 1', '  Maya  ').map((x) => x.speaker)).toEqual(['Maya', 'Speaker 2', 'Maya']);
    expect(renameSpeaker(list, 'Speaker 2', 'Speaker 1').map((x) => x.speaker)).toEqual(['Speaker 1', 'Speaker 1', 'Speaker 1']);
    expect(renameSpeaker(list, 'Speaker 1', ' ')).toBe(list);
  });
});

describe('talkTime', () => {
  it('uses end times, then gaps to the next segment, and ignores long silences', () => {
    const rows = talkTime([
      seg('A', 0, 'one two three four five', 10), // explicit end: 10 s
      seg('B', 10, 'six seven eight nine ten'),   // gap 12 s (plausible for 5 words)
      seg('A', 22, 'eleven twelve'),              // gap 300 s is silence: estimate 2 words / 2.5 = 0.8 s
      seg('B', 322, 'last words here'),           // last: 3 words = 1.2 s
    ]);
    const a = rows.find((r) => r.speaker === 'A')!;
    const b = rows.find((r) => r.speaker === 'B')!;
    expect(rows[0].speaker).toBe('B');
    expect(b.seconds).toBe(13);
    expect(a.seconds).toBe(11);
    expect(a.turns).toBe(2);
    expect(a.words).toBe(7);
    expect(a.share + b.share).toBeCloseTo(1, 5);
  });
});

describe('chunkSegments', () => {
  it('packs segments in order under the limit and splits an oversized one at sentences', () => {
    const long = Array.from({ length: 12 }, (_, i) => `Sentence number ${i} is here.`).join(' ');
    const list = [seg('A', 0, 'short one'), seg('B', 5, long), seg('C', 9, 'short two')];
    const chunks = chunkSegments(list, 120);
    const line = (s: Segment) => segmentsToText([s]).length + 1;
    for (const c of chunks) expect(c.reduce((n, s) => n + line(s), 0)).toBeLessThanOrEqual(120);
    const flat = chunks.flat();
    expect(flat[0].text).toBe('short one');
    expect(flat[flat.length - 1].text).toBe('short two');
    expect(flat.filter((s) => s.speaker === 'B').map((s) => s.text).join(' ')).toBe(long);
    expect(chunkSegments(list, 100000).length).toBe(1);
  });
});

describe('whisper helpers', () => {
  it('maps verbose_json segments and language codes', () => {
    const s = whisperToSegments({ segments: [{ start: 0, end: 2.46, text: ' Hello. ' }, { start: 2.5, end: 3, text: '  ' }] });
    expect(s.map((x) => [x.start, x.end, x.text, x.speaker])).toEqual([[0, 2.5, 'Hello.', 'Speaker 1']]);
    expect(whisperToSegments({ text: 'Only text', duration: 4 })[0].end).toBe(4);
    expect(whisperLanguage('en-US')).toBe('en');
    expect(whisperLanguage('xx_long_tag')).toBe('xx');
    expect(whisperLanguage('???')).toBeUndefined();
  });
});
