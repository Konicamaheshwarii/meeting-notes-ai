/** Small text helpers shared by the rule analyzer and the merge step. */

export const STOPWORDS = new Set(`a about above after again against all also am an and any are aren't as at be because been before being
below between both but by can can't cannot could couldn't did didn't do does doesn't doing don't down during each few for from further
get gets got had hadn't has hasn't have haven't having he he'd he'll he's her here here's hers herself him himself his how how's i i'd
i'll i'm i've if in into is isn't it it's its itself just let's like me more most mustn't my myself no nor not now of off on once only or
other ought our ours ourselves out over own really right same she she'd she'll she's should shouldn't so some such than that that's the
their theirs them themselves then there there's these they they'd they'll they're they've this those through to too under until up us
very was wasn't we we'd we'll we're we've were weren't what what's when when's where where's which while who who's whom why why's will
with won't would wouldn't you you'd you'll you're you've your yours yourself yourselves yeah yes okay ok um uh think going know need
want one two thing things lot bit maybe sure actually probably yep good great also mean kind sort pretty still well guess say said see
make per sounds sound look looks gonna got everyone anything something everything someone anyone way time today tomorrow week next last
let lets thanks thank hey hi oh alright cool quick quickly sorry fine done take back come work stuff able already much many even`.split(/\s+/));

export function tokens(text: string): string[] {
  return (text.toLowerCase().replace(/[’']/g, "'").match(/[a-z0-9][a-z0-9'+#.-]*/g) ?? [])
    .map((t) => t.replace(/[.'-]+$/, ''))
    .filter(Boolean);
}

/** Lowercase content words, crudely singularised so "tests" and "test" count together. */
export function contentWords(text: string): string[] {
  return tokens(text)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t) && !/^\d+$/.test(t))
    .map((t) => (t.length > 4 && /[^siu]s$/.test(t) ? t.slice(0, -1) : t));
}

export function jaccard(a: string, b: string): number {
  const x = new Set(contentWords(a));
  const y = new Set(contentWords(b));
  if (!x.size || !y.size) return a.trim().toLowerCase() === b.trim().toLowerCase() ? 1 : 0;
  let inter = 0;
  x.forEach((w) => { if (y.has(w)) inter++; });
  return inter / (x.size + y.size - inter);
}

/** Keeps the first of any group of near-duplicate strings. */
export function dedupe(list: string[], threshold = 0.6): string[] {
  const out: string[] = [];
  for (const item of list) {
    if (!out.some((o) => jaccard(o, item) >= threshold)) out.push(item);
  }
  return out;
}

export function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

const FILLERS = /\b(?:um+|uh+|erm|hmm+|you know|i mean|like i said|basically|honestly|literally)\b,?\s*/gi;
const LEAD_INS = /^(?:(?:so|okay|ok|alright|all right|yeah|yes|right|well|and|but|also|then|cool|great|perfect|sure|oh|hey)\b[,.!]?\s+)+/i;

/** Removes filler words and conversational lead-ins, normalises spacing and capitalises. */
export function tidy(sentence: string): string {
  let s = sentence.replace(FILLERS, '').replace(/\s+/g, ' ').trim();
  s = s.replace(LEAD_INS, '').trim();
  s = s.replace(/\s+([,.!?;:])/g, '$1').replace(/^[,;:\s-]+/, '');
  return capitalize(s);
}

export function ensurePeriod(s: string): string {
  return /[.!?]$/.test(s) ? s : `${s}.`;
}

export function titleCase(s: string): string {
  return s.replace(/\b([a-z])([a-z]*)/g, (w: string, a: string, b: string) => (/^(and|or|of|the|a|an|to|for|in|on)$/.test(w) ? w : a.toUpperCase() + b));
}
