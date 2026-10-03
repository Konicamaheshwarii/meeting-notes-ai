import { Segment, SpeakerTime, countWords, formatClock, uid } from '../models';

/** Average speaking rate used when a transcript has no timestamps (150 words per minute). */
export const WORDS_PER_SECOND = 2.5;
export const DEFAULT_SPEAKER = 'Speaker 1';

const TIME = String.raw`(?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?`;
const NAME = String.raw`[\p{Lu}\d][\p{L}\d.'’-]*(?:[ \t]+[\p{Lu}\d(][\p{L}\d.'’()-]*){0,3}`;

const CUE = new RegExp(String.raw`^(${TIME})\s*-->\s*(${TIME})`);
const LEADING_TIME = new RegExp(String.raw`^[\[(]?(${TIME})[\])]?\s*(?:[-–—|]\s*)?`);
const VOICE = /^<v(?:\.[^\s>]+)?\s+([^>]+)>(.*)$/;
const NAME_TIME_TEXT = new RegExp(String.raw`^(${NAME})\s*[\[(](${TIME})[\])]\s*:?\s*(.*)$`, 'u');
const NAME_TIME_HEADER = new RegExp(String.raw`^(${NAME})\s+[\[(]?(${TIME})[\])]?$`, 'u');
const NAME_TEXT = new RegExp(String.raw`^(${NAME})\s*:\s*(.*)$`, 'u');
/** Words that look like "Label:" but are not speakers. */
const NOT_NAMES = /^(note|notes|re|fyi|update|agenda|action items?|todo|tl;?dr|summary|http|https|step \d+|item \d+)$/i;

/** "1:02:03.5" -> 3723.5, "12:05" -> 725. */
export function parseTime(text: string): number | null {
  const m = text.trim().match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?$/);
  if (!m) return null;
  const [, h, min, s, frac] = m;
  return Number(h ?? 0) * 3600 + Number(min) * 60 + Number(s) + (frac ? Number(`0.${frac}`) : 0);
}

interface Draft {
  speaker: string | null;
  start: number | null;
  end?: number;
  lines: string[];
}

const cleanText = (s: string) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

function speakerName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (name.length > 40 || NOT_NAMES.test(name)) return null;
  return name;
}

/**
 * Parses pasted or uploaded transcripts. Understands:
 * - "Name: text" speaker lines, with optional leading "[00:12]" / "00:01:23" timestamps
 * - "Name (00:12): text" and Zoom/Teams style "Name  00:12" header lines followed by text
 * - WebVTT / SRT cues (including <v Name> voice tags)
 * - plain paragraphs (one speaker, times estimated from word count)
 */
export function parseTranscript(input: string): Segment[] {
  const drafts: Draft[] = [];
  let current = null as Draft | null;
  let lastSpeaker: string | null = null;
  let paragraphBreak = false;

  const open = (speaker: string | null, start: number | null, end?: number) => {
    if (current && current.lines.length) drafts.push(current);
    current = { speaker: speaker ?? lastSpeaker, start, end, lines: [] };
    if (speaker) lastSpeaker = speaker;
    paragraphBreak = false;
  };
  const addText = (text: string) => {
    const t = cleanText(text);
    if (t) current!.lines.push(t);
  };

  const lines = input.replace(/^﻿/, '').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line) { paragraphBreak = true; continue; }
    if (/^WEBVTT\b/.test(line) || /^(NOTE|STYLE|REGION)\b/.test(line) && i < 3) continue;
    // SRT cue numbers sit on their own line just above the "-->" line.
    if (/^\d+$/.test(line) && CUE.test(lines[i + 1]?.trim() ?? '')) continue;

    const cue = line.match(CUE);
    if (cue) {
      open(null, parseTime(cue[1].replace(',', '.')), parseTime(cue[2].replace(',', '.')) ?? undefined);
      continue;
    }

    let time: number | null = null;
    const lead = line.match(LEADING_TIME);
    if (lead) {
      time = parseTime(lead[1].replace(',', '.'));
      line = line.slice(lead[0].length).trim();
    }

    const voice = line.match(VOICE);
    if (voice) {
      const name = speakerName(voice[1]);
      if (current && !current.lines.length && time === null) {
        current.speaker = name;
        if (name) lastSpeaker = name;
      } else {
        open(name, time);
      }
      addText(voice[2]);
      continue;
    }

    const nameTime = line.match(NAME_TIME_TEXT);
    const header = !nameTime ? line.match(NAME_TIME_HEADER) : null;
    const named = !nameTime && !header ? line.match(NAME_TEXT) : null;

    if (nameTime && speakerName(nameTime[1])) {
      open(speakerName(nameTime[1]), parseTime(nameTime[2].replace(',', '.')));
      addText(nameTime[3]);
    } else if (header && speakerName(header[1])) {
      open(speakerName(header[1]), parseTime(header[2].replace(',', '.')));
    } else if (named && speakerName(named[1]) && !/^\d+$/.test(named[1])) {
      open(speakerName(named[1]), time);
      addText(named[2]);
    } else if (time !== null) {
      open(null, time);
      addText(line);
    } else {
      if (!current || paragraphBreak) open(null, null);
      addText(line);
    }
    paragraphBreak = false;
  }
  if (current && current.lines.length) drafts.push(current);

  const segments: Segment[] = [];
  for (const d of drafts) {
    const text = d.lines.join(' ');
    if (!text) continue;
    const prev = segments[segments.length - 1];
    const estimatedStart = prev ? (prev.end ?? prev.start + countWords(prev.text) / WORDS_PER_SECOND) : 0;
    segments.push({
      id: uid('s'),
      start: d.start ?? Math.round(estimatedStart * 10) / 10,
      ...(d.end !== undefined ? { end: d.end } : {}),
      speaker: d.speaker ?? DEFAULT_SPEAKER,
      text,
      ...(d.start === null ? { estimated: true } : {}),
    });
  }
  return segments;
}

/** "[m:ss] Speaker: text" lines; the format prompts and copy-paste use. */
export function segmentsToText(segments: Segment[]): string {
  return segments.map((s) => `[${formatClock(s.start)}] ${s.speaker}: ${s.text}`).join('\n');
}

export function speakersOf(segments: Segment[]): string[] {
  return [...new Set(segments.map((s) => s.speaker))];
}

/** Renames a speaker everywhere. Renaming onto an existing name merges the two. */
export function renameSpeaker(segments: Segment[], from: string, to: string): Segment[] {
  const name = to.trim().replace(/\s+/g, ' ');
  if (!name || name === from) return segments;
  return segments.map((s) => (s.speaker === from ? { ...s, speaker: name } : s));
}

function spokenSeconds(seg: Segment, next: Segment | undefined): number {
  const estimate = countWords(seg.text) / WORDS_PER_SECOND;
  if (seg.end !== undefined && seg.end > seg.start) return seg.end - seg.start;
  if (!next) return estimate;
  const gap = next.start - seg.start;
  // A gap far longer than the words need is silence or a break, not talking.
  return gap > 0 && gap <= estimate * 2 + 10 ? gap : estimate;
}

/** Per-speaker talk time, computed locally from timestamps (or word counts when there are none). */
export function talkTime(segments: Segment[]): SpeakerTime[] {
  const map = new Map<string, SpeakerTime>();
  segments.forEach((seg, i) => {
    const row = map.get(seg.speaker) ?? { speaker: seg.speaker, seconds: 0, words: 0, share: 0, turns: 0 };
    row.seconds += spokenSeconds(seg, segments[i + 1]);
    row.words += countWords(seg.text);
    const prev = segments[i - 1];
    if (!prev || prev.speaker !== seg.speaker) row.turns++;
    map.set(seg.speaker, row);
  });
  const rows = [...map.values()];
  const total = rows.reduce((sum, r) => sum + r.seconds, 0);
  return rows
    .map((r) => ({ ...r, seconds: Math.round(r.seconds), share: total ? r.seconds / total : 0 }))
    .sort((a, b) => b.seconds - a.seconds);
}

export function meetingDuration(segments: Segment[]): number {
  const last = segments[segments.length - 1];
  if (!last) return 0;
  return Math.round(last.end ?? last.start + countWords(last.text) / WORDS_PER_SECOND);
}

/** Splits text into sentences, keeping the terminal punctuation. */
export function splitSentences(text: string): string[] {
  return (text.match(/(?:[^.!?]|\.(?=\d))+(?:[.!?]+["')\]]*|$)/g) ?? [])
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Groups segments into chunks whose "[m:ss] Speaker: text" form stays under maxChars.
 * Segments are never reordered; a single oversized segment is split at sentence boundaries.
 */
export function chunkSegments(segments: Segment[], maxChars: number): Segment[][] {
  const lineLength = (s: Segment) => `[${formatClock(s.start)}] ${s.speaker}: ${s.text}`.length + 1;
  const pieces: Segment[] = [];
  for (const seg of segments) {
    if (lineLength(seg) <= maxChars) { pieces.push(seg); continue; }
    let buffer = '';
    let part = 0;
    const flush = () => {
      if (buffer) pieces.push({ ...seg, id: `${seg.id}-${part++}`, text: buffer.trim() });
      buffer = '';
    };
    for (const sentence of splitSentences(seg.text)) {
      if (buffer && lineLength({ ...seg, text: `${buffer} ${sentence}` }) > maxChars) flush();
      buffer = buffer ? `${buffer} ${sentence}` : sentence;
    }
    flush();
  }

  const chunks: Segment[][] = [];
  let chunk: Segment[] = [];
  let size = 0;
  for (const piece of pieces) {
    const len = lineLength(piece);
    if (chunk.length && size + len > maxChars) {
      chunks.push(chunk);
      chunk = [];
      size = 0;
    }
    chunk.push(piece);
    size += len;
  }
  if (chunk.length) chunks.push(chunk);
  return chunks;
}
