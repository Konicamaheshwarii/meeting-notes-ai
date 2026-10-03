import { Injectable, InjectionToken, computed, inject, signal } from '@angular/core';
import { ActionItem, Analysis, Meeting, MeetingSource, Segment, isoDate, uid } from '../models';
import { MeetingBackend, browserBackend } from './backends';

export const MEETING_BACKEND = new InjectionToken<MeetingBackend>('MEETING_BACKEND', {
  providedIn: 'root',
  factory: browserBackend,
});

export interface NewMeeting {
  title?: string;
  date?: string;
  source: MeetingSource;
  sampleId?: string;
  segments: Segment[];
}

/** All saved meetings as a signal, persisted to IndexedDB on every change. */
@Injectable({ providedIn: 'root' })
export class LibraryStore {
  private readonly backend = inject(MEETING_BACKEND);
  private readonly state = signal<Meeting[]>([]);

  readonly meetings = this.state.asReadonly();
  readonly loaded = signal(false);
  readonly error = signal('');
  readonly count = computed(() => this.state().length);
  readonly ready: Promise<void>;

  constructor() {
    this.ready = this.backend.all()
      .then((list) => this.state.set(list))
      .catch((e) => this.error.set((e as Error).message))
      .finally(() => this.loaded.set(true));
  }

  get(id: string): Meeting | undefined {
    return this.state().find((m) => m.id === id);
  }

  async create(input: NewMeeting): Promise<Meeting> {
    await this.ready;
    const now = new Date().toISOString();
    const meeting: Meeting = {
      id: uid('m'),
      title: input.title?.trim() ?? '',
      date: input.date || isoDate(new Date()),
      createdAt: now,
      updatedAt: now,
      source: input.source,
      ...(input.sampleId ? { sampleId: input.sampleId } : {}),
      segments: input.segments,
    };
    this.state.update((list) => [meeting, ...list]);
    await this.persist(meeting);
    return meeting;
  }

  async update(id: string, change: (m: Meeting) => Meeting): Promise<void> {
    let next: Meeting | undefined;
    this.state.update((list) => list.map((m) => {
      if (m.id !== id) return m;
      next = { ...change(m), updatedAt: new Date().toISOString() };
      return next;
    }));
    if (next) await this.persist(next);
  }

  setAnalysis(id: string, analysis: Analysis, provider: string): Promise<void> {
    return this.update(id, (m) => ({ ...m, analysis, analyzedWith: provider, analyzedAt: new Date().toISOString() }));
  }

  updateActionItem(id: string, itemId: string, patch: Partial<ActionItem> | null): Promise<void> {
    return this.update(id, (m) => {
      if (!m.analysis) return m;
      const items = patch === null
        ? m.analysis.actionItems.filter((a) => a.id !== itemId)
        : m.analysis.actionItems.map((a) => (a.id === itemId ? { ...a, ...patch } : a));
      return { ...m, analysis: { ...m.analysis, actionItems: items } };
    });
  }

  addActionItem(id: string, task: string): Promise<void> {
    return this.update(id, (m) => m.analysis
      ? { ...m, analysis: { ...m.analysis, actionItems: [...m.analysis.actionItems, { id: uid('a'), task, priority: 'medium', done: false }] } }
      : m);
  }

  async remove(id: string): Promise<void> {
    this.state.update((list) => list.filter((m) => m.id !== id));
    await this.backend.remove(id).catch((e) => this.error.set((e as Error).message));
  }

  async clear(): Promise<void> {
    this.state.set([]);
    await this.backend.clear().catch((e) => this.error.set((e as Error).message));
  }

  private async persist(m: Meeting): Promise<void> {
    try {
      await this.backend.put(m);
      this.error.set('');
    } catch (e) {
      this.error.set((e as Error).message);
    }
  }
}
