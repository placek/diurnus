import { test, expect } from 'vitest';
import { tokenStats } from '../src/lib/stats';
import type { Block, Category, Status } from '../src/lib/types';

const cats: Category[] = [
  { id: 'work', name: 'Praca', icon: 'laptop-code', color: 'yellow', parent: null },
  { id: 'work-a', name: 'Projekt A', icon: null, parent: 'work' },
  { id: 'rest', name: 'Odpoczynek', icon: 'mug-hot', color: 'aqua', parent: null },
];
const blk = (id: string, q: number, len: number, cat: string, status: Status): Block => ({
  id, day: '2026-09-24', q, len, cat, title: '', status, created: 0,
});

test('zlicza kwanty wykonane i zaplanowane osobno', () => {
  const s = tokenStats(
    [blk('a', 32, 2, 'work', 'confirmed'), blk('b', 40, 4, 'rest', 'planned')],
    '2026-09-24', cats, 24, 88,
  );
  expect(s.done).toEqual(['yellow', 'yellow']);
  expect(s.plan).toEqual(['aqua', 'aqua', 'aqua', 'aqua']);
  expect(s.usedQ).toBe(6);
  expect(s.totalQ).toBe(64);
});

test('blok active liczy się jako wykonany', () => {
  expect(tokenStats([blk('a', 32, 2, 'work', 'active')], '2026-09-24', cats, 24, 88).done).toHaveLength(2);
});

test('bloki discarded i z innego dnia są pomijane', () => {
  expect(tokenStats([blk('a', 32, 2, 'work', 'discarded')], '2026-09-24', cats, 24, 88).usedQ).toBe(0);
});

test('część bloku poza oknem nie jest liczona', () => {
  const s = tokenStats([blk('a', 22, 4, 'work', 'confirmed')], '2026-09-24', cats, 24, 88);
  expect(s.usedQ).toBe(2);
});

test('pusty dzień daje zero z poprawną pojemnością', () => {
  const s = tokenStats([], '2026-09-24', cats, 24, 88);
  expect(s.usedQ).toBe(0);
  expect(s.totalQ).toBe(64);
  expect(s.perCat).toEqual([]);
});

test('kwanty są uporządkowane wg kolejności kategorii, nie czasu', () => {
  const s = tokenStats(
    [blk('a', 60, 2, 'rest', 'confirmed'), blk('b', 32, 2, 'work', 'confirmed')],
    '2026-09-24', cats, 24, 88,
  );
  expect(s.done).toEqual(['yellow', 'yellow', 'aqua', 'aqua']);
});

test('podkategoria dziedziczy kolor i wchodzi do podsumowania rodzica', () => {
  const s = tokenStats([blk('a', 32, 4, 'work-a', 'confirmed')], '2026-09-24', cats, 24, 88);
  expect(s.done).toEqual(['yellow', 'yellow', 'yellow', 'yellow']);
  expect(s.perCat).toEqual([{ name: 'Praca', quanta: 4, kids: [{ name: 'Projekt A', quanta: 4 }] }]);
});

test('podsumowanie liczy tylko wykonane, nie zaplanowane', () => {
  const s = tokenStats([blk('a', 32, 2, 'work', 'planned')], '2026-09-24', cats, 24, 88);
  expect(s.perCat).toEqual([]);
});

test('zwężone okno doby zmniejsza pojemność', () => {
  expect(tokenStats([], '2026-09-24', cats, 32, 64).totalQ).toBe(32);
});
