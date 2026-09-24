import { test, expect } from 'vitest';
import { clampToMonth, nextOccurrence, describeRepeat } from '../src/lib/repeat';
import type { Repeat } from '../src/lib/repeat';

const daily: Repeat = { kind: 'daily' };
const monday: Repeat = { kind: 'weekly', weekday: 1 };
const third: Repeat = { kind: 'monthly', dayOfMonth: 3 };
const lastish: Repeat = { kind: 'monthly', dayOfMonth: 31 };
const nameday: Repeat = { kind: 'yearly', month: 9, dayOfMonth: 24 };

test('clampToMonth przycina do długości miesiąca', () => {
  expect(clampToMonth(2026, 2, 31)).toBe(28);
  expect(clampToMonth(2028, 2, 31)).toBe(29);
  expect(clampToMonth(2026, 4, 31)).toBe(30);
  expect(clampToMonth(2026, 1, 15)).toBe(15);
});

test('codziennie daje dzień następny', () => {
  expect(nextOccurrence(daily, '2026-09-24')).toBe('2026-09-25');
});

test('codziennie przechodzi przez koniec miesiąca i roku', () => {
  expect(nextOccurrence(daily, '2026-09-30')).toBe('2026-10-01');
  expect(nextOccurrence(daily, '2026-12-31')).toBe('2027-01-01');
});

test('co poniedziałek daje najbliższy poniedziałek po dacie', () => {
  expect(nextOccurrence(monday, '2026-09-24')).toBe('2026-09-28');
});

test('co poniedziałek w poniedziałek daje poniedziałek ZA tydzień', () => {
  expect(nextOccurrence(monday, '2026-09-28')).toBe('2026-10-05');
});

test('3. każdego miesiąca daje najbliższy trzeci', () => {
  expect(nextOccurrence(third, '2026-09-24')).toBe('2026-10-03');
  expect(nextOccurrence(third, '2026-10-01')).toBe('2026-10-03');
});

test('3. każdego miesiąca w dniu trzecim daje trzeci miesiąc później', () => {
  expect(nextOccurrence(third, '2026-10-03')).toBe('2026-11-03');
});

test('31. każdego miesiąca w lutym daje ostatni dzień lutego', () => {
  expect(nextOccurrence(lastish, '2026-01-31')).toBe('2026-02-28');
  expect(nextOccurrence(lastish, '2028-01-31')).toBe('2028-02-29');
});

test('co rok daje tę samą datę w roku następnym, gdy już minęła', () => {
  expect(nextOccurrence(nameday, '2026-09-24')).toBe('2027-09-24');
  expect(nextOccurrence(nameday, '2026-01-01')).toBe('2026-09-24');
});

test('co rok 29 lutego w roku nieprzestępnym przypada 28', () => {
  const leapday: Repeat = { kind: 'yearly', month: 2, dayOfMonth: 29 };
  expect(nextOccurrence(leapday, '2026-03-01')).toBe('2027-02-28');
});

test('opisy wzorców są po polsku', () => {
  expect(describeRepeat(daily)).toBe('codziennie');
  expect(describeRepeat(monday)).toBe('co poniedziałek');
  expect(describeRepeat({ kind: 'weekly', weekday: 0 })).toBe('co niedzielę');
  expect(describeRepeat(third)).toBe('3. każdego miesiąca');
  expect(describeRepeat(nameday)).toBe('co rok 24 wrz');
});
