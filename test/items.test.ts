import { test, expect } from 'vitest';
import { MARK } from '../src/lib/items';
import type { ItemType } from '../src/lib/types';

test('każdy typ ma dokładnie jeden znak', () => {
  const types: ItemType[] = ['task', 'done', 'note', 'scheduled', 'migrated'];
  for (const t of types) {
    expect(MARK[t], t).toBeTruthy();
    expect([...MARK[t]], t).toHaveLength(1);
  }
});

test('znaki są zgodne z notacją bullet journal', () => {
  expect(MARK.task).toBe('·');
  expect(MARK.done).toBe('×');
  expect(MARK.note).toBe('–');
  expect(MARK.scheduled).toBe('<');
  expect(MARK.migrated).toBe('>');
});

test('żadne dwa typy nie dzielą znaku', () => {
  const marks = Object.values(MARK);
  expect(new Set(marks).size).toBe(marks.length);
});

import { dayItems, insertAfter, removeById, newItem } from '../src/lib/items';
import type { Item } from '../src/lib/types';

const it = (id: string, day: string, text = '', type: ItemType = 'task'): Item =>
  ({ id, day, text, type, created: 0 });

const A = '2026-09-24';
const B = '2026-09-25';

test('dayItems zwraca tylko pozycje danego dnia, w kolejności tablicy', () => {
  const all = [it('1', A), it('2', B), it('3', A)];
  expect(dayItems(all, A).map((x) => x.id)).toEqual(['1', '3']);
});

test('dayItems na pustej tablicy daje pustą listę', () => {
  expect(dayItems([], A)).toEqual([]);
});

test('insertAfter wstawia zaraz za wskazaną pozycją', () => {
  const all = [it('1', A), it('2', A)];
  expect(insertAfter(all, '1', it('x', A)).map((x) => x.id)).toEqual(['1', 'x', '2']);
});

test('insertAfter z null wstawia na koniec listy DNIA, nie tablicy', () => {
  const all = [it('1', A), it('2', B)];
  expect(dayItems(insertAfter(all, null, it('x', A)), A).map((x) => x.id)).toEqual(['1', 'x']);
});

test('insertAfter przy przeplecionych dniach nie gubi kolejności dnia', () => {
  const all = [it('1', A), it('2', B), it('3', A)];
  const got = insertAfter(all, '1', it('x', A));
  expect(got.map((x) => x.id)).toEqual(['1', 'x', '2', '3']);
  expect(dayItems(got, A).map((x) => x.id)).toEqual(['1', 'x', '3']);
});

test('insertAfter z nieznanym id dokłada na koniec zamiast gubić pozycję', () => {
  expect(insertAfter([it('1', A)], 'nie-ma', it('x', A)).map((x) => x.id)).toEqual(['1', 'x']);
});

test('insertAfter nie mutuje wejścia', () => {
  const all = [it('1', A)];
  insertAfter(all, '1', it('x', A));
  expect(all).toHaveLength(1);
});

test('removeById usuwa wskazaną pozycję i zostawia resztę', () => {
  expect(removeById([it('1', A), it('2', A)], '1').map((x) => x.id)).toEqual(['2']);
});

test('removeById z nieznanym id nie zmienia niczego', () => {
  expect(removeById([it('1', A)], 'nie-ma').map((x) => x.id)).toEqual(['1']);
});

test('newItem tworzy pozycję z pustym tekstem i podanym typem', () => {
  expect(newItem(A, 'note', 99, () => 'id-1')).toEqual({
    id: 'id-1', day: A, text: '', type: 'note', created: 99,
  });
});

import { CYCLE, cycleType, typeAfterEnter, migrateTo } from '../src/lib/items';

test('Tab cykluje wyłącznie znaczniki opisujące stan pozycji tutaj', () => {
  expect(CYCLE).toEqual(['task', 'done', 'note']);
  expect(cycleType('task')).toBe('done');
  expect(cycleType('done')).toBe('note');
  expect(cycleType('note')).toBe('task');
});

test('Shift+Tab cykluje w drugą stronę', () => {
  expect(cycleType('task', -1)).toBe('note');
  expect(cycleType('note', -1)).toBe('done');
});

test('cykl z typu przeniesionego wraca do zadania', () => {
  expect(cycleType('migrated')).toBe('task');
  expect(cycleType('scheduled')).toBe('task');
  expect(cycleType('migrated', -1)).toBe('task');
});

test('Enter dziedziczy typ zadania i notatki', () => {
  expect(typeAfterEnter('task')).toBe('task');
  expect(typeAfterEnter('note')).toBe('note');
});

test('Enter po stanie końcowym daje zwykłe zadanie', () => {
  expect(typeAfterEnter('done')).toBe('task');
  expect(typeAfterEnter('scheduled')).toBe('task');
  expect(typeAfterEnter('migrated')).toBe('task');
});

test('migrateTo dopisuje kopię na koniec listy dnia docelowego', () => {
  const all = [{ ...it('1', A), text: 'Zadzwonić' }];
  expect(dayItems(migrateTo(all, '1', B, 5, () => 'kopia'), B)).toEqual([
    { id: 'kopia', day: B, text: 'Zadzwonić', type: 'task', created: 5 },
  ]);
});

test('migrateTo oznacza pozycję źródłową i zapisuje dzień docelowy', () => {
  const src = migrateTo([it('1', A)], '1', B, 5, () => 'kopia').find((x) => x.id === '1')!;
  expect(src.type).toBe('migrated');
  expect(src.movedTo).toBe(B);
});

test('migrateTo na jutro daje typ migrated, na inny dzień scheduled', () => {
  expect(migrateTo([it('1', A)], '1', B, 5, () => 'k', 'migrated').find((x) => x.id === '1')!.type).toBe('migrated');
  expect(migrateTo([it('1', A)], '1', '2026-10-01', 5, () => 'k', 'scheduled').find((x) => x.id === '1')!.type).toBe('scheduled');
});

test('migrateTo wykonane dwa razy nie dopisuje drugiej kopii', () => {
  const once = migrateTo([it('1', A)], '1', B, 5, () => 'k1');
  const twice = migrateTo(once, '1', B, 6, () => 'k2');
  expect(dayItems(twice, B)).toHaveLength(1);
  expect(twice).toEqual(once);
});

test('migrateTo z nieznanym id nie zmienia niczego', () => {
  const all = [it('1', A)];
  expect(migrateTo(all, 'nie-ma', B, 5, () => 'k')).toEqual(all);
});

test('migrateTo nie mutuje wejścia', () => {
  const all = [it('1', A)];
  migrateTo(all, '1', B, 5, () => 'k');
  expect(all[0]!.type).toBe('task');
});
