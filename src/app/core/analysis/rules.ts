import { ActionItem, Analysis, Priority, Segment, Tone, fromIsoDate, uid } from '../models';
import { speakersOf, splitSentences } from '../transcript/transcript';
import { resolveDue } from './dates';
import { capitalize, contentWords, dedupe, ensurePeriod, jaccard, tidy, titleCase } from './text';

/**
 * Offline analyzer used in Demo mode. It is deliberately transparent: every item it produces
 * comes from a recognisable phrase in the transcript ("I'll ...", "can you ...", "let's go with ...").
 */

interface Sentence {
  speaker: string;
  text: string;
  /** Index of the segment the sentence came from. */
  seg: number;
  /** Position in the whole transcript. */
  pos: number;
}

interface Candidate {
  task: string;
  owner?: string;
  sentence: Sentence;
  /** A later sentence that confirmed the item and may carry its due date. */
  dueFrom?: string;
}

const SELF_COMMIT = /\b(?:i'll|i will|i'm going to|i am going to|i can take|i'll take|i'm happy to|i'll go ahead and|let me)\s+(.+)$/i;
const SELF_STOP = /^(?:be\b|say\b|just say|admit|tell you|bet\b|pass\b|stop\b|see you|talk to you|leave it|hand it|let it|know\b|think\b|start by|recap|summari[sz]e|share my screen|jump in|kick (?:us|it|things) off|go first|keep it short|be quick)/i;
const REQUEST = /\b(?:can|could|would|will) you(?: please)?(?: also)?\s+(.+?)\??$/i;
const REQUEST_STOP = /^(?:hear|see my|see the|repeat|say that|remind me|explain|clarify|tell me|walk me|give me a (?:sec|second|minute)|believe|imagine|share your screen|speak up|mute|unmute|go back|scroll)/i;
const SOMEONE = /\b(?:(?:can|could) (?:someone|somebody|anyone)|does (?:someone|anyone) want to|who (?:can|wants to))\s+(.+?)\??$/i;
const TEAM_NEED = /\b(?:we(?: also| really)? need to|we have to|we must|we've got to|we gotta|someone needs to|somebody needs to|someone should|we need someone to|don't forget to|make sure (?:to|we|that we))\s+(.+)$/i;
const TEAM_STOP = /^(?:be (?:careful|fine|good|ok|okay)|talk about|think about it)/i;
const EXPLICIT = /^(?:action items?|todo|to-do|follow[- ]up)\s*[:\-]\s*(.+)$/i;
const PLEASE = /^(\p{Lu}[\p{L}'-]+),?\s+please\s+(.+)$/u;
const PRONOUN_TASK = /^(?:that|it|this|this one|that one|care of (?:that|it)|ownership of (?:that|it)|it on|that on)\.?$/i;
const DECISION = /\b(?:we(?:'ve| have)? decided|the decision is|decision:|let's go with|we'll go with|we're going (?:to go )?with|we are going with|we(?: all)? agreed|we agree(?:d)? (?:to|on|that)|it's settled|final call|we'll stick with|let's stick with|let's keep|let's drop|let's cut|let's move|let's ship|let's push|let's postpone|let's not|we're not going to|we won't|agreed[,:]|so the plan is|going forward,? we)\b/i;
const OPEN_MARKER = /\b(?:open question|still (?:need|have) to (?:figure out|decide|confirm)|not sure (?:yet )?(?:if|whether|how|what|who|when)|we don't know (?:yet )?(?:if|whether|how|who)|tbd|to be decided|parking lot|haven't decided|no decision (?:yet|on)|unclear (?:if|whether|how|who)|need to find out)\b/i;
const OPEN_QUESTION = /\b(?:should we|do we|how do we|how are we|what about|who(?:'s| is) going to|who owns|whether|what happens|are we going to|what if|when do we|is it worth|which one)\b/i;
const RHETORICAL = /^(?:right|okay|ok|make sense|makes sense|sound good|sounds good|does that work|any questions|good|yeah|anything else|all good|cool)\b/i;
const HIGH = /\b(?:urgent|asap|as soon as possible|critical|blocker|blocking|top priority|highest priority|immediately|p0|p1|before (?:the )?(?:release|launch|demo)|hotfix)\b/i;
const LOW = /\b(?:when you (?:get|have) a (?:chance|minute)|nice to have|no rush|eventually|low priority|at some point|if (?:there's|we have) time|someday)\b/i;
const CUT_AT = /,?\s(?:because|since|but|so|otherwise|which means|and then we|if that's ok|if that's okay|if you can)\b.*$/i;

const POSITIVE = new Set('great good love excited nice happy awesome perfect glad thanks agree solid progress ahead win impressed smooth easy clear helpful works working fixed shipped improved faster better beautiful excellent fantastic confident appreciate'.split(' '));
const NEGATIVE = new Set('problem issue issues concern concerns concerned worried worry risk risky blocker blocked delay delayed late bug bugs broken fail failed failing frustrated frustrating unhappy angry disappointed outage unacceptable slip slipped behind pressure tight worse slow hard difficult confusing complaint complaints churn incident down'.split(' '));
const TENSION = /\b(?:frustrat\w*|unacceptable|angry|disappointed|escalat\w*|again|third time|not okay|not ok|upset|blame)\b/i;

const MEETING_TYPES: [RegExp, string][] = [
  [/\bsprint\b.*\bplanning\b|\bplanning\b.*\bsprint\b|\bsprint \d+\b/i, 'Sprint planning'],
  [/\bretro(?:spective)?\b|\bpost-?mortem\b|\bincident\b/i, 'Incident review'],
  [/\bstand-?up\b/i, 'Stand-up'],
  [/\bclient\b|\bproposal\b|\bstatement of work\b|\bsow\b|\bquote\b|\bcontract\b/i, 'Client call'],
  [/\binterview\b|\bcandidate\b/i, 'Interview debrief'],
  [/\bdesign review\b|\bmockups?\b|\bwireframes?\b/i, 'Design review'],
  [/\broadmap\b|\bquarter\b|\bokrs?\b/i, 'Roadmap planning'],
];

function sentencesOf(segments: Segment[]): Sentence[] {
  const out: Sentence[] = [];
  segments.forEach((s, seg) => {
    for (const text of splitSentences(s.text)) out.push({ speaker: s.speaker, text, seg, pos: out.length });
  });
  return out;
}

/** Maps first names (and full names) to the speaker label, so "Priya, can you..." finds "Priya Nair". */
function nameIndex(speakers: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const s of speakers) {
    if (/^speaker \d+$/i.test(s)) continue;
    map.set(s.toLowerCase(), s);
    const first = s.split(/\s+/)[0].toLowerCase();
    if (first.length > 1 && !map.has(first)) map.set(first, s);
  }
  return map;
}

function mentioned(text: string, names: Map<string, string>, except?: string): string | undefined {
  for (const word of text.match(/\p{Lu}[\p{L}'-]+/gu) ?? []) {
    const hit = names.get(word.toLowerCase());
    if (hit && hit !== except) return hit;
  }
  return undefined;
}

function cleanTask(raw: string, duePhrase?: string): string {
  let t = raw;
  if (duePhrase) t = t.replace(duePhrase, ' ').replace(/\s+,/g, ',');
  t = t.replace(CUT_AT, '')
    .replace(/^(send|get|give|forward|email|show)\s+(?:us|you|me|them)\s+(?=\S+\s)/i, '$1 ')
    .replace(/^own getting\s+/i, 'get ')
    .replace(new RegExp(String.raw`[,\s]*(?:${HIGH.source}|${LOW.source})`, 'gi'), ' ')
    .replace(/^(?:also|then|just|probably|quickly|go ahead and|please|try to|make sure to|definitely|first)\s+/i, '')
    .replace(/[,\s]+(?:okay|ok|right|please|for me|for us|as well|too|then|first|yeah|also)\s*[?.!]*$/i, '')
    .replace(/\s+/g, ' ')
    .replace(/[\s,;:?.!-]+$/, '')
    .trim();
  return capitalize(t);
}

function priorityOf(text: string, due: string | undefined, meetingDate: Date): Priority {
  if (HIGH.test(text)) return 'high';
  if (due) {
    const days = (fromIsoDate(due).getTime() - meetingDate.getTime()) / 86_400_000;
    if (days <= 2) return 'high';
  }
  return LOW.test(text) ? 'low' : 'medium';
}

const isGeneric = (speaker: string) => /^speaker \d+$/i.test(speaker);

/** "I can take that." / "I'll mock that up this week." only make sense as a reply to an earlier item. */
function isPronounTask(task: string): boolean {
  const bare = task.replace(/[.!]$/, '').trim();
  if (PRONOUN_TASK.test(bare)) return true;
  const withoutDate = bare.replace(/\s*\b(?:by|before|on|until)?\s*(?:the\s+)?(?:end of )?(?:this|next|today|tomorrow|tonight)\b.*$/i, '').trim();
  return withoutDate.split(/\s+/).length <= 4 && /\b(?:that|it|this|those|them)\b/i.test(withoutDate);
}

function findActionCandidates(sentences: Sentence[], segments: Segment[], names: Map<string, string>): Candidate[] {
  const out: Candidate[] = [];
  for (const s of sentences) {
    const text = tidy(s.text);
    let m: RegExpMatchArray | null;

    if ((m = text.match(EXPLICIT))) {
      out.push({ task: m[1], owner: mentioned(m[1], names), sentence: s });
    } else if ((m = text.match(PLEASE)) && names.has(m[1].toLowerCase())) {
      out.push({ task: m[2], owner: names.get(m[1].toLowerCase()), sentence: s });
    } else if ((m = text.match(SOMEONE))) {
      // Ownerless until someone answers "I can take that".
      out.push({ task: m[1], sentence: s });
    } else if ((m = text.match(REQUEST)) && !REQUEST_STOP.test(m[1])) {
      // "Priya, can you ..." names the owner; otherwise whoever speaks next usually takes it.
      const next = segments.slice(s.seg + 1).find((x) => x.speaker !== s.speaker)?.speaker;
      const owner = mentioned(text, names, s.speaker) ?? (next && !isGeneric(next) ? next : undefined);
      out.push({ task: m[1], owner, sentence: s });
    } else if ((m = text.match(SELF_COMMIT)) && !SELF_STOP.test(m[1]) && !text.endsWith('?')) {
      const task = m[1].trim();
      if (isPronounTask(task)) {
        // Claims the most recent item that is unowned or already asked of this speaker.
        const claimed = [...out].reverse().find((c) => s.pos - c.sentence.pos <= 4 && (!c.owner || c.owner === s.speaker));
        if (claimed && !isGeneric(s.speaker)) claimed.owner = s.speaker;
        // "I can take that. Done by tomorrow." - the date may follow in the next short sentence.
        const next = sentences[s.pos + 1];
        const follow = next && next.speaker === s.speaker && next.text.split(/\s+/).length <= 12 ? ` ${next.text}` : '';
        if (claimed) claimed.dueFrom ??= s.text + follow;
        continue;
      }
      out.push({ task, owner: isGeneric(s.speaker) ? undefined : s.speaker, sentence: s });
    } else if ((m = text.match(TEAM_NEED)) && !TEAM_STOP.test(m[1]) && !text.endsWith('?')) {
      out.push({ task: m[1], owner: mentioned(m[1], names, undefined), sentence: s });
    } else {
      // "Dev will handle the migration." / "Sam is going to update the test plan."
      for (const [first, full] of names) {
        const escaped = first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(String.raw`\b${escaped}(?: is going to| will|'ll| to)\s+(.+)$`, 'i');
        const hit = text.match(re);
        if (hit && !/^(be|have|probably be)\b/i.test(hit[1])) {
          out.push({ task: hit[1], owner: full, sentence: s });
          break;
        }
      }
    }
  }
  return out;
}

export function extractActionItems(segments: Segment[], meetingDate: Date): ActionItem[] {
  const sentences = sentencesOf(segments);
  const names = nameIndex(speakersOf(segments));
  const items: ActionItem[] = [];

  for (const c of findActionCandidates(sentences, segments, names)) {
    let due = resolveDue(c.sentence.text, meetingDate);
    let context = c.sentence.text;
    if (!due && c.dueFrom) {
      due = resolveDue(c.dueFrom, meetingDate);
      context += ` ${c.dueFrom}`;
    }
    if (!due) {
      // "I'll draft it. Should be done by Thursday." puts the date in the next short sentence.
      const next = sentences[c.sentence.pos + 1];
      if (next && next.speaker === c.sentence.speaker && next.text.split(/\s+/).length <= 12) {
        due = resolveDue(next.text, meetingDate);
        if (due) context += ` ${next.text}`;
      }
    }
    const task = cleanTask(c.task, due && c.task.includes(due.phrase) ? due.phrase : undefined);
    if (task.split(/\s+/).length < 2 || task.length > 180) continue;

    const dup = items.find((i) => jaccard(i.task, task) >= 0.6);
    if (dup) {
      dup.owner ??= c.owner;
      dup.due ??= due?.date;
      continue;
    }
    items.push({
      id: uid('a'),
      task,
      ...(c.owner ? { owner: c.owner } : {}),
      ...(due ? { due: due.date } : {}),
      priority: priorityOf(context, due?.date, meetingDate),
      done: false,
    });
  }
  return items;
}


export function extractDecisions(segments: Segment[]): string[] {
  const found = sentencesOf(segments)
    .filter((s) => DECISION.test(s.text) && !s.text.trim().endsWith('?'))
    .map((s) => ensurePeriod(tidy(s.text)))
    .filter((s) => s.split(/\s+/).length >= 4);
  return dedupe(found).slice(0, 8);
}

export function extractOpenQuestions(segments: Segment[]): string[] {
  const scored = sentencesOf(segments)
    .map((s) => {
      const text = tidy(s.text);
      const words = text.split(/\s+/).length;
      let score = 0;
      if (OPEN_MARKER.test(text)) score += 2;
      if (text.endsWith('?') && words >= 5 && !RHETORICAL.test(text) && !REQUEST.test(text)) {
        score += OPEN_QUESTION.test(text) ? 1.5 : 0.5;
      }
      return { text, score, pos: s.pos };
    })
    .filter((x) => x.score >= 1.5);
  const top = scored.sort((a, b) => b.score - a.score || a.pos - b.pos).slice(0, 6).sort((a, b) => a.pos - b.pos);
  return dedupe(top.map((x) => ensurePeriodQ(x.text))).slice(0, 5);
}

const ensurePeriodQ = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);

/** Frequency-based sentence scores: sentences dense in the meeting's recurring words rank highest. */
function scoreSentences(sentences: Sentence[]): { s: Sentence; text: string; score: number }[] {
  const freq = new Map<string, number>();
  for (const s of sentences) for (const w of new Set(contentWords(s.text))) freq.set(w, (freq.get(w) ?? 0) + 1);
  return sentences.map((s) => {
    const text = tidy(s.text);
    const words = text.split(/\s+/).length;
    const unique = [...new Set(contentWords(text))];
    let score = unique.reduce((sum, w) => sum + Math.log(1 + (freq.get(w) ?? 0)), 0) / Math.sqrt(Math.max(words, 1));
    if (/\d/.test(text)) score *= 1.15;
    if (DECISION.test(text)) score *= 1.25;
    if (text.endsWith('?')) score *= 0.4;
    if (words < 7 || words > 45) score *= 0.3;
    if (/^(?:i think|i guess|i mean|i feel)\b/i.test(text)) score *= 0.85;
    if (/^(?:it|that|this|they|or|we keep|i'll|i will)\b/i.test(text)) score *= 0.65;
    return { s, text, score };
  });
}

function topSentences(sentences: Sentence[], n: number): string[] {
  const ranked = scoreSentences(sentences).sort((a, b) => b.score - a.score);
  const chosen: typeof ranked = [];
  for (const r of ranked) {
    if (chosen.length >= n || r.score <= 0) break;
    // Questions and fragments ("Thanks for joining.") make poor summary lines.
    if (r.text.endsWith('?') || r.text.split(/\s+/).length < 6) continue;
    if (chosen.some((c) => jaccard(c.text, r.text) > 0.35)) continue;
    chosen.push(r);
  }
  return chosen.sort((a, b) => a.s.pos - b.s.pos).map((c) => ensurePeriod(c.text));
}

export function extractiveSummary(segments: Segment[], sentencesWanted = 2): string {
  return topSentences(sentencesOf(segments), sentencesWanted).join(' ');
}

export function keyPoints(segments: Segment[], n = 6): string[] {
  return topSentences(sentencesOf(segments), n);
}

/** Most repeated content words and two-word phrases, for the title. */
export function topics(segments: Segment[], n = 2): string[] {
  const names = new Set(speakersOf(segments).flatMap((s) => s.toLowerCase().split(/\s+/)));
  const generic = new Set(['meeting', 'call', 'sprint', 'planning', 'team', 'today', 'week', 'point', 'idea', 'question', 'plan', 'part', 'start', 'end', 'day', 'call', 'minute', 'people', 'side', 'stuff', 'number']);
  const unigrams = new Map<string, number>();
  const bigrams = new Map<string, number>();
  for (const seg of segments) {
    const words = contentWords(seg.text).filter((w) => !names.has(w) && !generic.has(w));
    words.forEach((w, i) => {
      unigrams.set(w, (unigrams.get(w) ?? 0) + 1);
      if (i > 0) bigrams.set(`${words[i - 1]} ${w}`, (bigrams.get(`${words[i - 1]} ${w}`) ?? 0) + 1);
    });
  }
  const phrases = [...bigrams].filter(([, c]) => c >= 3).sort((a, b) => b[1] - a[1]).map(([p]) => p);
  const singles = [...unigrams].sort((a, b) => b[1] - a[1]).map(([w]) => w);
  const out: string[] = [];
  for (const p of [...phrases.slice(0, 1), ...singles]) {
    if (out.length >= n) break;
    if (!out.some((o) => o.includes(p) || p.includes(o))) out.push(p);
  }
  return out;
}

export function ruleTitle(segments: Segment[]): string {
  const all = segments.map((s) => s.text).join(' ');
  const type = MEETING_TYPES.find(([re]) => re.test(all))?.[1] ?? 'Meeting';
  const t = topics(segments);
  return t.length ? `${type}: ${titleCase(t.join(' and '))}` : type;
}

export function ruleSentiment(segments: Segment[]): Analysis['sentiment'] {
  let pos = 0;
  let neg = 0;
  let tension = 0;
  const worried = new Map<string, number>();
  for (const s of sentencesOf(segments)) {
    const words = s.text.toLowerCase().match(/[a-z']+/g) ?? [];
    const p = words.filter((w) => POSITIVE.has(w)).length;
    const n = words.filter((w) => NEGATIVE.has(w)).length;
    pos += p;
    neg += n;
    if (TENSION.test(s.text)) tension++;
    if (n > p) worried.set(s.speaker, (worried.get(s.speaker) ?? 0) + n - p);
  }
  const total = pos + neg;
  const ratio = total ? (pos - neg) / total : 0;
  const tone: Tone =
    tension >= 3 ? 'tense'
    : total < 4 ? 'neutral'
    : ratio > 0.3 ? 'positive'
    : ratio < -0.3 ? (tension >= 1 ? 'tense' : 'negative')
    : 'mixed';
  const mood = {
    positive: 'Mostly upbeat and constructive',
    neutral: 'Calm and matter-of-fact',
    mixed: 'Constructive, with real concerns on the table',
    tense: 'Tense at points',
    negative: 'Mostly concerned',
  }[tone];
  const [top] = [...worried].sort((a, b) => b[1] - a[1]);
  const who = top && !/^speaker \d+$/i.test(top[0]) ? ` Most concerns came from ${top[0]}.` : '';
  return { tone, note: `${mood}: ${pos} positive and ${neg} negative cues.${who}` };
}


/** Full offline analysis of one transcript (or one chunk of it). */
export function ruleAnalyze(segments: Segment[], meetingDate: string): Analysis {
  const date = fromIsoDate(meetingDate);
  return {
    title: ruleTitle(segments),
    tldr: extractiveSummary(segments, 2),
    keyPoints: keyPoints(segments, 6),
    decisions: extractDecisions(segments),
    actionItems: extractActionItems(segments, date),
    openQuestions: extractOpenQuestions(segments),
    sentiment: ruleSentiment(segments),
  };
}
