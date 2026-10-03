import { Injectable, computed, effect, signal } from '@angular/core';
import { readJson, writeJson } from './storage';

export type ProviderId = 'demo' | 'gemini' | 'groq';

export type Theme = 'system' | 'light' | 'dark';

export interface Settings {
  provider: ProviderId;
  theme: Theme;
  apiKeys: Partial<Record<Exclude<ProviderId, 'demo'>, string>>;
  models: Record<Exclude<ProviderId, 'demo'>, string>;
  /** Spoken language for live captions and Whisper, e.g. "en-US". */
  language: string;
  /** Max transcript characters per summarisation chunk (map step). */
  chunkChars: number;
}

export const PROVIDERS: { id: ProviderId; label: string; keyUrl?: string }[] = [
  { id: 'demo', label: 'Demo (no key, offline)' },
  { id: 'gemini', label: 'Google Gemini', keyUrl: 'https://aistudio.google.com/apikey' },
  { id: 'groq', label: 'Groq', keyUrl: 'https://console.groq.com/keys' },
];

export const CHUNK_LIMITS = { min: 2000, max: 60000 };

export const DEFAULT_SETTINGS: Settings = {
  provider: 'demo',
  theme: 'system',
  apiKeys: {},
  models: { gemini: 'gemini-2.5-flash', groq: 'llama-3.3-70b-versatile' },
  language: 'en-US',
  chunkChars: 4000,
};

const KEY = 'minutes.settings';

export function loadSettings(saved: Partial<Settings>): Settings {
  const chunk = Number(saved.chunkChars);
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    apiKeys: { ...saved.apiKeys },
    models: { ...DEFAULT_SETTINGS.models, ...saved.models },
    chunkChars: Number.isFinite(chunk) && chunk > 0
      ? Math.min(CHUNK_LIMITS.max, Math.max(CHUNK_LIMITS.min, Math.round(chunk)))
      : DEFAULT_SETTINGS.chunkChars,
  };
}

@Injectable({ providedIn: 'root' })
export class SettingsStore {
  private readonly state = signal<Settings>(loadSettings(readJson<Partial<Settings>>(KEY, {})));

  readonly settings = this.state.asReadonly();
  readonly provider = computed(() => this.state().provider);
  readonly isDemo = computed(() => this.state().provider === 'demo');
  /** A real provider is selected but has no key yet. */
  readonly needsKey = computed(() => {
    const s = this.state();
    return s.provider !== 'demo' && !s.apiKeys[s.provider]?.trim();
  });
  /** Whisper transcription is available whenever a Groq key is saved, whatever the chat provider. */
  readonly groqKey = computed(() => this.state().apiKeys.groq?.trim() ?? '');
  readonly providerLabel = computed(() => PROVIDERS.find((p) => p.id === this.state().provider)?.label.split(' (')[0] ?? '');

  constructor() {
    effect(() => writeJson(KEY, this.state()));
    effect(() => {
      const theme = this.state().theme;
      if (theme === 'system') document.documentElement.removeAttribute('data-theme');
      else document.documentElement.setAttribute('data-theme', theme);
    });
  }

  update(patch: Partial<Settings>): void {
    this.state.update((s) => loadSettings({ ...s, ...patch }));
  }

  setKey(provider: Exclude<ProviderId, 'demo'>, key: string): void {
    this.state.update((s) => ({ ...s, apiKeys: { ...s.apiKeys, [provider]: key } }));
  }

  setModel(provider: Exclude<ProviderId, 'demo'>, model: string): void {
    this.state.update((s) => ({ ...s, models: { ...s.models, [provider]: model } }));
  }
}
