import { test, expect } from 'vitest';
import { PERICOPES, isoWeek, pericopeOf } from '../src/lib/pericope';
import { shiftDay } from '../src/lib/time';

/* Perykopa Jana na tydzień: numer 1–45 z tygodnia ISO 8601. */

test('tydzień ISO: od poniedziałku, pierwszy ma pierwszy czwartek roku', () => {
  expect(isoWeek('2026-10-27')).toEqual({ year: 2026, week: 44 });
  expect(isoWeek('2026-01-01')).toEqual({ year: 2026, week: 1 }); // czwartek
  expect(isoWeek('2025-12-29')).toEqual({ year: 2026, week: 1 }); // poniedziałek tego tygodnia
  expect(isoWeek('2026-12-31')).toEqual({ year: 2026, week: 53 });
  expect(isoWeek('2027-01-03')).toEqual({ year: 2026, week: 53 }); // niedziela
  expect(isoWeek('2027-01-04')).toEqual({ year: 2027, week: 1 });
  expect(isoWeek('2021-01-01')).toEqual({ year: 2020, week: 53 }); // piątek
});

test('numer zmienia się w poniedziałek, a przez cały tydzień jest ten sam', () => {
  // 2026-10-26 to poniedziałek tygodnia 44.
  const week = Array.from({ length: 7 }, (_, i) => pericopeOf(shiftDay('2026-10-26', i)).number);
  expect(week).toEqual([44, 44, 44, 44, 44, 44, 44]);
  expect(pericopeOf('2026-10-25').number).toBe(43); // niedziela przed nim
  expect(pericopeOf('2026-11-02').number).toBe(45);
});

test('po 45. tygodniu cykl zaczyna się od nowa', () => {
  expect(pericopeOf('2026-11-09')).toEqual({ week: 46, number: 1 });
  expect(pericopeOf('2026-12-31')).toEqual({ week: 53, number: 8 });
  expect(pericopeOf('2027-01-04')).toEqual({ week: 1, number: 1 });
});

test('każdy dzień kilku lat daje numer z zakresu 1–45', () => {
  for (let d = '2024-01-01'; d < '2030-01-01'; d = shiftDay(d, 1)) {
    const n = pericopeOf(d).number;
    expect(n >= 1 && n <= PERICOPES, d).toBe(true);
  }
});
