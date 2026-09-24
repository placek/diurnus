// @vitest-environment jsdom
import { test, expect, beforeEach, vi } from 'vitest';
import { today } from '../src/lib/time';

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  document.body.innerHTML = '';
  document.head.innerHTML = '<meta name="theme-color" content="#282828">';
  delete document.documentElement.dataset.theme;
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (q: string) => ({
      matches: q.includes('min-width'), media: q,
      addEventListener() {}, removeEventListener() {},
    }),
  });
});

async function mountApp() {
  const { mount, flushSync } = await import('svelte');
  const App = (await import('../src/App.svelte')).default;
  mount(App, { target: document.body });
  flushSync();
  return flushSync;
}

test('stan zapisany pod starą nazwą przenosi się pod nową', async () => {
  // Zmiana nazwy projektu nie może osierocić danych użytkownika.
  localStorage.setItem('gridday.prefs', JSON.stringify({ theme: 'dark', seenHelp: true, notify: false }));
  localStorage.setItem('gridday.v1', JSON.stringify({
    v: 5,
    cats: [{ id: 'learn', name: 'Nauka', icon: 'book-open', color: 'blue', parent: null }],
    day: { start: 6, end: 22, bands: [] }, blocks: [],
    items: [{ id: 'a', day: today(), text: 'Sprzed zmiany nazwy', type: 'task', created: 0 }],
  }));

  const { app } = await import('../src/state.svelte');
  await mountApp();

  expect(app.S.items.find((i) => i.text === 'Sprzed zmiany nazwy')).toBeTruthy();
  expect(app.prefs.theme).toBe('dark');
  expect(localStorage.getItem('diurnus.v1')).not.toBeNull();
  expect(localStorage.getItem('gridday.v1')).toBeNull();
});

test('przeniesienie nie nadpisuje danych już zapisanych pod nową nazwą', async () => {
  localStorage.setItem('gridday.v1', JSON.stringify({ v: 5, cats: [], blocks: [], items: [], day: { start: 6, end: 22, bands: [] } }));
  localStorage.setItem('diurnus.v1', JSON.stringify({
    v: 5, cats: [], blocks: [], day: { start: 6, end: 22, bands: [] },
    items: [{ id: 'nowe', day: today(), text: 'Nowsze', type: 'task', created: 0 }],
  }));
  localStorage.setItem('diurnus.prefs', JSON.stringify({ theme: 'auto', seenHelp: true, notify: false }));

  const { app } = await import('../src/state.svelte');
  await mountApp();
  expect(app.S.items.some((i) => i.text === 'Nowsze')).toBe(true);
});
