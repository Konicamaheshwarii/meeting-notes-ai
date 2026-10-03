import { Injectable, OnDestroy, signal } from '@angular/core';

export interface LiveSegment {
  start: number;
  end: number;
  text: string;
}

type State = 'idle' | 'listening' | 'paused';

/**
 * Live captions with the Web Speech API (Chrome, Edge, Safari). Keeps a meeting clock that stops
 * while paused, so each final phrase gets a start/end time relative to the meeting.
 * Chrome ends recognition after a silence; while listening it is restarted automatically.
 */
@Injectable({ providedIn: 'root' })
export class LiveTranscriber implements OnDestroy {
  private recognition: any = null;
  private onSegment: ((s: LiveSegment) => void) | null = null;
  private elapsedBefore = 0;
  private runningSince = 0;
  private utteranceStart: number | null = null;
  private timer?: ReturnType<typeof setInterval>;

  readonly supported = typeof window !== 'undefined'
    && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  readonly state = signal<State>('idle');
  readonly interim = signal('');
  readonly elapsed = signal(0);
  readonly error = signal('');

  /** Seconds on the meeting clock (pauses excluded). */
  now(): number {
    const running = this.state() === 'listening' ? (Date.now() - this.runningSince) / 1000 : 0;
    return Math.round((this.elapsedBefore + running) * 10) / 10;
  }

  start(onSegment: (s: LiveSegment) => void, lang = 'en-US', offsetSeconds = 0): void {
    if (!this.supported || this.state() !== 'idle') return;
    this.onSegment = onSegment;
    this.elapsedBefore = offsetSeconds;
    this.error.set('');
    this.listen(lang);
    this.timer = setInterval(() => this.elapsed.set(this.now()), 500);
  }

  pause(): void {
    if (this.state() !== 'listening') return;
    this.flushInterim();
    this.elapsedBefore = this.now();
    this.state.set('paused');
    this.recognition?.stop();
  }

  resume(lang = 'en-US'): void {
    if (this.state() !== 'paused') return;
    this.listen(lang);
  }

  stop(): void {
    if (this.state() === 'idle') return;
    if (this.state() === 'listening') {
      this.flushInterim();
      this.elapsedBefore = this.now();
    }
    this.state.set('idle');
    clearInterval(this.timer);
    const rec = this.recognition;
    this.recognition = null;
    rec?.stop();
    this.interim.set('');
  }

  ngOnDestroy(): void {
    this.stop();
  }

  private listen(lang: string): void {
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = String(result[0]?.transcript ?? '').trim();
        if (!text) continue;
        this.utteranceStart ??= Math.max(0, this.now() - text.split(/\s+/).length / 2.5);
        if (result.isFinal) this.emit(text);
        else interim += `${text} `;
      }
      this.interim.set(interim.trim());
    };
    rec.onerror = (e: any) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        this.error.set('Microphone access was blocked. Allow it in the browser address bar and try again.');
        this.stop();
      } else if (e.error === 'network') {
        this.error.set('Live captions need a network connection in this browser.');
      }
      // "no-speech" and "aborted" are normal; onend restarts.
    };
    rec.onend = () => {
      if (this.recognition !== rec) return;
      if (this.state() === 'listening') {
        try { rec.start(); } catch { this.stop(); }
      }
    };
    this.recognition = rec;
    this.runningSince = Date.now();
    this.state.set('listening');
    try {
      rec.start();
    } catch (e) {
      this.error.set((e as Error).message);
      this.stop();
    }
  }

  private emit(text: string): void {
    const end = this.now();
    const start = Math.min(this.utteranceStart ?? end, end);
    this.utteranceStart = null;
    this.onSegment?.({ start: Math.round(start * 10) / 10, end, text });
  }

  private flushInterim(): void {
    const pending = this.interim().trim();
    if (pending) this.emit(pending);
    this.interim.set('');
  }
}
