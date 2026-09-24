import { test, expect } from 'vitest';
import { buildCats, moveUp, dayPreview, duplicateBandStart } from '../src/lib/settings';
import type { Band, Block, Category } from '../src/lib/types';
import type { DraftCategory } from '../src/lib/settings';

const cat = (id: string, name: string, parent: string | null = null, extra: Partial<DraftCategory> = {}): DraftCategory =>
  ({ id, name, icon: null, parent, ...(parent ? {} : { color: 'yellow' }), ...extra });

const blk = (cat: string): Block =>
  ({ id: 'b-' + cat, day: '2026-09-24', q: 32, len: 2, cat, title: '', status: 'confirmed', created: 0 });

test('buildCats: przycina nazwy i uzupełnia brakujący kolor kategorii głównej', () => {
  const out = buildCats([cat('a', '  Praca  ')], new Set(['a']), [], []);
  expect(out).toEqual([{ id: 'a', name: 'Praca', icon: null, parent: null, color: 'yellow' }]);
});

test('buildCats: nowa kategoria bez nazwy jest odrzucana', () => {
  const out = buildCats([cat('a', 'Praca'), cat('nowa', '  ')], new Set(['a']), [], []);
  expect(out).toHaveLength(1);
});

test('buildCats: istniejąca kategoria z wyczyszczoną nazwą zachowuje starą nazwę', () => {
  const orig: Category[] = [{ id: 'a', name: 'Praca', icon: null, parent: null, color: 'yellow' }];
  const out = buildCats([cat('a', '   ')], new Set(['a']), [], orig);
  expect(out?.[0]?.name).toBe('Praca');
});

test('buildCats: usunięta i nieużywana kategoria znika', () => {
  const out = buildCats([cat('a', 'Praca'), cat('b', 'Nauka', null, { _del: true })], new Set(['a', 'b']), [], []);
  expect(out?.map((c) => c.id)).toEqual(['a']);
});

test('buildCats: usunięta ale używana w historii jest archiwizowana, nie kasowana', () => {
  const out = buildCats(
    [cat('a', 'Praca'), cat('b', 'Nauka', null, { _del: true })],
    new Set(['a', 'b']),
    [blk('b')],
    [],
  );
  expect(out?.map((c) => [c.id, c.archived])).toEqual([
    ['a', undefined],
    ['b', true],
  ]);
});

test('buildCats: usunięcie rodzica usuwa też dzieci', () => {
  const out = buildCats(
    [cat('a', 'Praca', null, { _del: true }), cat('a1', 'Projekt', 'a'), cat('z', 'Inna')],
    new Set(['a', 'a1', 'z']),
    [],
    [],
  );
  expect(out?.map((c) => c.id)).toEqual(['z']);
});

test('buildCats: rodzic używanego dziecka też jest archiwizowany, nie kasowany', () => {
  const out = buildCats(
    [cat('a', 'Praca', null, { _del: true }), cat('a1', 'Projekt', 'a'), cat('z', 'Inna')],
    new Set(['a', 'a1', 'z']),
    [blk('a1')],
    [],
  );
  expect(out?.find((c) => c.id === 'a')?.archived).toBe(true);
  expect(out?.find((c) => c.id === 'a1')?.archived).toBe(true);
});

test('buildCats: bloki discarded nie chronią kategorii przed usunięciem', () => {
  const discarded: Block = { ...blk('b'), status: 'discarded' };
  const out = buildCats(
    [cat('a', 'Praca'), cat('b', 'Nauka', null, { _del: true })],
    new Set(['a', 'b']),
    [discarded],
    [],
  );
  expect(out?.map((c) => c.id)).toEqual(['a']);
});

test('buildCats: usunięcie wszystkich kategorii głównych jest odrzucane', () => {
  expect(buildCats([cat('a', 'Praca', null, { _del: true })], new Set(['a']), [], [])).toBeNull();
});

test('buildCats: same kategorie archiwalne też nie wystarczą', () => {
  expect(buildCats([cat('a', 'Praca', null, { archived: true })], new Set(['a']), [], [])).toBeNull();
});

test('moveUp: kategoria główna przesuwa się razem z dziećmi', () => {
  const d = [cat('a', 'A'), cat('a1', 'A1', 'a'), cat('b', 'B'), cat('b1', 'B1', 'b')];
  expect(moveUp(d, 'b').map((c) => c.id)).toEqual(['b', 'b1', 'a', 'a1']);
});

test('moveUp: pierwsza pozycja się nie rusza', () => {
  const d = [cat('a', 'A'), cat('b', 'B')];
  expect(moveUp(d, 'a').map((c) => c.id)).toEqual(['a', 'b']);
});

test('moveUp: podkategoria przesuwa się tylko wśród rodzeństwa', () => {
  const d = [cat('a', 'A'), cat('a1', 'A1', 'a'), cat('a2', 'A2', 'a')];
  expect(moveUp(d, 'a2').map((c) => c.id)).toEqual(['a', 'a2', 'a1']);
});

const bands: Band[] = [
  { id: 'r', name: 'Rano', from: 6, color: 'aqua' },
  { id: 'p', name: 'Praca', from: 8, color: 'yellow' },
];

test('dayPreview: dzieli dobę na odcinki wg pór dnia', () => {
  expect(dayPreview({ start: 6, end: 12, bands })).toEqual([
    { from: 6, to: 8, band: bands[0] },
    { from: 8, to: 12, band: bands[1] },
  ]);
});

test('dayPreview: godziny przed pierwszą porą tworzą odcinek bez pory', () => {
  const p = dayPreview({ start: 4, end: 10, bands });
  expect(p[0]).toEqual({ from: 4, to: 6, band: null });
});

test('dayPreview: pory poza zakresem dnia nie tworzą odcinków', () => {
  const p = dayPreview({ start: 6, end: 8, bands });
  expect(p).toEqual([{ from: 6, to: 8, band: bands[0] }]);
});

test('duplicateBandStart wykrywa dwie pory o tej samej godzinie', () => {
  expect(duplicateBandStart(bands)).toBe(false);
  expect(duplicateBandStart([...bands, { id: 'x', name: 'X', from: 8, color: 'red' }])).toBe(true);
});
