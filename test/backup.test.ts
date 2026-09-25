import { test, expect } from 'vitest';
import { bundleExport, bundleParse } from '../src/lib/backup';
import { normalize } from '../src/lib/model';

const T = '2026-09-24';
const sample = () =>
  normalize(
    {
      v: 2,
      cats: [{ id: 'work', name: 'Praca', icon: 'laptop-code', color: 'yellow', parent: null }],
      blocks: [
        {
          id: 'a1',
          day: '2026-09-24',
          q: 32,
          len: 2,
          cat: 'work',
          title: 'Spotkanie',
          status: 'confirmed',
          created: 1758700000000,
        },
      ],
      day: { start: 6, end: 22, bands: [{ id: 'b1', name: 'Praca', from: 8, color: 'yellow' }] },
    },
    T,
  );

test('pełny obieg zachowuje pozycje, kategorie, dzień i preferencje', () => {
  const back = bundleParse(
    bundleExport(sample(), { theme: 'dark', seenHelp: true, notify: false }, 0),
  );
  expect(back.state.items).toEqual(sample().items);
  expect(back.state.items).toHaveLength(1);
  expect(back.state.today).toBe(T);
  expect(back.state.cats).toEqual(sample().cats);
  expect(back.state.day.start).toBe(6);
  expect(back.prefs.theme).toBe('dark');
});

test('eksport zapisuje datę z podanego zegara, nie z systemowego', () => {
  const o = JSON.parse(
    bundleExport(
      sample(),
      { theme: 'auto', seenHelp: true, notify: false },
      Date.UTC(2026, 8, 24, 10),
    ),
  );
  expect(o.exported).toBe('2026-09-24T10:00:00.000Z');
});

test('import przepuszcza starszą wersję schematu przez normalize', () => {
  const old = JSON.stringify({
    magic: 'gridday.backup',
    state: {
      v: 1,
      cats: [{ id: 'x', name: 'X', icon: 'circle', color: 'red', parent: null }],
      blocks: [
        {
          id: 'a',
          day: '2026-09-24',
          q: 0,
          len: 2,
          cat: 'x',
          title: '',
          status: 'confirmed',
          created: 0,
        },
      ],
    },
  });
  const back = bundleParse(old);
  expect(back.state.v).toBe(6);
  // Kwant 0 z bazy 06:00 to 06:00 od północy, czyli kwant 24.
  expect(back.state.items.find((i) => i.id === 'a')!.state).toMatchObject({ slot: 24 });
});

test('nie-JSON daje czytelny błąd', () => {
  expect(() => bundleParse('<html>Zaloguj się</html>')).toThrow(/poprawnym JSON/);
});

test('obcy JSON jest odrzucany po znaczniku', () => {
  expect(() => bundleParse('{"foo":1}')).toThrow(/kopia zapasowa Diurnus/);
});

test('kopia bez pozycji ani bloków jest odrzucana', () => {
  expect(() => bundleParse('{"magic":"gridday.backup","state":{"v":2}}')).toThrow(
    /nie zawiera danych/,
  );
});

test('brak preferencji w pliku daje domyślne, z pominiętym ekranem powitalnym', () => {
  const back = bundleParse('{"magic":"gridday.backup","state":{"v":2,"cats":[],"blocks":[]}}');
  expect(back.prefs.theme).toBe('auto');
  expect(back.prefs.seenHelp).toBe(true);
});

test('pusty plik daje błąd o JSON-ie, a nie wyjątek', () => {
  expect(() => bundleParse('')).toThrow(/poprawnym JSON/);
});

test('tablica JSON zamiast obiektu jest odrzucana', () => {
  expect(() => bundleParse('[1,2,3]')).toThrow(/kopia zapasowa Diurnus/);
});

test('eksport jest czytelny dla człowieka (wcięcia)', () => {
  expect(bundleExport(sample(), { theme: 'auto', seenHelp: true, notify: false }, 0)).toContain(
    '\n  "magic"',
  );
});

test('kopia zapisana pod starą nazwą projektu nadal się wczytuje', () => {
  // Zmiana nazwy nie może unieważnić plików, które ktoś już pobrał.
  const old = JSON.stringify({
    magic: 'gridday.backup',
    state: { v: 5, cats: [], blocks: [], items: [], day: { start: 6, end: 22, bands: [] } },
  });
  expect(() => bundleParse(old)).not.toThrow();
});

test('nowa kopia nosi nową nazwę', () => {
  const o = JSON.parse(bundleExport(sample(), { theme: 'auto', seenHelp: true, notify: false }, 0));
  expect(o.magic).toBe('diurnus.backup');
});
