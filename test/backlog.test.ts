import { test, expect } from 'vitest';
import { isBacklog, backlogItems, sortBacklog, lastDayWithItems, carryOver } from '../src/lib/backlog';
import type { Item } from '../src/lib/types';

const T = '2026-09-24';
const item = (id: string, day: string | null, over: Partial<Item> = {}): Item =>
  ({ id, day, text: '', type: 'task', created: 0, ...over });

test('isBacklog: bez daty, w przyszłości — tak; dziś i w przeszłości — nie', () => {
  expect(isBacklog(item('a', null), T)).toBe(true);
  expect(isBacklog(item('a', '2026-09-25'), T)).toBe(true);
  expect(isBacklog(item('a', T), T)).toBe(false);
  expect(isBacklog(item('a', '2026-09-23'), T)).toBe(false);
});

test('backlogItems zbiera przyszłe i bezdatowe', () => {
  const all = [item('a', T), item('b', '2026-09-25'), item('c', null), item('d', '2026-09-01')];
  expect(backlogItems(all, T).map((i) => i.id)).toEqual(['b', 'c']);
});

test('sortBacklog: najpierw daty rosnąco, potem bezdatowe w kolejności tablicy', () => {
  const all = [
    item('bez1', null),
    item('pozno', '2026-10-01'),
    item('bez2', null),
    item('wczesnie', '2026-09-25'),
  ];
  expect(sortBacklog(all).map((i) => i.id)).toEqual(['wczesnie', 'pozno', 'bez1', 'bez2']);
});

test('sortBacklog: ten sam dzień rozstrzyga godzina', () => {
  const all = [item('pozniej', '2026-09-25', { at: 40 }), item('wczesniej', '2026-09-25', { at: 24 })];
  expect(sortBacklog(all).map((i) => i.id)).toEqual(['wczesniej', 'pozniej']);
});

test('sortBacklog: pozycja powtarzalna sortuje się po nextOn', () => {
  const all = [
    item('stala', null, { repeat: { kind: 'daily' }, nextOn: '2026-09-25' }),
    item('pozniejsza', '2026-09-30'),
  ];
  expect(sortBacklog(all).map((i) => i.id)).toEqual(['stala', 'pozniejsza']);
});

test('lastDayWithItems znajduje najpóźniejszy dzień przed podanym', () => {
  const all = [item('a', '2026-09-20'), item('b', '2026-09-22'), item('c', T)];
  expect(lastDayWithItems(all, T)).toBe('2026-09-22');
});

test('lastDayWithItems pomija pozycje bez daty i z przyszłości', () => {
  const all = [item('a', null), item('b', '2026-10-01')];
  expect(lastDayWithItems(all, T)).toBeNull();
});

test('carryOver przenosi niedokończone zadania na dziś', () => {
  const all = [item('a', '2026-09-22'), item('b', T)];
  expect(carryOver(all, T, '2026-09-22').find((i) => i.id === 'a')!.day).toBe(T);
});

test('carryOver stawia przeniesione na początku tablicy', () => {
  const all = [item('juz-dzis', T), item('wczorajsze', '2026-09-22')];
  expect(carryOver(all, T, '2026-09-22').map((i) => i.id)).toEqual(['wczorajsze', 'juz-dzis']);
});

test('carryOver pomija wykonane, notatki i pozycje powiązane z blokiem', () => {
  const all = [
    item('zrobione', '2026-09-22', { type: 'done' }),
    item('notatka', '2026-09-22', { type: 'note' }),
    item('blok', '2026-09-22', { block: 'b1' }),
    item('zadanie', '2026-09-22'),
  ];
  expect(carryOver(all, T, '2026-09-22').filter((i) => i.day === T).map((i) => i.id)).toEqual(['zadanie']);
});

test('carryOver wykonany dwa razy nic nie zmienia', () => {
  const all = [item('a', '2026-09-22')];
  const once = carryOver(all, T, '2026-09-22');
  expect(carryOver(once, T, '2026-09-22')).toEqual(once);
});

test('carryOver bez dnia źródłowego nic nie robi', () => {
  const all = [item('a', T)];
  expect(carryOver(all, T, null)).toEqual(all);
});
