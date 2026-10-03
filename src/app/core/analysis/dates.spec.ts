import { normalizeDue, resolveDue } from './dates';

// Wednesday 30 September 2026
const WED = new Date(2026, 8, 30, 12);
const due = (text: string, ref = WED) => resolveDue(text, ref)?.date;

describe('resolveDue', () => {
  it('resolves weekdays: "by Friday" is the coming one, "next Friday" is next week', () => {
    expect(due('send it by Friday')).toBe('2026-10-02');
    expect(due('this Friday works')).toBe('2026-10-02');
    expect(due('ship it next Friday')).toBe('2026-10-09');
    expect(due('by Wednesday')).toBe('2026-10-07'); // same weekday means a week later
    expect(due('next Mon')).toBe('2026-10-05');
  });

  it('resolves relative phrases', () => {
    expect(due('tomorrow morning')).toBe('2026-10-01');
    expect(due('by end of day')).toBe('2026-09-30');
    expect(due('by the end of the week')).toBe('2026-10-02');
    expect(due('by the end of next week')).toBe('2026-10-09');
    expect(due('sometime next week')).toBe('2026-10-05');
    expect(due('in two weeks')).toBe('2026-10-14');
    expect(due('within 3 business days')).toBe('2026-10-05');
    expect(due('before end of month')).toBe('2026-09-30');
  });

  it('resolves calendar dates and rolls past dates into next year', () => {
    expect(due('by Oct 12th')).toBe('2026-10-12');
    expect(due('on 3 March')).toBe('2027-03-03');
    expect(due('due 2026-11-01')).toBe('2026-11-01');
    expect(due('by 10/20')).toBe('2026-10-20');
    expect(due('by the 15th')).toBe('2026-10-15');
  });

  it('returns the phrase so it can be cut from the task, and ignores false friends', () => {
    expect(resolveDue("I'll do it by Friday", WED)?.phrase).toBe('by Friday');
    expect(resolveDue('we sat down with marketing', WED)).toBeNull();
    expect(resolveDue('half the team, 1/2 of it', WED)).toBeNull();
  });
});

describe('normalizeDue', () => {
  it('accepts ISO, resolves words, and drops placeholders', () => {
    expect(normalizeDue('2026-10-09T00:00:00Z', WED)).toBe('2026-10-09');
    expect(normalizeDue('Friday', WED)).toBe('2026-10-02');
    expect(normalizeDue('TBD', WED)).toBeUndefined();
    expect(normalizeDue(null, WED)).toBeUndefined();
    expect(normalizeDue('2026-02-31', WED)).toBeUndefined();
  });
});
