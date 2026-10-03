/** One utterance in a transcript. Times are seconds from the start of the meeting. */
export interface Segment {
  id: string;
  start: number;
  end?: number;
  speaker: string;
  text: string;
  /** True when the start time was inferred from word count rather than captured. */
  estimated?: boolean;
}

export type Priority = 'high' | 'medium' | 'low';

export interface ActionItem {
  id: string;
  task: string;
  owner?: string;
  /** ISO date, YYYY-MM-DD. */
  due?: string;
  priority: Priority;
  done: boolean;
}

export type Tone = 'positive' | 'neutral' | 'mixed' | 'tense' | 'negative';

export interface Analysis {
  title: string;
  tldr: string;
  keyPoints: string[];
  decisions: string[];
  actionItems: ActionItem[];
  openQuestions: string[];
  sentiment: { tone: Tone; note: string };
}

export interface SpeakerTime {
  speaker: string;
  seconds: number;
  words: number;
  /** 0..1 share of total talk time. */
  share: number;
  turns: number;
}

export type MeetingSource = 'live' | 'recording' | 'upload' | 'paste' | 'sample';

export interface Meeting {
  id: string;
  /** Title typed by the user. Empty means "use the AI title". */
  title: string;
  /** Meeting day, YYYY-MM-DD. Relative due dates ("by Friday") resolve against it. */
  date: string;
  createdAt: string;
  updatedAt: string;
  source: MeetingSource;
  /** Set when the meeting was created from a bundled sample, so reopening it does not duplicate it. */
  sampleId?: string;
  segments: Segment[];
  analysis?: Analysis;
  analyzedWith?: string;
  analyzedAt?: string;
}

export const TONES: Tone[] = ['positive', 'neutral', 'mixed', 'tense', 'negative'];
export const PRIORITIES: Priority[] = ['high', 'medium', 'low'];

export function meetingTitle(m: Pick<Meeting, 'title' | 'analysis'>): string {
  return m.title.trim() || m.analysis?.title || 'Untitled meeting';
}

let counter = 0;
export function uid(prefix = ''): string {
  counter = (counter + 1) % 1e6;
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}${counter.toString(36)}`;
}

/** Local calendar date as YYYY-MM-DD (not UTC, so late-evening meetings keep their day). */
export function isoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parses YYYY-MM-DD as a local date at noon (safe against DST edges). */
export function fromIsoDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12);
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

export function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}
