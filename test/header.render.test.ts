import { test, expect, beforeAll } from 'vitest';
import { shiftDay, today } from '../src/lib/time';

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

// Dzień budowany z today(), żeby asercja o klasie is-today nie zależała od daty
// uruchomienia testów.
const DAY = today();
let htmlToday = '';
let htmlOther = '';

beforeAll(async () => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: fakeStorage({
      'gridday.v1': {
        v: 2,
        cats: [{ id: 'work', name: 'Praca', icon: 'laptop-code', color: 'yellow', parent: null }],
        day: { start: 6, end: 22, bands: [] },
        blocks: [
          { id: 'a', day: DAY, q: 32, len: 4, cat: 'work', title: '', status: 'confirmed', created: 0 },
          { id: 'b', day: DAY, q: 40, len: 2, cat: 'work', title: '', status: 'planned', created: 0 },
        ],
      },
    }),
    configurable: true,
  });

  const { app } = await import('../src/state.svelte');
  const { render } = await import('svelte/server');
  const Header = (await import('../src/components/Header.svelte')).default;

  app.viewDay = DAY;
  htmlToday = render(Header).body;

  app.viewDay = shiftDay(DAY, -3);
  htmlOther = render(Header).body;
});

test('pasek ma jeden pip na każde pół godziny widocznego okna', () => {
  expect(htmlToday.match(/class="pip"/g)).toHaveLength(32); // 16 h × 2
});

test('licznik liczy w półgodzinach: 4 kwanty wykonane to 2 z 32', () => {
  expect(htmlToday).toContain('<b>2</b>/32');
});

test('zaplanowane półgodziny pokazują się osobno', () => {
  expect(htmlToday).toContain('+1 w planie');
});

test('dzień bez bloków nie pokazuje członu o planie', () => {
  expect(htmlOther).not.toContain('w planie');
  expect(htmlOther).toContain('<b>0</b>/32');
});

test('etykieta daty jest polska i pozbawiona przecinka po dniu tygodnia', () => {
  const label = /id="date"[^>]*>([^<]+)</.exec(htmlToday)?.[1]?.trim() ?? '';
  expect(label).not.toBe('');
  expect(label).not.toContain(',');
});

test('dzisiejsza data dostaje klasę is-today, inna nie', () => {
  expect(htmlToday).toContain('is-today');
  expect(htmlOther).not.toContain('is-today');
});

test('wszystkie cztery narzędzia są w nagłówku', () => {
  for (const label of ['Sugestie z zeszłego tygodnia', 'Ustawienia', 'Motyw', 'Pomoc']) {
    expect(htmlToday, label).toContain(`aria-label="${label}"`);
  }
});
