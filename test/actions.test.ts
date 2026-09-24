import { test, expect } from 'vitest';
import { statusFor, acceptTarget, newBlock, suggestionsFromLastWeek } from '../src/lib/actions';
import type { Block, Status } from '../src/lib/types';

const DAY = '2026-09-24';
const at = (h: number, mi = 0) => new Date(2026, 8, 24, h, mi).getTime();
const blk = (id: string, q: number, len: number, status: Status, day = DAY, cat = 'work'): Block => ({
  id, day, q, len, cat, title: '', status, created: 0,
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

const lastWeek = (q: number, len: number, cat = 'work') =>
  blk(`s-${q}`, q, len, 'confirmed', '2026-09-17', cat);

test('sugestie: kopiuje potwierdzone bloki sprzed tygodnia jako sugestie', () => {
  const got = suggestionsFromLastWeek([lastWeek(32, 2)], DAY, 24, 88, 0, (i) => `n${i}`);
  expect(got).toHaveLength(1);
  expect(got[0]).toMatchObject({ day: DAY, q: 32, len: 2, cat: 'work', status: 'suggested' });
});

test('sugestie: pomija sloty już zajęte w docelowym dniu', () => {
  const got = suggestionsFromLastWeek(
    [lastWeek(32, 2), blk('x', 33, 2, 'planned')], DAY, 24, 88, 0, (i) => `n${i}`,
  );
  expect(got).toEqual([]);
});

test('sugestie: pomija sloty poza widocznym oknem doby', () => {
  expect(suggestionsFromLastWeek([lastWeek(8, 2)], DAY, 24, 88, 0, (i) => `n${i}`)).toEqual([]);
  expect(suggestionsFromLastWeek([lastWeek(90, 2)], DAY, 24, 88, 0, (i) => `n${i}`)).toEqual([]);
});

test('sugestie: nie wskrzesza sugestii wcześniej odrzuconej w tym samym slocie', () => {
  const got = suggestionsFromLastWeek(
    [lastWeek(32, 2), blk('d', 32, 2, 'discarded')], DAY, 24, 88, 0, (i) => `n${i}`,
  );
  expect(got).toEqual([]);
});

test('sugestie: odrzucenie innej kategorii w tym slocie nie blokuje tej', () => {
  const got = suggestionsFromLastWeek(
    [lastWeek(32, 2, 'rest'), blk('d', 32, 2, 'discarded')], DAY, 24, 88, 0, (i) => `n${i}`,
  );
  expect(got).toHaveLength(1);
});

test('sugestie: bloki niepotwierdzone sprzed tygodnia nie są kopiowane', () => {
  const src = blk('s', 32, 2, 'planned', '2026-09-17');
  expect(suggestionsFromLastWeek([src], DAY, 24, 88, 0, (i) => `n${i}`)).toEqual([]);
});

test('sugestie: dwie kopie nie nachodzą na siebie nawzajem', () => {
  const got = suggestionsFromLastWeek(
    [lastWeek(32, 2), lastWeek(33, 2)], DAY, 24, 88, 0, (i) => `n${i}`,
  );
  expect(got).toHaveLength(1); // druga trafia w slot zajęty przez pierwszą
});

test('sugestie: brak potwierdzonych bloków sprzed tygodnia daje pustą listę', () => {
  expect(suggestionsFromLastWeek([], DAY, 24, 88, 0, (i) => `n${i}`)).toEqual([]);
});
