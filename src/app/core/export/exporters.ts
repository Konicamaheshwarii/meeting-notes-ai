import { ActionItem, Meeting, formatClock, fromIsoDate, meetingTitle } from '../models';
import { meetingDuration, segmentsToText, speakersOf, talkTime } from '../transcript/transcript';

const longDate = (iso: string) =>
  fromIsoDate(iso).toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });

/** Escapes characters that would change Markdown structure inside a line of text. */
const md = (s: string) => s.replace(/([\\`*_[\]<>|])/g, '\\$1').replace(/\r?\n/g, ' ');

export function actionItemLine(a: ActionItem): string {
  const meta = [a.owner && `**${md(a.owner)}**`, a.due && `due ${a.due}`, a.priority !== 'medium' && `${a.priority} priority`]
    .filter(Boolean)
    .join(' · ');
  return `- [${a.done ? 'x' : ' '}] ${md(a.task)}${meta ? ` (${meta})` : ''}`;
}

export function meetingToMarkdown(m: Meeting, opts: { includeTranscript?: boolean } = {}): string {
  const a = m.analysis;
  const speakers = speakersOf(m.segments);
  const out: string[] = [
    `# ${md(meetingTitle(m))}`,
    '',
    `*${longDate(m.date)} · ${formatClock(meetingDuration(m.segments))} · ${speakers.length} speaker${speakers.length === 1 ? '' : 's'}: ${speakers.map(md).join(', ')}*`,
    '',
  ];
  const list = (heading: string, items: string[]) => {
    if (!items.length) return;
    out.push(`## ${heading}`, '', ...items.map((i) => `- ${md(i)}`), '');
  };
  if (a) {
    if (a.tldr) out.push('## TL;DR', '', md(a.tldr), '');
    list('Key points', a.keyPoints);
    list('Decisions', a.decisions);
    if (a.actionItems.length) out.push('## Action items', '', ...a.actionItems.map(actionItemLine), '');
    list('Open questions', a.openQuestions);
    if (a.sentiment.note) out.push('## Tone', '', `**${a.sentiment.tone}**: ${md(a.sentiment.note)}`, '');
  }
  const times = talkTime(m.segments);
  if (times.length) {
    out.push('## Talk time', '', '| Speaker | Time | Share |', '|---|---|---|',
      ...times.map((t) => `| ${md(t.speaker)} | ${formatClock(t.seconds)} | ${Math.round(t.share * 100)}% |`), '');
  }
  if (opts.includeTranscript) out.push('## Transcript', '', '```text', segmentsToText(m.segments), '```', '');
  return out.join('\n').trimEnd() + '\n';
}

// ---------- iCalendar (RFC 5545) ----------

const icsText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Folds lines longer than 75 octets, as RFC 5545 requires. */
export function foldLine(line: string): string {
  const bytes = new TextEncoder();
  if (bytes.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  for (const ch of line) {
    const limit = parts.length ? 74 : 75; // continuation lines start with a space
    if (bytes.encode(current + ch).length > limit) {
      parts.push(current);
      current = '';
    }
    current += ch;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

const compactDate = (iso: string) => iso.replace(/-/g, '');
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

function nextDay(iso: string): string {
  const d = fromIsoDate(iso);
  d.setDate(d.getDate() + 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

/**
 * Action items with a due date become all-day events on that date, so they show up in
 * Google Calendar, Outlook and Apple Calendar. Items without a date are skipped.
 */
export function actionItemsToIcs(m: Meeting, items: ActionItem[], now = new Date()): string {
  const title = meetingTitle(m);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Minutes//Meeting notes//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const a of items.filter((i) => i.due)) {
    const priority = a.priority === 'high' ? 1 : a.priority === 'low' ? 9 : 5;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${a.id}-${m.id}@minutes`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART;VALUE=DATE:${compactDate(a.due!)}`,
      `DTEND;VALUE=DATE:${nextDay(a.due!)}`,
      `SUMMARY:${icsText(a.owner ? `${a.task} (${a.owner})` : a.task)}`,
      `DESCRIPTION:${icsText(`Action item from "${title}" on ${m.date}.${a.owner ? ` Owner: ${a.owner}.` : ''} Priority: ${a.priority}.`)}`,
      `PRIORITY:${priority}`,
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

// ---------- CSV (RFC 4180) ----------

/** Quotes a cell and defuses spreadsheet formulas (=, +, -, @ at the start). */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) || safe !== value ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function actionItemsToCsv(m: Meeting, items: ActionItem[]): string {
  const rows = [['Task', 'Owner', 'Due', 'Priority', 'Done', 'Meeting', 'Meeting date']];
  for (const a of items) rows.push([a.task, a.owner ?? '', a.due ?? '', a.priority, a.done ? 'yes' : 'no', meetingTitle(m), m.date]);
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** A file-system-safe slug for download names. */
export function slug(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_-]+/g, '-').slice(0, 60) || 'meeting';
}
