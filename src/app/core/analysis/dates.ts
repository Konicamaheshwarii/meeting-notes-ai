import { isoDate } from '../models';

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const NUMBERS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, couple: 2, few: 3 };

const DAY = String.raw`(?:mon|tues?|wed(?:nes)?|thu(?:rs?)?|fri|sat(?:ur)?|sun)(?:day)?`;
const MONTH = String.raw`(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)\b\.?`;
const ORD = String.raw`(\d{1,2})(?:st|nd|rd|th)?`;
const COUNT = String.raw`(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|a couple of|a few)`;
const PREP = String.raw`(?:\b(?:by|before|on|until|till|due|for|no later than|at the latest by)\s+(?:the\s+)?)?`;

export interface DueMatch {
  /** YYYY-MM-DD */
  date: string;
  /** The phrase as written, including a leading "by"/"before", so it can be cut from the task. */
  phrase: string;
}

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12);
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12);

function weekdayIndex(word: string): number {
  return WEEKDAYS.findIndex((w) => w.startsWith(word.toLowerCase().slice(0, 3)));
}

function monthIndex(word: string): number {
  return MONTHS.findIndex((m) => m.startsWith(word.toLowerCase().replace('.', '').slice(0, 3)));
}

/** Next occurrence of a weekday strictly after the reference day. */
function nextWeekday(ref: Date, day: number): Date {
  const diff = (day - ref.getDay() + 7) % 7 || 7;
  return addDays(ref, diff);
}

/** Monday of the week (weeks start on Monday) containing d. */
function mondayOf(d: Date): Date {
  return addDays(d, -((d.getDay() + 6) % 7));
}

/** Friday of the current work week; on weekends, the coming Friday. */
function endOfWeek(ref: Date): Date {
  const day = ref.getDay();
  if (day === 6 || day === 0) return nextWeekday(ref, 5);
  return addDays(ref, 5 - day);
}

function countOf(raw: string): number {
  const key = raw.toLowerCase().replace(/^a (couple|few) of$/, '$1');
  return /^\d+$/.test(key) ? Number(key) : NUMBERS[key] ?? 1;
}

/** Builds a date for month/day, rolling into next year if it is already well past. */
function calendarDate(ref: Date, month: number, day: number, year?: number): Date | null {
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  let d = new Date(year ?? ref.getFullYear(), month, day, 12);
  if (d.getMonth() !== month) return null;
  if (year === undefined && d < addDays(ref, -7)) d = new Date(ref.getFullYear() + 1, month, day, 12);
  return d;
}

interface Rule {
  re: RegExp;
  resolve(m: RegExpMatchArray, ref: Date): Date | null;
}

// Ordered from most to least specific: the first rule that matches wins.
const RULES: Rule[] = [
  { re: /\b(\d{4})-(\d{2})-(\d{2})\b/, resolve: (m) => calendarDate(new Date(), Number(m[2]) - 1, Number(m[3]), Number(m[1])) },
  { re: /\b(?:end of|eo)\s*(?:the\s+)?next week\b/i, resolve: (_, ref) => addDays(endOfWeek(ref), 7) },
  { re: /\b(?:end of (?:the )?week|eow|this week)\b/i, resolve: (_, ref) => endOfWeek(ref) },
  { re: /\b(?:end of (?:the |this )?month|eom)\b/i, resolve: (_, ref) => new Date(ref.getFullYear(), ref.getMonth() + 1, 0, 12) },
  { re: /\b(?:end of (?:the )?(?:day|today)|eod|cob|close of business|today|tonight|this (?:afternoon|evening|morning))\b/i, resolve: (_, ref) => startOfDay(ref) },
  { re: /\b(?:the )?day after tomorrow\b/i, resolve: (_, ref) => addDays(ref, 2) },
  { re: /\btomorrow(?: morning| afternoon| evening| night)?\b/i, resolve: (_, ref) => addDays(ref, 1) },
  { re: new RegExp(String.raw`\bnext (${DAY})\b`, 'i'), resolve: (m, ref) => addDays(mondayOf(ref), 7 + ((weekdayIndex(m[1]) + 6) % 7)) },
  { re: new RegExp(String.raw`\bthis (${DAY})\b`, 'i'), resolve: (m, ref) => {
    const target = weekdayIndex(m[1]);
    return target === ref.getDay() ? startOfDay(ref) : nextWeekday(ref, target);
  } },
  { re: /\bnext week\b/i, resolve: (_, ref) => addDays(mondayOf(ref), 7) },
  { re: /\bnext month\b/i, resolve: (_, ref) => new Date(ref.getFullYear(), ref.getMonth() + 1, 1, 12) },
  { re: new RegExp(String.raw`\b(?:in|within) ${COUNT} (day|week|business day|working day)s?\b`, 'i'), resolve: (m, ref) => {
    const n = countOf(m[1]);
    if (/week/i.test(m[2])) return addDays(ref, n * 7);
    if (/business|working/i.test(m[2])) {
      let d = ref;
      for (let left = n; left > 0;) { d = addDays(d, 1); if (d.getDay() % 6 !== 0) left--; }
      return d;
    }
    return addDays(ref, n);
  } },
  { re: /\b(?:a week from (?:today|now)|in a week)\b/i, resolve: (_, ref) => addDays(ref, 7) },
  { re: new RegExp(String.raw`\b(${MONTH})\s+${ORD}\b(?:,?\s*(\d{4}))?`, 'i'), resolve: (m, ref) =>
    calendarDate(ref, monthIndex(m[1]), Number(m[2]), m[3] ? Number(m[3]) : undefined) },
  { re: new RegExp(String.raw`\b${ORD}(?:\s+of)?\s+(${MONTH})(?:\s+(\d{4}))?`, 'i'), resolve: (m, ref) =>
    calendarDate(ref, monthIndex(m[2]), Number(m[1]), m[3] ? Number(m[3]) : undefined) },
  { re: /\b(?:by|on|before|due|until)\s+(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/i, resolve: (m, ref) =>
    calendarDate(ref, Number(m[1]) - 1, Number(m[2]), m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : undefined) },
  { re: /\bthe (\d{1,2})(?:st|nd|rd|th)\b/i, resolve: (m, ref) => {
    const day = Number(m[1]);
    const thisMonth = calendarDate(ref, ref.getMonth(), day, ref.getFullYear());
    return thisMonth && thisMonth >= startOfDay(ref) ? thisMonth : calendarDate(ref, ref.getMonth() + 1 > 11 ? 0 : ref.getMonth() + 1, day, ref.getMonth() === 11 ? ref.getFullYear() + 1 : ref.getFullYear());
  } },
  { re: /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i, resolve: (m, ref) => nextWeekday(ref, weekdayIndex(m[1])) },
];

/**
 * Finds the first due-date expression in a sentence and resolves it against the meeting date.
 * "by Friday" means the next Friday after the meeting; "next Friday" means Friday of next week.
 */
export function resolveDue(text: string, meetingDate: Date): DueMatch | null {
  const ref = startOfDay(meetingDate);
  for (const rule of RULES) {
    const re = new RegExp(PREP + rule.re.source, rule.re.flags.includes('i') ? 'i' : '');
    const m = text.match(re);
    if (!m) continue;
    // Re-run the bare rule to get its own capture groups.
    const inner = m[0].match(rule.re);
    const date = inner ? rule.resolve(inner, ref) : null;
    if (date) return { date: isoDate(date), phrase: m[0].trim() };
  }
  return null;
}

/** Normalises a date the AI returned: ISO stays, anything else is resolved like speech. */
export function normalizeDue(raw: unknown, meetingDate: Date): string | undefined {
  if (typeof raw !== 'string' || !raw.trim() || /^(none|null|n\/a|tbd|unknown)$/i.test(raw.trim())) return undefined;
  const iso = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const d = calendarDate(meetingDate, Number(iso[2]) - 1, Number(iso[3]), Number(iso[1]));
    return d ? isoDate(d) : undefined;
  }
  return resolveDue(raw, meetingDate)?.date;
}
