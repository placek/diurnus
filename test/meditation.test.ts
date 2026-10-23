import { test, expect } from 'vitest';
import { PLAN_LENGTH, dayOfYear, meditationOf, roman } from '../src/lib/meditation';

/*
 * Plan medytacji porannych: rozdział „De Imitatione Christi" i Psalm na dzień
 * roku — indeks (dzień_roku − 1) mod 114, księga po księdze.
 */

const ref = (day: string) => {
  const m = meditationOf(day);
  return `${roman(m.liber)},${roman(m.caput)} Ps ${m.psalm}`;
};

test('114 rozdziałów w czterech księgach', () => {
  expect(PLAN_LENGTH).toBe(114);
  expect(ref('2026-01-25')).toBe('I,XXV Ps 50 (51)'); // ostatni z I
  expect(ref('2026-01-26')).toBe('II,I Ps 45 (46)');
  expect(ref('2026-02-06')).toBe('II,XII Ps 43 (44)');
  expect(ref('2026-02-07')).toBe('III,I Ps 84 (85)');
  expect(ref('2026-04-06')).toBe('III,LIX Ps 61 (62)'); // dzień 96
  expect(ref('2026-04-07')).toBe('IV,I Ps 42 (43)');
  expect(ref('2026-04-24')).toBe('IV,XVIII Ps 130 (131)'); // dzień 114
});

test('dzień roku wybiera rozdział; cykl wraca z tym samym Psalmem', () => {
  expect(dayOfYear('2026-01-01')).toBe(1);
  expect(dayOfYear('2026-12-31')).toBe(365);
  expect(dayOfYear('2028-12-31')).toBe(366);
  expect(meditationOf('2026-01-01')).toEqual({
    liber: 1,
    caput: 1,
    psalm: '1 (1)',
    theme: 'marność świata, dwie drogi',
  });
  // Dzień 115 zaczyna drugi cykl.
  expect(ref('2026-04-25')).toBe('I,I Ps 1 (1)');
  // Dni 195–211 z planu (już wygenerowane medytacje): 195 → III, XLIV.
  expect(ref('2026-07-14')).toBe('III,XLIV Ps 130 (131)');
  expect(ref('2026-07-30')).toBe('IV,I Ps 42 (43)'); // dzień 211
  // Dzień 343 zaczyna czwarty, niepełny cykl.
  expect(ref('2026-12-09')).toBe('I,I Ps 1 (1)');
  // Rok przestępny: dzień 366 to Liber I, Caput XXIV.
  expect(ref('2028-12-31')).toBe('I,XXIV Ps 142 (143)');
});

test('liczby rzymskie dla ksiąg i rozdziałów', () => {
  expect([1, 4, 9, 14, 19, 24, 40, 44, 49, 59].map(roman)).toEqual([
    'I',
    'IV',
    'IX',
    'XIV',
    'XIX',
    'XXIV',
    'XL',
    'XLIV',
    'XLIX',
    'LIX',
  ]);
});
