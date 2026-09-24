import { test, expect } from 'vitest';
import { itemTone } from '../src/lib/tone';
import type { Block, Item, Status } from '../src/lib/types';

const DAY = '2026-09-24';
const NOW = new Date(2026, 8, 24, 12, 0).getTime();

const item = (over: Partial<Item> = {}): Item =>
  ({ id: 'i', day: DAY, text: '', type: 'task', created: 0, ...over });

const block = (status: Status, q: number): Block =>
  ({ id: 'b', day: DAY, q, len: 2, cat: 'work', title: '', status, created: 0 });

test('pozycja bez bloku: nierobiona jest nadchodząca, zrobiona ukończona', () => {
  expect(itemTone(item(), undefined, NOW)).toBe('incoming');
  expect(itemTone(item({ type: 'done' }), undefined, NOW)).toBe('done');
});

test('notatka nie ma stanu — nie jest ani nadchodząca, ani ukończona', () => {
  expect(itemTone(item({ type: 'note' }), undefined, NOW)).toBe('note');
});

test('blok w toku jest aktywny', () => {
  expect(itemTone(item({ block: 'b' }), block('active', 44), NOW)).toBe('active');
});

test('blok potwierdzony jest ukończony, także gdy jeszcze trwa', () => {
  expect(itemTone(item({ block: 'b' }), block('confirmed', 44), NOW)).toBe('done');
  expect(itemTone(item({ block: 'b' }), block('confirmed', 80), NOW)).toBe('done');
});

test('blok zaplanowany w przyszłości jest nadchodzący', () => {
  // 12:00 teraz, blok o 20:00
  expect(itemTone(item({ block: 'b' }), block('planned', 80), NOW)).toBe('incoming');
});

test('blok zaplanowany, którego czas minął, jest przegapiony', () => {
  // 12:00 teraz, blok o 08:00 wciąż w planie
  expect(itemTone(item({ block: 'b' }), block('planned', 32), NOW)).toBe('missed');
});

test('sugestia zachowuje się jak plan', () => {
  expect(itemTone(item({ block: 'b' }), block('suggested', 32), NOW)).toBe('missed');
  expect(itemTone(item({ block: 'b' }), block('suggested', 80), NOW)).toBe('incoming');
});

test('blok trwający właśnie teraz nie jest jeszcze przegapiony', () => {
  // 12:00 teraz, blok 12:00–12:30 w planie: czas się nie skończył
  expect(itemTone(item({ block: 'b' }), block('planned', 48), NOW)).toBe('incoming');
});

test('pozycja wskazująca na nieistniejący blok traktowana jest jak swobodna', () => {
  expect(itemTone(item({ block: 'znikniety' }), undefined, NOW)).toBe('incoming');
});
