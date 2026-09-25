import { test, expect } from 'vitest';
import { normalize, bandAt, DEFAULT_DAY, uid } from '../src/lib/model';
import type { Band } from '../src/lib/types';

const T = '2026-09-24';
const X = [{ id: 'x', name: 'X', icon: 'circle', color: 'red', parent: null }];

test('normalize: brak stanu daje domyślne kategorie, pory dnia, dzień i wersję bieżącą', () => {
  const s = normalize(null, T);
  expect(s.v).toBe(6);
  expect(s.today).toBe(T);
  expect(s.items).toEqual([]);
  expect(s.cats.length).toBeGreaterThan(0);
  expect(s.day.start).toBe(6);
  expect(s.day.end).toBe(22);
  expect(s.day.bands.length).toBeGreaterThan(0);
});

test('normalize: śmieci dają czysty stan domyślny', () => {
  for (const junk of [undefined, 0, 'tekst', [], { v: 99 }, { v: 6 }, { v: 5 }]) {
    const s = normalize(junk, T);
    expect(s.v).toBe(6);
    expect(s.items).toEqual([]);
  }
});

test('normalize: migracja v1 przesuwa q z bazy 06:00 na bazę północy i idzie do v6', () => {
  const s = normalize(
    {
      v: 1,
      cats: X,
      blocks: [
        { id: 'a', day: T, q: 16, len: 2, cat: 'x', title: '', status: 'confirmed', created: 0 },
      ],
    },
    T,
  );
  expect(s.v).toBe(6);
  expect(s.items).toEqual([
    { id: 'a', text: '', created: 0, cat: 'x', state: { tag: 'today-task', done: true, slot: 40 } },
  ]);
});

test('normalize: v2 i v3 przechodzą przez wszystkie wersje do v6', () => {
  for (const v of [2, 3]) {
    const s = normalize(
      {
        v,
        cats: X,
        day: { start: 6, end: 22, bands: [] },
        blocks: [
          {
            id: 'b1',
            day: T,
            q: 32,
            len: 2,
            cat: 'x',
            title: 'Praca',
            status: 'planned',
            created: 0,
          },
        ],
      },
      T,
    );
    expect(s.v).toBe(6);
    expect(s.items).toHaveLength(1);
    expect(s.items[0]).toMatchObject({
      id: 'b1',
      text: 'Praca',
      state: { tag: 'today-task', slot: 32 },
    });
  }
});

test('normalize: znaczniki przeniesienia z v4 zamieniają się w zadania', () => {
  const s = normalize(
    {
      v: 4,
      cats: [],
      blocks: [],
      day: { start: 6, end: 22, bands: [] },
      items: [
        { id: 'a', day: T, text: 'X', type: 'migrated', created: 0, movedTo: '2026-09-25' },
        { id: 'c', day: T, text: 'Z', type: 'note', created: 0 },
      ],
    },
    T,
  );
  expect(s.items.map((i) => i.state.tag)).toEqual(['today-task', 'today-note']);
  expect(s.items.every((i) => !('movedTo' in i))).toBe(true);
});

test('normalize: uszkodzone ustawienia dnia i puste kategorie wracają do domyślnych', () => {
  const s = normalize(
    { v: 6, cats: [], day: { start: 22, end: 6, bands: [] }, today: T, items: [] },
    T,
  );
  expect(s.day.start).toBe(6);
  expect(s.cats.length).toBeGreaterThan(0);
});

test('normalize: v6 zachowuje swój dzień, a bez dnia dostaje podany', () => {
  expect(
    normalize({ v: 6, cats: X, day: DEFAULT_DAY, today: '2026-09-20', items: [] }, T).today,
  ).toBe('2026-09-20');
  expect(normalize({ v: 6, cats: X, day: DEFAULT_DAY, items: [] }, T).today).toBe(T);
});

test('normalize: v6 odrzuca pozycje bez stanu', () => {
  const s = normalize(
    {
      v: 6,
      cats: X,
      day: DEFAULT_DAY,
      today: T,
      items: [{ id: 'a', text: 'A', state: { tag: 'today-note' } }, { id: 'b', text: 'B' }, null],
    },
    T,
  );
  expect(s.items.map((i) => i.id)).toEqual(['a']);
});

test('normalize: DEFAULT_DAY i domyślne kategorie nie są współdzielone', () => {
  const a = normalize(null, T);
  const b = normalize(null, T);
  a.day.bands.push({ id: 'zzz', name: 'Test', from: 12, color: 'red' });
  a.cats[0]!.name = 'Zmienione';
  a.day.start = 3;
  expect(a.day.bands.length).not.toBe(b.day.bands.length);
  expect(b.cats[0]!.name).not.toBe('Zmienione');
  expect(DEFAULT_DAY.start).toBe(6);
});

test('uid: kolejne wywołania dają różne identyfikatory', () => {
  const seen = new Set(Array.from({ length: 500 }, () => uid()));
  expect(seen.size).toBe(500);
});

const bands: Band[] = [
  { id: 'b1', name: 'Rano', from: 6, color: 'aqua' },
  { id: 'b2', name: 'Praca', from: 8, color: 'yellow' },
  { id: 'b3', name: 'Dom', from: 16, color: 'orange' },
];

test('bandAt: godzina wewnątrz pory zwraca tę porę', () => {
  expect(bandAt(bands, 10)?.id).toBe('b2');
  expect(bandAt(bands, 6)?.id).toBe('b1');
  expect(bandAt(bands, 16)?.id).toBe('b3');
});

test('bandAt: godzina przed pierwszą porą daje null', () => {
  expect(bandAt(bands, 5)).toBeNull();
});

test('bandAt: ostatnia pora trwa do końca doby', () => {
  expect(bandAt(bands, 23)?.id).toBe('b3');
});

test('bandAt: kolejność w tablicy nie ma znaczenia', () => {
  const shuffled = [bands[2]!, bands[0]!, bands[1]!];
  expect(bandAt(shuffled, 10)?.id).toBe('b2');
  expect(bandAt(shuffled, 23)?.id).toBe('b3');
});

test('bandAt: pusta lista pór daje null', () => {
  expect(bandAt([], 10)).toBeNull();
});
