import { test, expect } from 'vitest';
import { NO_CAT_COLOR, tokenStats } from '../src/lib/stats';
import type { Item } from '../src/lib/machine';
import type { Category } from '../src/lib/types';

const cats: Category[] = [
  { id: 'work', name: 'Praca', icon: 'laptop-code', color: 'yellow', parent: null },
  { id: 'work-a', name: 'Projekt A', icon: null, parent: 'work' },
  { id: 'rest', name: 'Odpoczynek', icon: 'mug-hot', color: 'aqua', parent: null },
];
const at = (id: string, slot: number, cat: string | undefined, done = false): Item => ({
  id,
  text: '',
  ...(cat ? { cat } : {}),
  state: { tag: 'today-task', done, slot },
});

test('zlicza kwanty wykonane i zaplanowane osobno; slot to zawsze dwa kwanty', () => {
  const s = tokenStats([at('a', 32, 'work', true), at('b', 40, 'rest')], cats, 24, 88);
  expect(s.done).toEqual(['yellow', 'yellow']);
  expect(s.plan).toEqual(['aqua', 'aqua']);
  expect(s.usedQ).toBe(4);
  expect(s.totalQ).toBe(64);
});

test('pomija wszystko, co nie jest dzisiejszym zadaniem ze slotem', () => {
  const others: Item[] = [
    { id: 'a', text: '', cat: 'work', state: { tag: 'today-task', done: true, slot: null } },
    { id: 'b', text: '', cat: 'work', state: { tag: 'past-done', day: '2026-09-23', slot: 32 } },
    {
      id: 'c',
      text: '',
      cat: 'work',
      state: { tag: 'backlog-task', when: { type: 'dateSlot', date: '2026-10-01', slot: 32 } },
    },
  ];
  expect(tokenStats(others, cats, 24, 88).usedQ).toBe(0);
});

test('część slotu poza oknem nie jest liczona', () => {
  expect(tokenStats([at('a', 23, 'work', true)], cats, 24, 88).usedQ).toBe(1);
});

test('pusty dzień daje zero z poprawną pojemnością', () => {
  const s = tokenStats([], cats, 24, 88);
  expect(s.usedQ).toBe(0);
  expect(s.totalQ).toBe(64);
  expect(s.perCat).toEqual([]);
});

test('kwanty są uporządkowane wg kolejności kategorii, nie czasu', () => {
  const s = tokenStats([at('a', 60, 'rest', true), at('b', 32, 'work', true)], cats, 24, 88);
  expect(s.done).toEqual(['yellow', 'yellow', 'aqua', 'aqua']);
});

test('podkategoria dziedziczy kolor i wchodzi do podsumowania rodzica', () => {
  const s = tokenStats([at('a', 32, 'work-a', true)], cats, 24, 88);
  expect(s.done).toEqual(['yellow', 'yellow']);
  expect(s.perCat).toEqual([
    { name: 'Praca', quanta: 2, kids: [{ name: 'Projekt A', quanta: 2 }] },
  ]);
});

test('podsumowanie liczy tylko wykonane, nie zaplanowane', () => {
  expect(tokenStats([at('a', 32, 'work')], cats, 24, 88).perCat).toEqual([]);
});

test('zadanie bez kategorii ma przygaszony kolor i nie wchodzi do podsumowania', () => {
  const s = tokenStats([at('a', 32, undefined, true)], cats, 24, 88);
  expect(s.done).toEqual([NO_CAT_COLOR, NO_CAT_COLOR]);
  expect(s.perCat).toEqual([]);
});

test('zwężone okno doby zmniejsza pojemność', () => {
  expect(tokenStats([], cats, 32, 64).totalQ).toBe(32);
});
