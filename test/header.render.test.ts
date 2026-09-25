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

/** Aplikacja pokazuje dzień wyliczony z zegara — podróż w czasie idzie przez `now`. */
const atDay = (day: string, hour = 12) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y!, m! - 1, d!, hour).getTime();
};

let htmlToday = '';
let htmlOther = '';
let htmlWide = '';

beforeAll(async () => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: fakeStorage({
      'diurnus.v1': {
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

  const { app, ui } = await import('../src/state.svelte');
  const { render } = await import('svelte/server');
  const Header = (await import('../src/components/Header.svelte')).default;

  // Nagłówek dnia stoi w pasku tylko na wąskim ekranie; na szerokim jest
  // w sekcji dziś (patrz layout.mount.test.ts).
  ui.narrow = true;
  app.now = atDay(DAY);
  htmlToday = render(Header).body;

  app.now = atDay(shiftDay(DAY, -3));
  htmlOther = render(Header).body;

  ui.narrow = false;
  app.now = atDay(DAY);
  htmlWide = render(Header).body;
});

test('na szerokim ekranie pasek nie niesie daty, zegara ani paska postępu — tylko narzędzia', () => {
  expect(htmlWide).not.toContain('id="date"');
  expect(htmlWide).not.toContain('id="clock"');
  expect(htmlWide).not.toContain('id="pips"');
  expect(htmlWide).toContain('aria-label="Ustawienia"');
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

test('nagłówek nie ma już strzałek nawigacji po dniach', () => {
  expect(htmlToday).not.toContain('Poprzedni dzień');
  expect(htmlToday).not.toContain('Następny dzień');
});

test('narzędzia stoją w kolejności: pomoc, motyw, ustawienia (czyli od prawej: ustawienia, motyw, pomoc)', () => {
  const order = [...htmlToday.matchAll(/aria-label="(Pomoc|Motyw|Ustawienia)"/g)].map((m) => m[1]);
  expect(order).toEqual(['Pomoc', 'Motyw', 'Ustawienia']);
});

test('nie ma już przycisku sugestii z zeszłego tygodnia', () => {
  expect(htmlToday).not.toContain('Sugestie');
});

test('data i zegar stoją w środkowej kolumnie, nad paskiem postępu', () => {
  const center = /<div class="hdr-center">([\s\S]*?)<div class="tools/.exec(htmlToday)?.[1] ?? '';
  expect(center).toContain('id="date"');
  expect(center).toContain('id="clock"');
  expect(center).toContain('id="pips"');
  // Kolejność w źródle jest kolejnością na ekranie: data, potem pasek.
  expect(center.indexOf('id="date"')).toBeLessThan(center.indexOf('id="pips"'));
});

test('data nie jest przyciskiem ani niczym klikalnym', () => {
  expect(htmlToday).toMatch(/<span id="date"/);
  expect(htmlToday).not.toMatch(/<button[^>]*id="date"/);
});

test('narzędzia mają po lewej dystans równoważący', () => {
  expect(htmlToday).toContain('class="hdr-side"');
});

test('link do kodu na GitHubie stoi tuż przed pomocą i otwiera się w nowej karcie', () => {
  const link = /<a[^>]*href="https:\/\/github\.com\/placek\/diurnus"[^>]*>/.exec(htmlToday)?.[0] ?? '';
  expect(link).toContain('target="_blank"');
  expect(link).toContain('rel="noopener noreferrer"');
  expect(link).toContain('aria-label="Kod na GitHubie"');
  const tools = /<div class="tools hdr-side">([\s\S]*)<\/div>/.exec(htmlToday)?.[1] ?? '';
  const labels = [...tools.matchAll(/aria-label="([^"]+)"/g)].map((m) => m[1]);
  expect(labels.slice(-4)).toEqual(['Kod na GitHubie', 'Pomoc', 'Motyw', 'Ustawienia']);
  // Ikona istnieje w zestawie — nie litera zastępcza.
  expect(htmlToday).not.toMatch(/class="ic ltr"[^>]*>GH</);
});

test('link do GitHuba jest też na szerokim ekranie', () => {
  expect(htmlWide).toContain('href="https://github.com/placek/diurnus"');
});
