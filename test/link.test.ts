import { test, expect } from 'vitest';
import { reconcile, linkedItems, freeItems, blockOfItem, slotFree } from '../src/lib/link';
import type { Block, Item, Status } from '../src/lib/types';

const A = '2026-09-24';
const B = '2026-09-25';

const blk = (id: string, q: number, day = A, status: Status = 'planned', title = ''): Block =>
  ({ id, day, q, len: 2, cat: 'work', title, status, created: 0 });

const item = (id: string, day = A, over: Partial<Item> = {}): Item =>
  ({ id, day, text: '', type: 'task', created: 0, ...over });

let n = 0;
const ids = () => `gen-${++n}`;
const reset = () => (n = 0);

test('reconcile tworzy pozycję dla bloku, który jej nie ma', () => {
  reset();
  expect(reconcile([], [blk('b1', 32)], A, 7, ids)).toEqual([
    { id: 'gen-1', day: A, text: '', type: 'task', created: 7, block: 'b1' },
  ]);
});

test('reconcile przenosi tytuł bloku do tekstu nowej pozycji', () => {
  reset();
  expect(reconcile([], [blk('b1', 32, A, 'planned', 'Spotkanie')], A, 0, ids)[0]!.text).toBe('Spotkanie');
});

test('reconcile jest idempotentny — drugie wywołanie nic nie dodaje', () => {
  reset();
  const blocks = [blk('b1', 32)];
  const once = reconcile([], blocks, A, 0, ids);
  expect(reconcile(once, blocks, A, 0, ids)).toEqual(once);
});

test('reconcile usuwa pozycję osieroconą po skasowanym bloku', () => {
  expect(reconcile([item('i1', A, { block: 'znikniety' })], [], A, 0, ids)).toEqual([]);
});

test('reconcile nie rusza pozycji swobodnych', () => {
  const items = [item('i1', A, { text: 'Notatka' })];
  expect(reconcile(items, [], A, 0, ids)).toEqual(items);
});

test('reconcile pomija bloki discarded i usuwa ich pozycje', () => {
  reset();
  const blocks = [blk('b1', 32, A, 'discarded')];
  expect(reconcile([], blocks, A, 0, ids)).toEqual([]);
  expect(reconcile([item('i1', A, { block: 'b1' })], blocks, A, 0, ids)).toEqual([]);
});

test('reconcile z day=null obejmuje wszystkie dni', () => {
  reset();
  const got = reconcile([], [blk('b1', 32, A), blk('b2', 40, B)], null, 0, ids);
  expect(got.map((i) => i.day).sort()).toEqual([A, B]);
});

test('reconcile z konkretnym dniem nie tworzy pozycji dla innych dni', () => {
  reset();
  expect(reconcile([], [blk('b2', 40, B)], A, 0, ids)).toEqual([]);
});

test('reconcile z konkretnym dniem nie usuwa osieroconych pozycji z innych dni', () => {
  const items = [item('i1', B, { block: 'znikniety' })];
  expect(reconcile(items, [], A, 0, ids)).toEqual(items);
});

test('linkedItems sortuje po godzinie bloku, nie po kolejności tablicy', () => {
  const blocks = [blk('b1', 40), blk('b2', 32)];
  const items = [item('i1', A, { block: 'b1' }), item('i2', A, { block: 'b2' })];
  expect(linkedItems(items, blocks, A).map((i) => i.id)).toEqual(['i2', 'i1']);
});

test('linkedItems pomija pozycje bez bloku', () => {
  const items = [item('i1', A), item('i2', A, { block: 'b1' })];
  expect(linkedItems(items, [blk('b1', 32)], A).map((i) => i.id)).toEqual(['i2']);
});

test('freeItems zwraca pozycje bez bloku w kolejności tablicy', () => {
  const items = [item('i1', A), item('i2', A, { block: 'b1' }), item('i3', A)];
  expect(freeItems(items, A).map((i) => i.id)).toEqual(['i1', 'i3']);
});

test('blockOfItem znajduje blok albo zwraca undefined', () => {
  const blocks = [blk('b1', 32)];
  expect(blockOfItem(blocks, item('i1', A, { block: 'b1' }))?.id).toBe('b1');
  expect(blockOfItem(blocks, item('i1', A))).toBeUndefined();
  expect(blockOfItem(blocks, item('i1', A, { block: 'nie-ma' }))).toBeUndefined();
});

test('slotFree wykrywa wolne i zajęte miejsce', () => {
  const blocks = [blk('b1', 32, B)];
  expect(slotFree(blocks, B, 40, 2)).toBe(true);
  expect(slotFree(blocks, B, 32, 2)).toBe(false);
});

test('slotFree wykrywa nałożenie częściowe z obu stron', () => {
  const blocks = [blk('b1', 32, B)];
  expect(slotFree(blocks, B, 33, 2)).toBe(false);
  expect(slotFree(blocks, B, 31, 2)).toBe(false);
  expect(slotFree(blocks, B, 34, 2)).toBe(true);
  expect(slotFree(blocks, B, 30, 2)).toBe(true);
});

test('slotFree ignoruje bloki innych dni i bloki discarded', () => {
  expect(slotFree([blk('b1', 32, A)], B, 32, 2)).toBe(true);
  expect(slotFree([blk('b1', 32, B, 'discarded')], B, 32, 2)).toBe(true);
});

test('slotFree potrafi pominąć wskazany blok — przy przenoszeniu go samego', () => {
  expect(slotFree([blk('b1', 32, B)], B, 32, 2, 'b1')).toBe(true);
});
