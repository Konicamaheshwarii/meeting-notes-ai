import { Injectable, inject, signal } from '@angular/core';
import { LibraryStore } from '../library/library.store';
import { LlmService } from '../llm/llm.service';
import { SettingsStore } from '../settings.store';
import { AnalysisProgress, carryOverDone, runAnalysis } from './pipeline';

export interface AnalysisRun {
  meetingId: string;
  progress: AnalysisProgress;
}

/** Runs one analysis at a time and keeps going if the user navigates away; results land in the library. */
@Injectable({ providedIn: 'root' })
export class AnalyzeService {
  private readonly llm = inject(LlmService);
  private readonly settings = inject(SettingsStore);
  private readonly library = inject(LibraryStore);
  private controller?: AbortController;

  readonly running = signal<AnalysisRun | null>(null);
  readonly error = signal<{ meetingId: string; message: string } | null>(null);

  async analyze(meetingId: string): Promise<void> {
    const meeting = this.library.get(meetingId);
    if (!meeting) return;
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    this.error.set(null);
    const provider = this.settings.providerLabel();
    this.running.set({ meetingId, progress: { step: 0, total: 1, label: 'Preparing transcript', received: 0 } });

    try {
      if (this.settings.needsKey()) throw new Error(`Add your ${provider} API key in Settings, or switch to Demo mode.`);
      const analysis = await runAnalysis(this.llm, meeting.segments, {
        meetingDate: meeting.date,
        chunkChars: this.settings.settings().chunkChars,
        signal: controller.signal,
        onProgress: (progress) => {
          if (this.controller === controller) this.running.set({ meetingId, progress });
        },
      });
      const latest = this.library.get(meetingId);
      analysis.actionItems = carryOverDone(analysis.actionItems, latest?.analysis?.actionItems);
      await this.library.setAnalysis(meetingId, analysis, provider);
    } catch (e) {
      if (!controller.signal.aborted) this.error.set({ meetingId, message: (e as Error).message });
    } finally {
      // A newer run may have started; only the current one may clear the state.
      if (this.controller === controller) {
        this.running.set(null);
        this.controller = undefined;
      }
    }
  }

  cancel(): void {
    this.controller?.abort();
    this.controller = undefined;
    this.running.set(null);
  }
}
