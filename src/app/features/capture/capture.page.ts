import { ChangeDetectionStrategy, Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LibraryStore } from '../../core/library/library.store';
import { MeetingSource, Segment, formatClock, isoDate, uid } from '../../core/models';
import { SAMPLES, SampleMeeting } from '../../core/samples';
import { SettingsStore } from '../../core/settings.store';
import { parseTranscript, speakersOf } from '../../core/transcript/transcript';
import { WHISPER_MAX_BYTES, transcribeAudio } from '../../core/transcript/whisper';
import { LiveTranscriber } from '../../shared/live-transcriber.service';
import { AudioRecorder, Recording } from '../../shared/recorder.service';

type Tab = 'live' | 'record' | 'upload' | 'paste';

const TEXT_FILE = /\.(txt|vtt|srt|md|text)$/i;

export const PASTE_EXAMPLE = `[00:00] Maya: Thanks for joining. Quick check-in on the launch.
[00:08] Dev: The API is ready. I'll finish the load test by Thursday.
[00:15] Maya: Great. Priya, can you update the release notes by Friday?
[00:21] Priya: Sure. We decided to ship behind a feature flag.`;

@Component({
  selector: 'app-capture',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './capture.page.html',
  styleUrl: './capture.page.scss',
})
export class CapturePage implements OnDestroy {
  private readonly library = inject(LibraryStore);
  private readonly router = inject(Router);
  protected readonly settings = inject(SettingsStore);
  protected readonly live = inject(LiveTranscriber);
  protected readonly recorder = inject(AudioRecorder);

  protected readonly samples = SAMPLES;
  protected readonly example = PASTE_EXAMPLE;
  protected readonly clock = formatClock;
  protected readonly maxMb = WHISPER_MAX_BYTES / 1048576;

  protected readonly tab = signal<Tab>(this.live.supported ? 'live' : 'paste');
  protected readonly tabs: { id: Tab; label: string }[] = [
    { id: 'live', label: 'Live captions' },
    { id: 'record', label: 'Record audio' },
    { id: 'upload', label: 'Upload file' },
    { id: 'paste', label: 'Paste transcript' },
  ];
  protected readonly title = signal('');
  protected readonly date = signal(isoDate(new Date()));
  protected readonly busy = signal('');
  protected readonly error = signal('');

  // live captions
  protected readonly speakers = signal<string[]>(['Speaker 1', 'Speaker 2']);
  protected readonly activeSpeaker = signal('Speaker 1');
  protected readonly liveSegments = signal<Segment[]>([]);

  // recording
  protected readonly recording = signal<(Recording & { url: string }) | null>(null);

  // paste
  protected readonly pasted = signal('');
  protected readonly preview = computed(() => {
    const text = this.pasted();
    if (!text.trim()) return null;
    const segments = parseTranscript(text);
    return { segments: segments.length, speakers: speakersOf(segments), timed: segments.some((s) => !s.estimated) };
  });

  protected select(tab: Tab): void {
    this.tab.set(tab);
    this.error.set('');
  }

  protected onTabKey(event: KeyboardEvent): void {
    const i = this.tabs.findIndex((t) => t.id === this.tab());
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = this.tabs[(i + step + this.tabs.length) % this.tabs.length];
    this.select(next.id);
    (document.getElementById(`tab-${next.id}`) as HTMLElement | null)?.focus();
  }

  // ---------- samples ----------

  protected async openSample(sample: SampleMeeting): Promise<void> {
    await this.library.ready;
    const existing = this.library.meetings().find((m) => m.sampleId === sample.id);
    if (existing) {
      await this.router.navigate(['/m', existing.id], existing.analysis ? {} : { queryParams: { analyze: 1 } });
      return;
    }
    await this.create('sample', parseTranscript(sample.transcript), { title: sample.title, sampleId: sample.id, date: isoDate(new Date()) });
  }

  // ---------- live ----------

  protected addSpeaker(input: HTMLInputElement): void {
    const name = input.value.trim().replace(/\s+/g, ' ');
    if (!name) return;
    if (!this.speakers().includes(name)) this.speakers.update((s) => [...s, name]);
    this.activeSpeaker.set(name);
    input.value = '';
  }

  protected startLive(): void {
    this.error.set('');
    const last = this.liveSegments().at(-1);
    this.live.start((s) => {
      this.liveSegments.update((list) => [...list, { id: uid('s'), start: s.start, end: s.end, speaker: this.activeSpeaker(), text: s.text }]);
    }, this.settings.settings().language, last?.end ?? 0);
  }

  protected finishLive(): void {
    this.live.stop();
    const segments = this.liveSegments();
    if (!segments.length) {
      this.error.set('Nothing was captured yet. Start live captions and speak, or paste a transcript instead.');
      return;
    }
    void this.create('live', segments);
  }

  protected discardLive(): void {
    this.live.stop();
    this.liveSegments.set([]);
  }

  // ---------- recording ----------

  protected async startRecording(): Promise<void> {
    this.error.set('');
    this.clearRecording();
    await this.recorder.start();
  }

  protected async stopRecording(): Promise<void> {
    const rec = await this.recorder.stop();
    if (rec) this.recording.set({ ...rec, url: URL.createObjectURL(rec.blob) });
  }

  protected transcribeRecording(): void {
    const rec = this.recording();
    if (rec) void this.transcribe(rec.blob, rec.filename, 'recording');
  }

  protected clearRecording(): void {
    const rec = this.recording();
    if (rec) URL.revokeObjectURL(rec.url);
    this.recording.set(null);
  }

  // ---------- upload ----------

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (file) void this.handleFile(file);
  }

  protected onPick(input: HTMLInputElement): void {
    const file = input.files?.[0];
    input.value = '';
    if (file) void this.handleFile(file);
  }

  protected async handleFile(file: File): Promise<void> {
    this.error.set('');
    if (TEXT_FILE.test(file.name) || file.type.startsWith('text/')) {
      const segments = parseTranscript(await file.text());
      if (!segments.length) {
        this.error.set('That file has no transcript text in it.');
        return;
      }
      if (!this.title()) this.title.set(file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '));
      await this.create('upload', segments);
      return;
    }
    if (!file.type.startsWith('audio/') && !file.type.startsWith('video/') && !/\.(mp3|m4a|wav|webm|ogg|flac|mp4|mpeg|mpga|opus)$/i.test(file.name)) {
      this.error.set('Use an audio file (mp3, m4a, wav, webm, ogg, flac) or a transcript (txt, vtt, srt).');
      return;
    }
    if (!this.title()) this.title.set(file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '));
    await this.transcribe(file, file.name, 'upload');
  }

  private async transcribe(blob: Blob, filename: string, source: MeetingSource): Promise<void> {
    const key = this.settings.groqKey();
    if (!key) {
      this.error.set('Audio transcription uses Groq Whisper. Add a free Groq API key in Settings, then try again.');
      return;
    }
    this.busy.set('Transcribing with Whisper…');
    try {
      const segments = await transcribeAudio(blob, filename, key, { language: this.settings.settings().language });
      await this.create(source, segments);
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.busy.set('');
    }
  }

  // ---------- paste ----------

  protected createFromPaste(): void {
    const segments = parseTranscript(this.pasted());
    if (!segments.length) {
      this.error.set('Paste a transcript first.');
      return;
    }
    void this.create('paste', segments);
  }

  private async create(source: MeetingSource, segments: Segment[], extra: { title?: string; sampleId?: string; date?: string } = {}): Promise<void> {
    const meeting = await this.library.create({
      source,
      segments,
      title: extra.title ?? this.title(),
      date: extra.date ?? this.date(),
      sampleId: extra.sampleId,
    });
    this.liveSegments.set([]);
    this.clearRecording();
    await this.router.navigate(['/m', meeting.id], { queryParams: { analyze: 1 } });
  }

  ngOnDestroy(): void {
    this.live.stop();
    void this.recorder.stop();
    this.clearRecording();
  }
}
