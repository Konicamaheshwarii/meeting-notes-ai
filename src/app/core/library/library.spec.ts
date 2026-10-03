import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { Meeting } from '../models';
import { MeetingBackend, MemoryBackend, ResilientBackend } from './backends';
import { LibraryStore, MEETING_BACKEND } from './library.store';
import { searchMeetings } from './search';

function meeting(id: string, title: string, text: string, date = '2026-10-01'): Meeting {
  return {
    id, title, date, createdAt: `${date}T10:00:00Z`, updatedAt: `${date}T10:00:00Z`, source: 'paste',
    segments: [{ id: `${id}s`, start: 0, speaker: 'Maya', text }],
  };
}

describe('searchMeetings', () => {
  const list = [
    meeting('a', 'Budget review', 'We moved the Loqate contract to next quarter.', '2026-09-01'),
    meeting('b', 'Sprint planning', 'The budget for Loqate is fine.', '2026-10-01'),
    meeting('c', 'Retro', 'Nothing relevant.', '2026-10-02'),
  ];

  it('requires every word, ranks title matches first, and returns a snippet', () => {
    const hits = searchMeetings(list, 'budget loqate');
    expect(hits.map((h) => h.meeting.id)).toEqual(['a', 'b']);
    expect(hits[1].snippet).toContain('budget for Loqate');
    expect(searchMeetings(list, 'missing').length).toBe(0);
  });

  it('lists newest first with an empty query', () => {
    expect(searchMeetings(list, '  ').map((h) => h.meeting.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('LibraryStore', () => {
  it('persists creates, checkbox updates and deletes to the backend', async () => {
    const backend = new MemoryBackend();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), { provide: MEETING_BACKEND, useValue: backend }] });
    const store = TestBed.inject(LibraryStore);
    const m = await store.create({ source: 'paste', segments: meeting('x', '', 'hi').segments, title: '  Weekly  ' });
    await store.setAnalysis(m.id, {
      title: 'AI', tldr: 't', keyPoints: [], decisions: [], openQuestions: [], sentiment: { tone: 'neutral', note: '' },
      actionItems: [{ id: 'a1', task: 'Do it', priority: 'medium', done: false }],
    }, 'Demo');
    await store.updateActionItem(m.id, 'a1', { done: true });

    const saved = (await backend.all())[0];
    expect(saved.title).toBe('Weekly');
    expect(saved.analyzedWith).toBe('Demo');
    expect(saved.analysis!.actionItems[0].done).toBeTrue();

    await store.remove(m.id);
    expect(await backend.all()).toEqual([]);
    expect(store.count()).toBe(0);
  });

  it('falls back to the secondary backend when the primary fails', async () => {
    const broken: MeetingBackend = {
      all: () => Promise.reject(new Error('blocked')), put: () => Promise.reject(new Error('blocked')),
      remove: () => Promise.reject(new Error('blocked')), clear: () => Promise.reject(new Error('blocked')),
    };
    const fallback = new MemoryBackend();
    const backend = new ResilientBackend(broken, fallback);
    await backend.put(meeting('z', 'Z', 'text'));
    expect((await backend.all()).map((m) => m.id)).toEqual(['z']);
  });
});
