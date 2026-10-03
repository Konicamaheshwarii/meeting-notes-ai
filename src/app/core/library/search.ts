import { Meeting, meetingTitle } from '../models';

export interface SearchHit {
  meeting: Meeting;
  score: number;
  /** A short excerpt around the first match in the transcript or notes. */
  snippet?: string;
}

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');

function excerpt(text: string, term: string, radius = 60): string {
  const i = norm(text).indexOf(term);
  if (i < 0) return '';
  const start = Math.max(0, text.lastIndexOf(' ', Math.max(0, i - radius)) + 1);
  const endSpace = text.indexOf(' ', i + term.length + radius);
  const end = endSpace < 0 ? text.length : endSpace;
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
}

/**
 * Every query word must appear somewhere in the meeting. Matches in the title and notes rank above
 * matches buried in the transcript. Newest first among equal scores.
 */
export function searchMeetings(meetings: Meeting[], query: string): SearchHit[] {
  const terms = norm(query).split(/\s+/).filter(Boolean);
  const byDate = [...meetings].sort((a, b) => (b.date + b.createdAt).localeCompare(a.date + a.createdAt));
  if (!terms.length) return byDate.map((meeting) => ({ meeting, score: 0 }));

  const hits: SearchHit[] = [];
  for (const m of byDate) {
    const a = m.analysis;
    const title = norm(meetingTitle(m));
    const notes = norm([a?.tldr, ...(a?.keyPoints ?? []), ...(a?.decisions ?? []), ...(a?.openQuestions ?? []),
      ...(a?.actionItems ?? []).map((x) => `${x.task} ${x.owner ?? ''}`)].join(' \n '));
    const people = norm(m.segments.map((s) => s.speaker).join(' '));
    const transcript = m.segments.map((s) => s.text).join(' ');
    const transcriptNorm = norm(transcript);

    let score = 0;
    let all = true;
    for (const t of terms) {
      const s = (title.includes(t) ? 5 : 0) + (notes.includes(t) ? 3 : 0) + (people.includes(t) ? 2 : 0) + (transcriptNorm.includes(t) ? 1 : 0);
      if (!s) { all = false; break; }
      score += s;
    }
    if (!all) continue;
    const snippetSource = [a?.tldr ?? '', transcript].find((x) => norm(x).includes(terms[0])) ?? '';
    hits.push({ meeting: m, score, snippet: snippetSource ? excerpt(snippetSource, terms[0]) : undefined });
  }
  return hits.sort((x, y) => y.score - x.score);
}
