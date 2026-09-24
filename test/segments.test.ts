import { test, expect } from 'vitest';
import { segments } from '../src/lib/segments';

test('blok w całości wewnątrz godziny daje jeden segment z obydwoma rogami', () => {
  expect(segments(32, 2, 6, 22)).toEqual([{ hour: 8, from: 32, to: 34, first: true, last: true }]);
});

test('blok startujący o :45 przełamuje się na dwa segmenty', () => {
  expect(segments(35, 2, 6, 22)).toEqual([
    { hour: 8, from: 35, to: 36, first: true, last: false },
    { hour: 9, from: 36, to: 37, first: false, last: true },
  ]);
});

test('blok obejmujący pełną godzinę daje jeden segment', () => {
  expect(segments(32, 4, 6, 22)).toEqual([{ hour: 8, from: 32, to: 36, first: true, last: true }]);
});

test('blok dłuższy niż godzina daje segment środkowy bez zaokrągleń', () => {
  const s = segments(34, 6, 6, 22);
  expect(s).toHaveLength(2);
  expect(s[0]).toEqual({ hour: 8, from: 34, to: 36, first: true, last: false });
  expect(s[1]).toEqual({ hour: 9, from: 36, to: 40, first: false, last: true });
});

test('część bloku poza oknem doby jest pomijana', () => {
  expect(segments(23, 2, 6, 22)).toEqual([{ hour: 6, from: 24, to: 25, first: false, last: true }]);
});

test('blok w całości poza oknem nie daje segmentów', () => {
  expect(segments(8, 2, 6, 22)).toEqual([]);
});

test('blok sięgający poza koniec okna jest ucinany', () => {
  expect(segments(87, 2, 6, 22)).toEqual([{ hour: 21, from: 87, to: 88, first: true, last: false }]);
});
