import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SettingsStore } from './core/settings.store';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="skip" href="#main">Skip to content</a>
    <header class="top">
      <a routerLink="/" class="brand" aria-label="Minutes, home">
        <svg class="logo" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="5" fill="currentColor" />
          <path d="M7.5 9h9M7.5 12.5h9M7.5 16h5" stroke="var(--accent-text)" stroke-width="1.8" stroke-linecap="round" />
        </svg>
        Minutes
      </a>
      <nav aria-label="Main">
        <a routerLink="/" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">New</a>
        <a routerLink="/library" routerLinkActive="active">Library</a>
        <a routerLink="/settings" routerLinkActive="active">Settings</a>
      </nav>
      <a routerLink="/settings" class="chip provider" [title]="'AI provider: ' + settings.providerLabel()">{{ settings.providerLabel() }}</a>
      <button type="button" class="btn ghost sm theme" (click)="toggleTheme()" [attr.aria-label]="'Switch to ' + nextTheme() + ' theme'">
        {{ dark() ? '☀' : '☾' }}
      </button>
    </header>
    <main id="main"><router-outlet /></main>
  `,
  styleUrl: './app.scss',
})
export class App {
  protected readonly settings = inject(SettingsStore);

  protected readonly dark = computed(() => {
    const theme = this.settings.settings().theme;
    if (theme !== 'system') return theme === 'dark';
    return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches;
  });
  protected readonly nextTheme = computed(() => (this.dark() ? 'light' : 'dark'));

  protected toggleTheme(): void {
    this.settings.update({ theme: this.nextTheme() });
  }
}
