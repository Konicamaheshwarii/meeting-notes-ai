import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AnalyzeService } from '../../core/analysis/analyze.service';
import { actionItemsToCsv, actionItemsToIcs, meetingToMarkdown, slug } from '../../core/export/exporters';
import { LibraryStore } from '../../core/library/library.store';
import { ActionItem, Meeting, PRIORITIES, Priority, formatClock, fromIsoDate, meetingTitle } from '../../core/models';
import { SettingsStore } from '../../core/settings.store';
import { speakersOf, talkTime } from '../../core/transcript/transcript';
import { copyText, download } from '../../shared/files';

@Component({
  selector: 'app-notes',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './notes.view.html',
  styleUrl: './notes.view.scss',
})
export class NotesView {
  private readonly library = inject(LibraryStore);
  protected readonly analyzer = inject(AnalyzeService);
  protected readonly settings = inject(SettingsStore);

  readonly meeting = input.required<Meeting>();

  protected readonly priorities = PRIORITIES;
  protected readonly clock = formatClock;
  protected readonly analysis = computed(() => this.meeting().analysis);
  protected readonly run = computed(() => {
    const r = this.analyzer.running();
    return r?.meetingId === this.meeting().id ? r.progress : null;
  });
  protected readonly percent = computed(() => {
    const p = this.run();
    if (!p) return 0;
    const within = p.received ? Math.min(0.9, p.received / 1500) : 0.05;
    return Math.round(((Math.max(0, p.step - 1) + within) / p.total) * 100);
  });
  protected readonly error = computed(() => {
    const e = this.analyzer.error();
    return e?.meetingId === this.meeting().id ? e.message : '';
  });
  protected readonly speakers = computed(() => speakersOf(this.meeting().segments));
  protected readonly talk = computed(() => talkTime(this.meeting().segments));
  protected readonly done = computed(() => this.analysis()?.actionItems.filter((a) => a.done).length ?? 0);
  protected readonly dated = computed(() => this.analysis()?.actionItems.filter((a) => a.due).length ?? 0);

  protected readonly editing = signal<string | null>(null);
  protected readonly toast = signal('');
  private toastTimer?: ReturnType<typeof setTimeout>;

  protected analyze(): void {
    void this.analyzer.analyze(this.meeting().id);
  }

  protected toggle(item: ActionItem, done: boolean): void {
    void this.library.updateActionItem(this.meeting().id, item.id, { done });
  }

  protected save(item: ActionItem, task: string, owner: string, due: string, priority: string): void {
    if (!task.trim()) return;
    void this.library.updateActionItem(this.meeting().id, item.id, {
      task: task.trim(),
      owner: owner.trim() || undefined,
      due: /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : undefined,
      priority: (PRIORITIES.includes(priority as Priority) ? priority : 'medium') as Priority,
    });
    this.editing.set(null);
  }

  protected removeItem(item: ActionItem): void {
    void this.library.updateActionItem(this.meeting().id, item.id, null);
    this.editing.set(null);
  }

  protected addItem(input: HTMLInputElement): void {
    const task = input.value.trim();
    if (!task) return;
    void this.library.addActionItem(this.meeting().id, task);
    input.value = '';
  }

  protected dueLabel(iso: string): string {
    return fromIsoDate(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  protected overdue(item: ActionItem): boolean {
    if (!item.due || item.done) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return fromIsoDate(item.due) < today;
  }

  private base(): string {
    return slug(`${this.meeting().date} ${meetingTitle(this.meeting())}`);
  }

  protected async copyMarkdown(): Promise<void> {
    const ok = await copyText(meetingToMarkdown(this.meeting()));
    this.flash(ok ? 'Notes copied as Markdown.' : 'Copy failed. Use Download .md instead.');
  }

  protected downloadMarkdown(): void {
    download(`${this.base()}.md`, meetingToMarkdown(this.meeting(), { includeTranscript: true }), 'text/markdown;charset=utf-8');
  }

  protected downloadIcs(): void {
    const items = this.analysis()?.actionItems ?? [];
    if (!items.some((a) => a.due)) {
      this.flash('No action items have a due date yet. Edit an item to add one.');
      return;
    }
    download(`${this.base()}-action-items.ics`, actionItemsToIcs(this.meeting(), items), 'text/calendar;charset=utf-8');
    const skipped = items.filter((a) => !a.due).length;
    this.flash(`Calendar file saved with ${items.length - skipped} item${items.length - skipped === 1 ? '' : 's'}${skipped ? ` (${skipped} without a date skipped)` : ''}.`);
  }

  protected downloadCsv(): void {
    download(`${this.base()}-action-items.csv`, actionItemsToCsv(this.meeting(), this.analysis()?.actionItems ?? []), 'text/csv;charset=utf-8');
  }

  private flash(message: string): void {
    this.toast.set(message);
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.set(''), 4000);
  }
}
