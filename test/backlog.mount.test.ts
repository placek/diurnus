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
  localStorage.setItem('gridday.prefs', JSON.stringify({ theme: 'auto', seenHelp: true }));
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

const rows = () => [...document.querySelectorAll<HTMLElement>('#backlog .backlog-item')];
const metas = () => rows().map((r) => r.querySelector('.backlog-meta')?.textContent ?? '');
const texts = () => rows().map((r) => r.querySelector<HTMLInputElement>('.item-text')!.value);

test('backlog pokazuje pozycje przyszłe i bezdatowe, a pomija dzisiejsze', async () => {
  seed([
    { id: 'dzis', day: today(), text: 'Dzisiejsza', type: 'task', created: 0 },
    { id: 'jutro', day: shiftDay(today(), 1), text: 'Jutrzejsza', type: 'task', created: 0 },
    { id: 'kiedys', day: null, text: 'Kiedyś', type: 'task', created: 0 },
  ]);
  await mountApp();
  expect(texts()).toEqual(['Jutrzejsza', 'Kiedyś']);
});

test('pozycja z datą pokazuje datę, z godziną — datę i godzinę', async () => {
  const d = shiftDay(today(), 1);
  seed([
    { id: 'a', day: d, text: 'Bez pory', type: 'task', created: 0 },
    { id: 'b', day: d, text: 'Z porą', type: 'task', created: 0, at: 36 },
  ]);
  await mountApp();
  expect(metas()[0]).toMatch(/^\p{L}+\.? \d{1,2} \p{L}+$/u);
  expect(metas()[1]).toMatch(/09:00$/);
});

test('pozycja powtarzalna pokazuje opis wzorca i ma kółko zamiast kropki', async () => {
  seed([
    {
      id: 'r', day: null, text: 'Poniedziałkowe', type: 'task', created: 0,
      repeat: { kind: 'weekly', weekday: 1 }, nextOn: shiftDay(today(), 1),
    },
  ]);
  await mountApp();
  expect(metas()[0]).toBe('co poniedziałek');
  expect(rows()[0]!.querySelector('.bullet')!.classList.contains('is-repeat')).toBe(true);
});

test('pozycje z datą stoją przed bezdatowymi, rosnąco po dacie', async () => {
  seed([
    { id: 'bez', day: null, text: 'Kiedyś', type: 'task', created: 0 },
    { id: 'pozno', day: shiftDay(today(), 9), text: 'Późno', type: 'task', created: 0 },
    { id: 'wczesnie', day: shiftDay(today(), 2), text: 'Wcześnie', type: 'task', created: 0 },
  ]);
  await mountApp();
  expect(texts()).toEqual(['Wcześnie', 'Późno', 'Kiedyś']);
});

test('pusty backlog mówi, że nic nie czeka', async () => {
  seed([]);
  await mountApp();
  expect(document.querySelector('#backlog .list-empty')!.textContent).toContain('Nic nie czeka');
});

test('Enter w backlogu tworzy kolejną pozycję TAM, nie w dzisiejszych notatkach', async () => {
  // Znalezione w przeglądzie: addItemAfter zawsze nadawało dzisiejszą datę,
  // więc nowa pozycja znikała z panelu, w którym się pisało.
  const d = shiftDay(today(), 2);
  seed([{ id: 'a', day: d, text: 'Pierwsza', type: 'task', created: 0 }]);
  const flush = await mountApp();
  const { app } = await import('../src/state.svelte');

  const input = rows()[0]!.querySelector<HTMLInputElement>('.item-text')!;
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  flush();

  expect(rows()).toHaveLength(2);
  expect(app.S.items).toHaveLength(2);
  expect(app.S.items.every((i) => i.day === d)).toBe(true);
});

test('Enter po pozycji bez daty też tworzy pozycję bez daty', async () => {
  seed([{ id: 'a', day: null, text: 'Kiedyś', type: 'task', created: 0 }]);
  const flush = await mountApp();
  const { app } = await import('../src/state.svelte');

  const input = rows()[0]!.querySelector<HTMLInputElement>('.item-text')!;
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  flush();

  expect(rows()).toHaveLength(2);
  expect(app.S.items.every((i) => i.day === null)).toBe(true);
});
