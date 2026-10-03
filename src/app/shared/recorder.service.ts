import { Injectable, OnDestroy, signal } from '@angular/core';

export interface Recording {
  blob: Blob;
  filename: string;
  seconds: number;
}

const TYPES: [string, string][] = [
  ['audio/webm;codecs=opus', 'webm'],
  ['audio/webm', 'webm'],
  ['audio/mp4', 'm4a'],
  ['audio/ogg;codecs=opus', 'ogg'],
];

/** Records microphone audio with MediaRecorder, with pause/resume and a level meter. */
@Injectable({ providedIn: 'root' })
export class AudioRecorder implements OnDestroy {
  private recorder?: MediaRecorder;
  private stream?: MediaStream;
  private chunks: Blob[] = [];
  private audio?: AudioContext;
  private raf = 0;
  private timer?: ReturnType<typeof setInterval>;
  private elapsedBefore = 0;
  private runningSince = 0;

  readonly supported = typeof window !== 'undefined' && 'MediaRecorder' in window && !!navigator.mediaDevices?.getUserMedia;
  readonly state = signal<'idle' | 'recording' | 'paused'>('idle');
  readonly elapsed = signal(0);
  /** 0..1 input level for the meter. */
  readonly level = signal(0);
  readonly error = signal('');

  private now(): number {
    return this.elapsedBefore + (this.state() === 'recording' ? (Date.now() - this.runningSince) / 1000 : 0);
  }

  async start(): Promise<void> {
    if (!this.supported || this.state() !== 'idle') return;
    this.error.set('');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      this.error.set('Microphone access was blocked. Allow it in the browser address bar and try again.');
      return;
    }
    const type = TYPES.find(([t]) => MediaRecorder.isTypeSupported(t));
    this.recorder = new MediaRecorder(this.stream, type ? { mimeType: type[0], audioBitsPerSecond: 32000 } : undefined);
    this.chunks = [];
    this.recorder.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
    this.recorder.start(1000);
    this.elapsedBefore = 0;
    this.runningSince = Date.now();
    this.state.set('recording');
    this.timer = setInterval(() => this.elapsed.set(Math.floor(this.now())), 250);
    this.meter(this.stream);
  }

  pause(): void {
    if (this.state() !== 'recording') return;
    this.elapsedBefore = this.now();
    this.recorder?.pause();
    this.state.set('paused');
  }

  resume(): void {
    if (this.state() !== 'paused') return;
    this.runningSince = Date.now();
    this.recorder?.resume();
    this.state.set('recording');
  }

  stop(): Promise<Recording | null> {
    const recorder = this.recorder;
    if (!recorder || this.state() === 'idle') return Promise.resolve(null);
    const seconds = Math.round(this.now());
    return new Promise((resolve) => {
      recorder.onstop = () => {
        const mime = recorder.mimeType || 'audio/webm';
        const ext = TYPES.find(([t]) => mime.startsWith(t.split(';')[0]))?.[1] ?? 'webm';
        const blob = new Blob(this.chunks, { type: mime.split(';')[0] });
        this.cleanup();
        resolve({ blob, filename: `meeting-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.${ext}`, seconds });
      };
      recorder.stop();
    });
  }

  ngOnDestroy(): void {
    if (this.recorder && this.state() !== 'idle') this.recorder.stop();
    this.cleanup();
  }

  private meter(stream: MediaStream): void {
    try {
      this.audio = new AudioContext();
      const analyser = this.audio.createAnalyser();
      analyser.fftSize = 512;
      this.audio.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (const v of data) peak = Math.max(peak, Math.abs(v - 128) / 128);
        this.level.set(this.state() === 'recording' ? Math.min(1, peak * 1.6) : 0);
        this.raf = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      // the meter is decoration; recording works without it
    }
  }

  private cleanup(): void {
    clearInterval(this.timer);
    cancelAnimationFrame(this.raf);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.audio?.close().catch(() => undefined);
    this.stream = undefined;
    this.recorder = undefined;
    this.audio = undefined;
    this.level.set(0);
    this.state.set('idle');
  }
}
