import { test, expect } from 'vitest';
import { normalize, bandAt, DEFAULT_DAY, uid } from '../src/lib/model';
import type { Band } from '../src/lib/types';

test('normalize: brak stanu daje domyślne kategorie, pory dnia i wersję bieżącą', () => {
  const s = normalize(null);
  expect(s.v).toBe(3);
  expect(s.blocks).toEqual([]);
  expect(s.cats.length).toBeGreaterThan(0);
  expect(s.day.start).toBe(6);
  expect(s.day.end).toBe(22);
  expect(s.day.bands.length).toBeGreaterThan(0);
});

test('normalize: migracja v1 przesuwa q z bazy 06:00 na bazę północy', () => {
  const s = normalize({
    v: 1,
    cats: [{ id: 'x', name: 'X', icon: 'circle', color: 'red', parent: null }],
    blocks: [
      { id: 'a', day: '2026-09-24', q: 0, len: 2, cat: 'x', title: '', status: 'confirmed', created: 0 },
    ],
  });
  expect(s.v).toBe(3);
  expect(s.blocks[0]!.q).toBe(24);
});

test('normalize: uszkodzone ustawienia dnia wracają do domyślnych, bloki zostają', () => {
  const s = normalize({
    v: 2,
    cats: [{ id: 'x', name: 'X', icon: 'circle', color: 'red', parent: null }],
    blocks: [
      { id: 'a', day: '2026-09-24', q: 32, len: 2, cat: 'x', title: '', status: 'planned', created: 0 },
    ],
    day: { start: 22, end: 6, bands: [] },
  });
  expect(s.day.start).toBe(6);
  expect(s.blocks).toHaveLength(1);
});

test('normalize: bloki poza zwężonym oknem doby NIE są kasowane', () => {
  const s = normalize({
    v: 2,
    cats: [{ id: 'x', name: 'X', icon: 'circle', color: 'red', parent: null }],
    blocks: [
      { id: 'a', day: '2026-09-24', q: 28, len: 2, cat: 'x', title: '', status: 'confirmed', created: 0 },
    ],
    day: { start: 8, end: 16, bands: [{ id: 'b', name: 'P', from: 8, color: 'yellow' }] },
  });
  expect(s.blocks).toHaveLength(1);
  expect(s.blocks[0]!.q).toBe(28);
});

test('normalize: pusta lista kategorii wraca do domyślnych', () => {
  const s = normalize({ v: 2, cats: [], blocks: [], day: DEFAULT_DAY });
  expect(s.cats.length).toBeGreaterThan(0);
});

test('normalize: śmieci dają czysty stan domyślny', () => {
  for (const junk of [undefined, 0, 'tekst', [], { v: 99 }]) {
    const s = normalize(junk);
    expect(s.v).toBe(3);
    expect(s.blocks).toEqual([]);
  }
});

test('normalize: DEFAULT_DAY nie jest współdzielony między wywołaniami', () => {
  const a = normalize(null);
  const b = normalize(null);
  a.day.bands.push({ id: 'zzz', name: 'Test', from: 12, color: 'red' });
  expect(a.day.bands.length).not.toBe(b.day.bands.length);
});

test('normalize: domyślne kategorie też nie są współdzielone', () => {
  const a = normalize(null);
  const b = normalize(null);
  a.cats[0]!.name = 'Zmienione';
  expect(b.cats[0]!.name).not.toBe('Zmienione');
});

test('normalize: eksportowany DEFAULT_DAY nie daje się zmutować przez stan', () => {
  const a = normalize(null);
  a.day.start = 3;
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

test('normalize: stan v2 dostaje pustą listę notatek i wersję 3', () => {
  const s = normalize({
    v: 2,
    cats: [{ id: 'x', name: 'X', icon: 'circle', color: 'red', parent: null }],
    blocks: [{ id: 'a', day: '2026-09-24', q: 32, len: 2, cat: 'x', title: '', status: 'planned', created: 0 }],
    day: { start: 6, end: 22, bands: [] },
  });
  expect(s.v).toBe(3);
  expect(s.items).toEqual([]);
  expect(s.blocks).toHaveLength(1);
  expect(s.cats).toHaveLength(1);
});

test('normalize: migracja v1 → v3 przechodzi przez obie wersje', () => {
  const s = normalize({
    v: 1,
    cats: [{ id: 'x', name: 'X', icon: 'circle', color: 'red', parent: null }],
    blocks: [{ id: 'a', day: '2026-09-24', q: 0, len: 2, cat: 'x', title: '', status: 'confirmed', created: 0 }],
  });
  expect(s.v).toBe(3);
  expect(s.blocks[0]!.q).toBe(24);
  expect(s.items).toEqual([]);
});

test('normalize: stan v3 bez tablicy items dostaje pustą', () => {
  const s = normalize({ v: 3, cats: [], blocks: [], day: { start: 6, end: 22, bands: [] } });
  expect(s.items).toEqual([]);
});

test('normalize: istniejące notatki przechodzą nietknięte', () => {
  const items = [{ id: 'i1', day: '2026-09-24', text: 'Notka', type: 'note', created: 1 }];
  const s = normalize({ v: 3, cats: [], blocks: [], day: { start: 6, end: 22, bands: [] }, items });
  expect(s.items).toEqual(items);
});

test('normalize: brak stanu daje pustą listę notatek', () => {
  expect(normalize(null).items).toEqual([]);
});
