import { test, expect } from 'vitest';
import { statusFor, acceptTarget, movedStatus, newBlock } from '../src/lib/actions';
import type { Block, Status } from '../src/lib/types';

const DAY = '2026-09-24';
const at = (h: number, mi = 0) => new Date(2026, 8, 24, h, mi).getTime();
const blk = (id: string, q: number, len: number, status: Status): Block => ({
  id, day: DAY, q, len, cat: 'work', title: '', status, created: 0,
});

test('statusFor: kwant w przeszłości tworzy blok wykonany', () => {
  expect(statusFor(DAY, 32, 2, at(12))).toBe('confirmed');
});

test('statusFor: kwant obejmujący teraz uruchamia blok', () => {
  expect(statusFor(DAY, 40, 2, at(10, 7))).toBe('active');
});

test('statusFor: kwant w przyszłości tworzy plan', () => {
  expect(statusFor(DAY, 60, 2, at(10, 7))).toBe('planned');
});

test('acceptTarget: sugestia z przeszłości staje się wykonana', () => {
  expect(acceptTarget(blk('a', 32, 2, 'suggested'), at(12))).toBe('confirmed');
});

test('acceptTarget: sugestia obejmująca teraz startuje', () => {
  expect(acceptTarget(blk('a', 40, 2, 'suggested'), at(10, 7))).toBe('active');
});

test('acceptTarget: sugestia z przyszłości trafia do planu', () => {
  expect(acceptTarget(blk('a', 60, 2, 'suggested'), at(10, 7))).toBe('planned');
});

test('newBlock: składa blok z podanym identyfikatorem i pustym tytułem', () => {
  const b = newBlock(DAY, 32, 2, 'work', 'planned', 1234, () => 'id-1');
  expect(b).toEqual({
    id: 'id-1', day: DAY, q: 32, len: 2, cat: 'work', title: '', status: 'planned', created: 1234,
  });
});

test('movedStatus: plan zostaje planem, nawet przeniesiony w przeszłość', () => {
  expect(movedStatus(blk('a', 60, 2, 'planned'), 32, at(12))).toBe('planned');
});

test('movedStatus: wykonanie zostaje wykonaniem, nawet przeniesione w przyszłość', () => {
  expect(movedStatus(blk('a', 32, 2, 'confirmed'), 60, at(12))).toBe('confirmed');
});

test('movedStatus: sugestia zostaje sugestią', () => {
  expect(movedStatus(blk('a', 60, 2, 'suggested'), 32, at(12))).toBe('suggested');
});

test('movedStatus: blok w toku przeniesiony w przyszłość staje się planem', () => {
  expect(movedStatus(blk('a', 40, 2, 'active'), 60, at(10, 7))).toBe('planned');
});

test('movedStatus: blok w toku przeniesiony w przeszłość jest wykonany', () => {
  expect(movedStatus(blk('a', 40, 2, 'active'), 32, at(10, 7))).toBe('confirmed');
});

test('movedStatus: blok w toku przesunięty tak, że wciąż obejmuje teraz, dalej trwa', () => {
  expect(movedStatus(blk('a', 40, 2, 'active'), 39, at(10, 7))).toBe('active');
});
