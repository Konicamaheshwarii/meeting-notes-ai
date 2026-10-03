import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LibraryStore } from '../../core/library/library.store';
import { searchMeetings } from '../../core/library/search';
import { Meeting, formatClock, fromIsoDate, meetingTitle } from '../../core/models';
import { meetingDuration, speakersOf } from '../../core/transcript/transcript';

@Component({
  selector: 'app-library',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="row">
      <h1>Library</h1>
      <span class="chip plain">{{ library.count() }} meeting{{ library.count() === 1 ? '' : 's' }}</span>
      <span class="spacer"></span>
      <a class="btn primary" routerLink="/">New meeting</a>
    </div>
    <label class="search">
      <span class="sr-only">Search meetings</span>
      <input type="search" placeholder="Search titles, notes, people and transcripts" [value]="query()" (input)="query.set($any($event.target).value)" />
    </label>
    @if (library.error()) { <p class="alert" role="alert">{{ library.error() }}</p> }

    @if (!library.loaded()) {
      <p class="row muted" role="status"><span class="spinner" aria-hidden="true"></span> Loading…</p>
    } @else {
      <p class="sr-only" aria-live="polite">{{ hits().length }} results</p>
      <ul class="list">
        @for (h of hits(); track h.meeting.id) {
          <li class="card">
            <a [routerLink]="['/m', h.meeting.id]" class="title">{{ title(h.meeting) }}</a>
            <div class="row muted small">
              <span>{{ date(h.meeting) }}</span>
              <span>{{ duration(h.meeting) }}</span>
              <span>{{ people(h.meeting) }}</span>
              @if (h.meeting.analysis; as a) {
                <span class="chip plain">{{ open(h.meeting) }} open action item{{ open(h.meeting) === 1 ? '' : 's' }}</span>
              } @else {
                <span class="chip plain">No notes yet</span>
              }
            </div>
            @if (h.snippet && query()) {
              <p class="snippet">{{ h.snippet }}</p>
            } @else if (h.meeting.analysis?.tldr) {
              <p class="snippet">{{ h.meeting.analysis?.tldr }}</p>
            }
            <button type="button" class="btn ghost sm danger del" (click)="remove(h.meeting)" [attr.aria-label]="'Delete ' + title(h.meeting)">Delete</button>
          </li>
        } @empty {
          <li class="card empty">
            @if (query()) { No meetings match “{{ query() }}”. }
            @else { No meetings yet. <a routerLink="/">Capture one or open a sample</a>. }
          </li>
        }
      </ul>
      @if (library.count()) {
        <p class="muted small">Meetings are stored in this browser (IndexedDB). Nothing is uploaded.</p>
      }
    }
  `,
  styles: `
    :host { display: grid; gap: 1rem; padding-top: 1rem; }
    h1 { margin: 0; }
    .list { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.75rem; }
    .list > li { position: relative; display: grid; gap: 0.35rem; margin: 0; padding-right: 5.5rem; }
    .title { font-weight: 700; font-size: 1.05rem; color: var(--text); text-decoration: none; }
    .title:hover { color: var(--accent); }
    .title::after { content: ''; position: absolute; inset: 0; border-radius: var(--radius); }
    .title:focus-visible { outline: none; }
    .title:focus-visible::after { outline: 2px solid var(--accent); }
    .snippet { margin: 0; color: var(--muted); font-size: 0.9rem; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .del { position: absolute; top: 0.9rem; right: 0.9rem; z-index: 1; }
    .row { gap: 0.3rem 0.9rem; }
    @media (max-width: 560px) { .list > li { padding-right: 1.25rem; padding-bottom: 3rem; } .del { top: auto; bottom: 0.75rem; } }
  `,
})
export class LibraryPage {
  protected readonly library = inject(LibraryStore);
  protected readonly query = signal('');
  protected readonly hits = computed(() => searchMeetings(this.library.meetings(), this.query()));

  protected title = meetingTitle;
  protected date(m: Meeting): string {
    return fromIsoDate(m.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  protected duration(m: Meeting): string {
    return formatClock(meetingDuration(m.segments));
  }
  protected people(m: Meeting): string {
    const s = speakersOf(m.segments);
    return s.length > 3 ? `${s.slice(0, 3).join(', ')} +${s.length - 3}` : s.join(', ');
  }
  protected open(m: Meeting): number {
    return m.analysis?.actionItems.filter((a) => !a.done).length ?? 0;
  }
  protected remove(m: Meeting): void {
    if (confirm(`Delete "${meetingTitle(m)}"? This cannot be undone.`)) void this.library.remove(m.id);
  }
}
