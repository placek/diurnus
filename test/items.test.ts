import { test, expect } from 'vitest';
import {
  MARK,
  cycleType,
  moveFree,
  placeAfter,
  removeById,
  retype,
  typeAfterEnter,
} from '../src/lib/items';
import { step } from '../src/lib/machine';
import type { Item, ItemState, Machine } from '../src/lib/machine';
import type { ItemType } from '../src/lib/types';

const it = (
  id: string,
  state: ItemState = { tag: 'today-task', done: false, slot: null },
): Item => ({ id, text: id, state });
const ids = (xs: Item[]) => xs.map((x) => x.id);

test('każdy typ ma dokładnie jeden znak, zgodny z bullet journal, bez powtórzeń', () => {
  const types: ItemType[] = ['task', 'done', 'note'];
  for (const t of types) expect([...MARK[t]], t).toHaveLength(1);
  expect([MARK.task, MARK.done, MARK.note]).toEqual(['·', '×', '–']);
});

test('removeById usuwa wskazaną pozycję i nic więcej', () => {
  expect(ids(removeById([it('1'), it('2')], '1'))).toEqual(['2']);
  expect(ids(removeById([it('1')], 'nie-ma'))).toEqual(['1']);
});

test('placeAfter stawia pozycję tuż za wskazaną, nie mutując wejścia', () => {
  const all = [it('1'), it('2'), it('x')];
  expect(ids(placeAfter(all, 'x', '1'))).toEqual(['1', 'x', '2']);
  expect(ids(all)).toEqual(['1', '2', 'x']);
  expect(ids(placeAfter(all, 'x', null))).toEqual(['1', '2', 'x']);
  expect(ids(placeAfter(all, 'x', 'nie-ma'))).toEqual(['1', '2', 'x']);
});

test('moveFree przestawia tylko wśród swobodnych dzisiejszych pozycji', () => {
  const back = it('b', { tag: 'backlog-task', when: null });
  const timed = it('t', { tag: 'today-task', done: false, slot: 36 });
  const all = [it('A'), back, timed, it('B'), it('C')];
  expect(ids(moveFree(all, 'A', 2))).toEqual(['b', 't', 'B', 'C', 'A']);
  expect(ids(moveFree(all, 'C', 0))).toEqual(['C', 'A', 'b', 't', 'B']);
  expect(ids(moveFree(all, 'A', 0))).toEqual(ids(all));
  expect(ids(moveFree(all, 't', 0))).toEqual(ids(all)); // ze slotem — miejsce to godzina
});

test('cycleType i typeAfterEnter', () => {
  expect(cycleType('task')).toBe('done');
  expect(cycleType('done')).toBe('note');
  expect(cycleType('note')).toBe('task');
  expect(cycleType('task', -1)).toBe('note');
  expect(typeAfterEnter('done')).toBe('task');
  expect(typeAfterEnter('note')).toBe('note');
});

test('retype: każda zamiana typu to ciąg dozwolonych przejść maszyny', () => {
  const HOURS = { q0: 24, q1: 88 };
  const states: Record<ItemType, ItemState> = {
    task: { tag: 'today-task', done: false, slot: null },
    done: { tag: 'today-task', done: true, slot: null },
    note: { tag: 'today-note' },
  };
  for (const from of ['task', 'done', 'note'] as ItemType[]) {
    for (const to of ['task', 'done', 'note'] as ItemType[]) {
      let m: Machine = { today: '2026-09-25', items: [it('a', states[from])] };
      for (const e of retype(m.items[0]!, to, 'c')) {
        const r = step(m, e, HOURS);
        if (!r.ok) throw new Error(`${from} → ${to}: ${e.type} odmówione`);
        m = r.machine;
      }
      expect(m.items[0]!.state, `${from} → ${to}`).toEqual(states[to]);
    }
  }
});
