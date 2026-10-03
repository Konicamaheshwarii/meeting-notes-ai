import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { LibraryStore } from '../../core/library/library.store';
import { LlmService } from '../../core/llm/llm.service';
import { CHUNK_LIMITS, PROVIDERS, ProviderId, SettingsStore, Theme } from '../../core/settings.store';

type RealProvider = Exclude<ProviderId, 'demo'>;

@Component({
  selector: 'app-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './settings.page.html',
  styleUrl: './settings.page.scss',
})
export class SettingsPage {
  protected readonly store = inject(SettingsStore);
  protected readonly library = inject(LibraryStore);
  private readonly llm = inject(LlmService);

  protected readonly providers = PROVIDERS;
  protected readonly limits = CHUNK_LIMITS;
  protected readonly themes: Theme[] = ['system', 'light', 'dark'];
  protected readonly current = computed(() => PROVIDERS.find((p) => p.id === this.store.provider())!);
  protected readonly real = computed(() => (this.store.isDemo() ? null : (this.store.provider() as RealProvider)));
  protected readonly groqUrl = PROVIDERS.find((p) => p.id === 'groq')!.keyUrl;

  protected readonly test = signal<{ state: 'idle' | 'running' | 'ok' | 'fail'; message?: string }>({ state: 'idle' });

  protected choose(id: ProviderId): void {
    this.store.update({ provider: id });
    this.test.set({ state: 'idle' });
  }

  protected setKey(provider: RealProvider, value: string): void {
    this.store.setKey(provider, value.trim());
    this.test.set({ state: 'idle' });
  }

  protected setModel(value: string): void {
    if (value.trim()) this.store.setModel(this.real()!, value.trim());
  }

  protected setChunk(value: string): void {
    this.store.update({ chunkChars: Number(value) });
  }

  protected setLanguage(value: string): void {
    if (/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(value.trim())) this.store.update({ language: value.trim() });
  }

  protected async testConnection(): Promise<void> {
    this.test.set({ state: 'running' });
    try {
      const reply = await this.llm.complete({ task: 'ping', json: true, system: 'You are a health check.', prompt: 'Reply with JSON only: {"ok":true}' });
      this.test.set({ state: 'ok', message: reply ? 'Connected. The provider answered.' : 'Connected, but the reply was empty.' });
    } catch (e) {
      this.test.set({ state: 'fail', message: (e as Error).message });
    }
  }

  protected clearLibrary(): void {
    if (confirm(`Delete all ${this.library.count()} meetings from this browser? This cannot be undone.`)) void this.library.clear();
  }
}
