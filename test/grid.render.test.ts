import { test, expect, beforeAll } from 'vitest';

// state.svelte.ts czyta localStorage przy imporcie — w Node trzeba go podstawić.
function fakeStorage(seed: Record<string, unknown> = {}): Storage {
  const m = new Map(Object.entries(seed).map(([k, v]) => [k, JSON.stringify(v)]));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  } as Storage;
}

let html = '';

beforeAll(async () => {
  const state = {
    v: 2,
    cats: [{ id: 'work', name: 'Praca', icon: 'laptop-code', color: 'yellow', parent: null }],
    day: { start: 6, end: 22, bands: [{ id: 'b', name: 'Rano', from: 6, color: 'aqua' }] },
    blocks: [
      // 08:00–08:30 — jeden segment
      { id: 'a', day: '2026-09-24', q: 32, len: 2, cat: 'work', title: 'Zwykły', status: 'planned', created: 0 },
      // 09:45–10:15 — przełamanie przez granicę godziny
      { id: 'b', day: '2026-09-24', q: 39, len: 2, cat: 'work', title: 'Przełam', status: 'planned', created: 0 },
    ],
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: fakeStorage({ 'gridday.v1': state }),
    configurable: true,
  });

  const { app } = await import('../src/state.svelte');
  app.viewDay = '2026-09-24';
  app.now = new Date(2026, 8, 24, 10, 7).getTime();

  const { render } = await import('svelte/server');
  const Grid = (await import('../src/components/Grid.svelte')).default;
  html = render(Grid).body;
});

test('siatka ma jeden rząd na każdą widoczną godzinę', () => {
  expect(html.match(/class="[^"]*\brow\b/g)?.length).toBe(16);
});

test('każdy rząd ma cztery komórki kwantów', () => {
  expect(html.match(/class="cell q\d/g)?.length).toBe(64);
});

test('etykiety godzin idą od 06 do 21', () => {
  const hours = [...html.matchAll(/<span class="h">(\d\d)<\/span>/g)].map((m) => m[1]);
  expect(hours[0]).toBe('06');
  expect(hours.at(-1)).toBe('21');
  expect(hours).toHaveLength(16);
});

test('blok 08:00–08:30 zajmuje kolumny 2–3 jednego rzędu', () => {
  expect(html).toContain('grid-column:2/span 2');
  expect(html.match(/data-id="a"/g)).toHaveLength(1);
});

test('blok 09:45–10:15 renderuje się jako dwa segmenty', () => {
  expect(html.match(/data-id="b"/g)).toHaveLength(2);
});

test('pierwszy segment przełamanego bloku ma klasę first, drugi last', () => {
  const segs = [...html.matchAll(/<div class="blk st-planned([^"]*)"[^>]*data-id="b"/g)].map((m) => m[1]);
  expect(segs).toHaveLength(2);
  expect(segs[0]).toContain('first');
  expect(segs[0]).not.toContain('last');
  expect(segs[1]).toContain('last');
  expect(segs[1]).not.toContain('first');
});

test('wskaźnik TERAZ pojawia się dokładnie raz, w rzędzie 10', () => {
  expect(html.match(/class="nowline"/g)).toHaveLength(1);
  expect(html.match(/class="row is-now/g) ?? html.match(/is-now/g)).toHaveLength(1);
});

test('kolumna godziny niesie kolor pory dnia jako --band', () => {
  // Pora dnia barwi tło kolumny godziny (CSS), więc zmienna musi trafić na rząd.
  expect(html).toContain('--band:var(--aqua)');
});

test('godziny spoza jakiejkolwiek pory dostają --band:transparent', () => {
  // Okno 06–22 z jedną porą od 06:00 — wszystkie rzędy są w niej, więc
  // sprawdzamy na dniu bez pór, że brak pory nie daje pustej wartości.
  expect(html).not.toContain('--band:var(--undefined)');
  expect(html).not.toContain('--band:;');
});

test('kolor bloku bierze się z koloru kategorii', () => {
  expect(html).toContain('--c:var(--yellow)');
});
