import { test, expect } from 'vitest';
import { fromV5 } from '../src/lib/migrate';
import type { V5State } from '../src/lib/migrate';
import { violations } from '../src/lib/machine';

const T = '2026-09-25';
const Y = '2026-09-24';
const NEXT = '2026-10-01';
const HOURS = { q0: 24, q1: 88 };

type B = V5State['blocks'][number];
type I = V5State['items'][number];

const blk = (
  id: string,
  day: string,
  q: number,
  status: B['status'],
  over: Partial<B> = {},
): B => ({
  id,
  day,
  q,
  len: 2,
  cat: 'work',
  title: id.toUpperCase(),
  status,
  created: 1,
  ...over,
});
const itm = (id: string, day: string | null, over: Partial<I> = {}): I => ({
  id,
  day,
  text: id,
  type: 'task',
  created: 2,
  ...over,
});

const v5 = (blocks: B[], items: I[]): V5State => ({
  v: 5,
  cats: [],
  day: { start: 6, end: 22, bands: [] },
  blocks,
  items,
});

const migrate = (blocks: B[], items: I[]) => {
  const s = fromV5(v5(blocks, items), T);
  expect(violations({ today: s.today, items: s.items }, HOURS)).toEqual([]);
  return s;
};
const stateOf = (s: ReturnType<typeof fromV5>, id: string) =>
  s.items.find((i) => i.id === id)?.state;

test('wynik jest w v6 na podany dzień, z kategoriami i ustawieniami dnia', () => {
  const s = migrate([], []);
  expect(s.v).toBe(6);
  expect(s.today).toBe(T);
  expect(s.day.start).toBe(6);
});

test('dzisiejszy blok z pozycją zlewa się w jedno zadanie ze slotem i kategorią bloku', () => {
  const s = migrate(
    [blk('b', T, 36, 'planned', { cat: 'learn' })],
    [itm('i', T, { block: 'b', text: 'Czytać' })],
  );
  expect(s.items).toEqual([
    {
      id: 'i',
      text: 'Czytać',
      created: 2,
      cat: 'learn',
      state: { tag: 'today-task', done: false, slot: 36 },
    },
  ]);
});

test('pozycja powiązana bez tekstu bierze tytuł bloku', () => {
  const s = migrate([blk('b', T, 36, 'planned')], [itm('i', T, { block: 'b', text: '' })]);
  expect(s.items[0]!.text).toBe('B');
});

test('status bloku: potwierdzony jest wykonany, reszta otwarta', () => {
  const s = migrate(
    [
      blk('c', T, 30, 'confirmed'),
      blk('a', T, 40, 'active'),
      blk('p', T, 50, 'planned'),
      blk('s', T, 60, 'suggested'),
    ],
    [],
  );
  expect(stateOf(s, 'c')).toEqual({ tag: 'today-task', done: true, slot: 30 });
  expect(stateOf(s, 'a')).toEqual({ tag: 'today-task', done: false, slot: 40 });
  expect(stateOf(s, 'p')).toEqual({ tag: 'today-task', done: false, slot: 50 });
  expect(stateOf(s, 's')).toEqual({ tag: 'today-task', done: false, slot: 60 });
});

test('odrzucone sugestie przepadają', () => {
  expect(migrate([blk('d', T, 36, 'discarded')], []).items).toEqual([]);
});

test('sąsiednie bloki 15-minutowe: pierwszy zachowuje slot, drugi zostaje zadaniem bez slotu', () => {
  const s = migrate(
    [blk('a', T, 36, 'planned', { len: 1 }), blk('b', T, 37, 'planned', { len: 1 })],
    [],
  );
  expect(stateOf(s, 'a')).toEqual({ tag: 'today-task', done: false, slot: 36 });
  expect(stateOf(s, 'b')).toEqual({ tag: 'today-task', done: false, slot: null });
});

test('blok, który nie mieści 30 minut w dniu, traci slot', () => {
  expect(stateOf(migrate([blk('a', T, 87, 'planned', { len: 1 })], []), 'a')).toEqual({
    tag: 'today-task',
    done: false,
    slot: null,
  });
});

test('dzisiejsza pozycja z ukrytą godziną dostaje ją jako slot', () => {
  expect(stateOf(migrate([], [itm('i', T, { at: 40 })]), 'i')).toEqual({
    tag: 'today-task',
    done: false,
    slot: 40,
  });
});

test('dzisiejsze pozycje swobodne: zadanie, wykonane, notatka', () => {
  const s = migrate(
    [],
    [itm('t', T), itm('d', T, { type: 'done' }), itm('n', T, { type: 'note' })],
  );
  expect(stateOf(s, 't')).toEqual({ tag: 'today-task', done: false, slot: null });
  expect(stateOf(s, 'd')).toEqual({ tag: 'today-task', done: true, slot: null });
  expect(stateOf(s, 'n')).toEqual({ tag: 'today-note' });
});

test('przeszłość: wykonane i notatki zostają w swoim dniu', () => {
  const s = migrate(
    [blk('b', Y, 36, 'confirmed')],
    [itm('lb', Y, { block: 'b' }), itm('d', Y, { type: 'done' }), itm('n', Y, { type: 'note' })],
  );
  expect(stateOf(s, 'lb')).toEqual({ tag: 'past-done', day: Y, slot: 36 });
  expect(stateOf(s, 'd')).toEqual({ tag: 'past-done', day: Y, slot: null });
  expect(stateOf(s, 'n')).toEqual({ tag: 'past-note', day: Y });
});

test('przeszłość: otwarte zadania przechodzą do dziś bez slotu, jak o północy', () => {
  const s = migrate([], [itm('t', '2026-09-01', { at: 40 })]);
  expect(stateOf(s, 't')).toEqual({ tag: 'today-task', done: false, slot: null });
});

test('przeszłość: niepotwierdzone bloki przepadają razem z pozycją', () => {
  const s = migrate([blk('b', Y, 36, 'planned')], [itm('i', Y, { block: 'b' })]);
  expect(s.items).toEqual([]);
});

test('backlog: bez daty, z datą, z datą i godziną', () => {
  const s = migrate(
    [],
    [itm('a', null), itm('b', NEXT), itm('c', NEXT, { at: 40 }), itm('d', NEXT, { at: 87 })],
  );
  expect(stateOf(s, 'a')).toEqual({ tag: 'backlog-task', when: null });
  expect(stateOf(s, 'b')).toEqual({ tag: 'backlog-task', when: { type: 'date', date: NEXT } });
  expect(stateOf(s, 'c')).toEqual({
    tag: 'backlog-task',
    when: { type: 'dateSlot', date: NEXT, slot: 40 },
  });
  expect(stateOf(s, 'd')).toEqual({ tag: 'backlog-task', when: { type: 'date', date: NEXT } });
});

test('backlog: wzorzec zachowuje najbliższe wystąpienie', () => {
  const s = migrate([], [itm('r', null, { repeat: { kind: 'daily' }, nextOn: '2026-09-27' })]);
  expect(stateOf(s, 'r')).toEqual({
    tag: 'backlog-task',
    when: { type: 'recurring', rule: { kind: 'daily' }, slot: null, next: '2026-09-27' },
  });
});

test('backlog: wzorzec bez terminu dostaje najbliższy od jutra', () => {
  const s = migrate([], [itm('r', null, { repeat: { kind: 'daily' } })]);
  expect(stateOf(s, 'r')).toMatchObject({ when: { next: '2026-09-26' } });
});

test('backlog: notatka traci datę, wykonane idzie do dziś', () => {
  const s = migrate([], [itm('n', NEXT, { type: 'note' }), itm('d', null, { type: 'done' })]);
  expect(stateOf(s, 'n')).toEqual({ tag: 'backlog-note' });
  expect(stateOf(s, 'd')).toEqual({ tag: 'today-task', done: true, slot: null });
});

test('bloki bez pozycji dostają własną: dziś, przyszłość, przeszłość', () => {
  const s = migrate(
    [
      blk('t', T, 36, 'planned'),
      blk('f', NEXT, 40, 'planned'),
      blk('p', Y, 40, 'confirmed'),
      blk('x', Y, 44, 'planned'),
    ],
    [],
  );
  expect(stateOf(s, 't')).toEqual({ tag: 'today-task', done: false, slot: 36 });
  expect(stateOf(s, 'f')).toEqual({
    tag: 'backlog-task',
    when: { type: 'dateSlot', date: NEXT, slot: 40 },
  });
  expect(stateOf(s, 'p')).toEqual({ tag: 'past-done', day: Y, slot: 40 });
  expect(stateOf(s, 'x')).toBeUndefined();
  expect(s.items.find((i) => i.id === 't')).toMatchObject({ text: 'T', cat: 'work', created: 1 });
});

test('kolejność pozycji swobodnych zostaje zachowana', () => {
  const s = migrate([], [itm('c', T), itm('a', T), itm('b', T)]);
  expect(s.items.map((i) => i.id)).toEqual(['c', 'a', 'b']);
});
