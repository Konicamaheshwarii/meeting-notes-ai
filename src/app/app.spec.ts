import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { highlight } from './features/meeting/transcript.view';

describe('App', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    }).compileComponents();
  });

  it('shows the brand and Demo as the default provider', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.brand')?.textContent).toContain('Minutes');
    expect(el.querySelector('.provider')?.textContent?.trim()).toBe('Demo');
  });
});

describe('transcript search highlight', () => {
  it('splits text into matching parts without HTML and escapes regex characters', () => {
    expect(highlight('Use C++ and c++ daily', 'c++').map((p) => p.hit)).toEqual([false, true, false, true, false]);
    expect(highlight('<b>x</b>', '')).toEqual([{ text: '<b>x</b>', hit: false }]);
  });
});
