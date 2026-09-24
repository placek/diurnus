// @vitest-environment jsdom
import { test, expect, beforeEach, vi } from 'vitest';
import { shiftDay, today } from '../src/lib/time';

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  document.body.innerHTML = '';
  document.head.innerHTML = '<meta name="theme-color" content="#282828">';
  delete document.documentElement.dataset.theme;
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (q: string) => ({
      matches: q.includes('min-width'),
      media: q,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
});

function seed(items: unknown[]) {
  localStorage.setItem('diurnus.prefs', JSON.stringify({ theme: 'auto', seenHelp: true }));
  localStorage.setItem(
    'gridday.v1',
    JSON.stringify({
      v: 5,
      cats: [{ id: 'learn', name: 'Nauka', icon: 'book-open', color: 'blue', parent: null }],
      day: { start: 6, end: 22, bands: [] },
      blocks: [],
      items,
    }),
  );
}

async function mountApp() {
  const { mount, flushSync } = await import('svelte');
  const App = (await import('../src/App.svelte')).default;
  mount(App, { target: document.body });
  flushSync();
  return flushSync;
}

const noteTexts = () =>
  [...document.querySelectorAll<HTMLInputElement>('#list .item[data-id] .item-text')].map((i) => i.value);

test('niedokończone zadanie z wczoraj pojawia się dziś', async () => {
  seed([{ id: 'a', day: shiftDay(today(), -1), text: 'Niedokończone', type: 'task', created: 0 }]);
  const { app } = await import('../src/state.svelte');
  await mountApp();
  expect(app.S.items[0]!.day).toBe(today());
  expect(noteTexts()).toContain('Niedokończone');
});

test('przeniesione staje na początku dzisiejszej listy', async () => {
  seed([
    { id: 'dzis', day: today(), text: 'Dzisiejsze', type: 'task', created: 0 },
    { id: 'wczoraj', day: shiftDay(today(), -1), text: 'Wczorajsze', type: 'task', created: 0 },
  ]);
  await mountApp();
  expect(noteTexts()).toEqual(['Wczorajsze', 'Dzisiejsze']);
});

test('skanuje wstecz dalej niż wczoraj', async () => {
  // Weekend poza domem nie może zgubić piątkowych resztek.
  seed([{ id: 'a', day: shiftDay(today(), -4), text: 'Sprzed czterech dni', type: 'task', created: 0 }]);
  const { app } = await import('../src/state.svelte');
  await mountApp();
  expect(app.S.items[0]!.day).toBe(today());
});

test('wykonane i notatki zostają w swoim dniu', async () => {
  const past = shiftDay(today(), -1);
  seed([
    { id: 'z', day: past, text: 'Zrobione', type: 'done', created: 0 },
    { id: 'n', day: past, text: 'Notatka', type: 'note', created: 0 },
  ]);
  const { app } = await import('../src/state.svelte');
  await mountApp();
  expect(app.S.items.every((i) => i.day === past)).toBe(true);
});

test('pozycje backlogu nie są ruszane', async () => {
  seed([
    { id: 'b', day: shiftDay(today(), 3), text: 'Przyszłe', type: 'task', created: 0 },
    { id: 'k', day: null, text: 'Kiedyś', type: 'task', created: 0 },
  ]);
  const { app } = await import('../src/state.svelte');
  await mountApp();
  expect(app.S.items.find((i) => i.id === 'b')!.day).toBe(shiftDay(today(), 3));
  expect(app.S.items.find((i) => i.id === 'k')!.day).toBeNull();
});
