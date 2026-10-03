import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', title: 'Minutes · AI meeting notes', loadComponent: () => import('./features/capture/capture.page').then((m) => m.CapturePage) },
  { path: 'm/:id', title: 'Meeting · Minutes', loadComponent: () => import('./features/meeting/meeting.page').then((m) => m.MeetingPage) },
  { path: 'library', title: 'Library · Minutes', loadComponent: () => import('./features/library/library.page').then((m) => m.LibraryPage) },
  { path: 'settings', title: 'Settings · Minutes', loadComponent: () => import('./features/settings/settings.page').then((m) => m.SettingsPage) },
  { path: '**', redirectTo: '' },
];
