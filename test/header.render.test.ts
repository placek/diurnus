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

test('nagłówek nie pokazuje już licznika w postaci n/32', () => {
  expect(htmlToday).not.toContain('id="count"');
  expect(htmlToday).not.toMatch(/\/\s*32/);
  expect(htmlToday).not.toContain('w planie');
});

test('data jest pełna: dzień tygodnia, liczba i nazwa miesiąca', () => {
  const label = /id="date"[^>]*>([^<]+)</.exec(htmlToday)?.[1]?.trim() ?? '';
  expect(label).toMatch(/^(poniedziałek|wtorek|środa|czwartek|piątek|sobota|niedziela), \d{1,2} \p{L}+$/u);
});

test('wersaliki są zadaniem CSS, nie treści — czytnik słyszy naturalny zapis', () => {
  const label = /id="date"[^>]*>([^<]+)</.exec(htmlToday)?.[1]?.trim() ?? '';
  expect(label).toBe(label.toLocaleLowerCase('pl-PL'));
});

test('zegar pokazuje godzinę i minutę obok daty', () => {
  const clock = /id="clock"[^>]*>([^<]+)</.exec(htmlToday)?.[1]?.trim() ?? '';
  expect(clock).toMatch(/^\d{2}:\d{2}$/);
});

test('dzisiejsza data dostaje klasę is-today, inna nie', () => {
  expect(htmlToday).toContain('is-today');
  expect(htmlOther).not.toContain('is-today');
});

test('narzędzia stoją w kolejności: pomoc, motyw, ustawienia (czyli od prawej: ustawienia, motyw, pomoc)', () => {
  const order = [...htmlToday.matchAll(/aria-label="(Pomoc|Motyw|Ustawienia)"/g)].map((m) => m[1]);
  expect(order).toEqual(['Pomoc', 'Motyw', 'Ustawienia']);
});

test('nie ma już przycisku sugestii z zeszłego tygodnia', () => {
  expect(htmlToday).not.toContain('Sugestie');
});
