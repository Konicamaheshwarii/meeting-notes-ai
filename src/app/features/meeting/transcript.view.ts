import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { LibraryStore } from '../../core/library/library.store';
import { Meeting, Segment, formatClock } from '../../core/models';
import { renameSpeaker, segmentsToText, speakersOf, talkTime } from '../../core/transcript/transcript';
import { copyText } from '../../shared/files';

interface Part { text: string; hit: boolean }

/** Splits text into plain and matching parts so matches can be wrapped in <mark> without innerHTML. */
export function highlight(text: string, query: string): Part[] {
  const q = query.trim();
  if (!q) return [{ text, hit: false }];
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.split(new RegExp(`(${escaped})`, 'gi')).filter(Boolean)
    .map((t) => ({ text: t, hit: t.toLowerCase() === q.toLowerCase() }));
}

@Component({
  selector: 'app-transcript',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './transcript.view.html',
  styleUrl: './transcript.view.scss',
})
export class TranscriptView {
  private readonly library = inject(LibraryStore);
  readonly meeting = input.required<Meeting>();

  protected readonly clock = formatClock;
  protected readonly query = signal('');
  protected readonly onlyMatches = signal(false);
  protected readonly editing = signal<string | null>(null);
  protected readonly copied = signal(false);

  protected readonly speakers = computed(() => speakersOf(this.meeting().segments));
  protected readonly talk = computed(() => new Map(talkTime(this.meeting().segments).map((t) => [t.speaker, t])));
  protected readonly matches = computed(() => {
    const q = this.query().trim().toLowerCase();
    if (!q) return null;
    return new Set(this.meeting().segments
      .filter((s) => s.text.toLowerCase().includes(q) || s.speaker.toLowerCase().includes(q))
      .map((s) => s.id));
  });
  protected readonly visible = computed(() => {
    const hits = this.matches();
    return hits && this.onlyMatches() ? this.meeting().segments.filter((s) => hits.has(s.id)) : this.meeting().segments;
  });
  protected readonly estimated = computed(() => this.meeting().segments.some((s) => s.estimated));

  protected parts(text: string): Part[] {
    return highlight(text, this.query());
  }

  /** Renames everywhere, including action-item owners, so notes and transcript stay consistent. */
  protected rename(from: string, to: string): void {
    const name = to.trim().replace(/\s+/g, ' ');
    if (!name || name === from) return;
    void this.library.update(this.meeting().id, (m) => ({
      ...m,
      segments: renameSpeaker(m.segments, from, name),
      analysis: m.analysis && {
        ...m.analysis,
        actionItems: m.analysis.actionItems.map((a) => (a.owner === from ? { ...a, owner: name } : a)),
      },
    }));
  }

  private patch(id: string, change: Partial<Segment> | null): void {
    void this.library.update(this.meeting().id, (m) => ({
      ...m,
      segments: change === null ? m.segments.filter((s) => s.id !== id) : m.segments.map((s) => (s.id === id ? { ...s, ...change } : s)),
    }));
  }

  protected setSpeaker(seg: Segment, speaker: string): void {
    this.patch(seg.id, { speaker });
  }

  protected saveText(seg: Segment, text: string): void {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (clean && clean !== seg.text) this.patch(seg.id, { text: clean });
    this.editing.set(null);
  }

  protected remove(seg: Segment): void {
    if (this.meeting().segments.length > 1) this.patch(seg.id, null);
  }

  protected async copy(): Promise<void> {
    this.copied.set(await copyText(segmentsToText(this.meeting().segments)));
    setTimeout(() => this.copied.set(false), 2500);
  }
}
