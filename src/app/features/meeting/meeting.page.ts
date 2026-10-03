import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AnalyzeService } from '../../core/analysis/analyze.service';
import { LibraryStore } from '../../core/library/library.store';
import { formatClock, fromIsoDate, meetingTitle } from '../../core/models';
import { meetingDuration, speakersOf } from '../../core/transcript/transcript';
import { NotesView } from './notes.view';
import { TranscriptView } from './transcript.view';

const SOURCE_LABEL = { live: 'Live captions', recording: 'Recording', upload: 'Upload', paste: 'Pasted', sample: 'Sample' } as const;

@Component({
  selector: 'app-meeting',
  imports: [RouterLink, NotesView, TranscriptView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './meeting.page.html',
  styleUrl: './meeting.page.scss',
})
export class MeetingPage {
  private readonly library = inject(LibraryStore);
  private readonly analyzer = inject(AnalyzeService);
  private readonly router = inject(Router);

  readonly id = input.required<string>();
  /** `?analyze=1` starts the analysis once, right after the meeting was captured. */
  readonly analyze = input<string>();

  protected readonly loaded = this.library.loaded;
  protected readonly meeting = computed(() => this.library.meetings().find((m) => m.id === this.id()));
  protected readonly view = signal<'notes' | 'transcript'>('notes');
  protected readonly title = computed(() => (this.meeting() ? meetingTitle(this.meeting()!) : ''));
  protected readonly facts = computed(() => {
    const m = this.meeting();
    if (!m) return null;
    return {
      date: fromIsoDate(m.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
      duration: formatClock(meetingDuration(m.segments)),
      speakers: speakersOf(m.segments).length,
      source: SOURCE_LABEL[m.source],
    };
  });
  private started = false;

  constructor() {
    effect(() => {
      const m = this.meeting();
      if (this.started || !this.loaded() || !m || this.analyze() !== '1') return;
      this.started = true;
      if (!m.analysis && this.analyzer.running()?.meetingId !== m.id) void this.analyzer.analyze(m.id);
      void this.router.navigate([], { queryParams: {}, replaceUrl: true });
    });
  }

  protected rename(value: string): void {
    const m = this.meeting();
    const title = value.trim();
    if (!m || title === meetingTitle(m)) return;
    void this.library.update(m.id, (x) => ({ ...x, title }));
  }

  protected setDate(value: string): void {
    const m = this.meeting();
    if (m && /^\d{4}-\d{2}-\d{2}$/.test(value)) void this.library.update(m.id, (x) => ({ ...x, date: value }));
  }

  protected async remove(): Promise<void> {
    const m = this.meeting();
    if (!m || !confirm(`Delete "${meetingTitle(m)}"? This cannot be undone.`)) return;
    if (this.analyzer.running()?.meetingId === m.id) this.analyzer.cancel();
    await this.library.remove(m.id);
    await this.router.navigate(['/library']);
  }
}
