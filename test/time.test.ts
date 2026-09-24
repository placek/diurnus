import { describe, test, expect } from 'vitest';
import { dayKey, today, qTime, shiftDay, fmtQ, rel, nowQ, fmtDur } from '../src/lib/time';

const D = (y: number, m: number, d: number, h = 0, mi = 0) => new Date(y, m - 1, d, h, mi).getTime();

describe('dayKey / shiftDay', () => {
  test('dayKey formatuje z zerami wiodącymi', () => {
    expect(dayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  test('shiftDay przechodzi przez granicę miesiąca', () => {
    expect(shiftDay('2026-01-31', 1)).toBe('2026-02-01');
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28');
  });

  test('shiftDay przechodzi przez granicę roku', () => {
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01');
  });

  test('shiftDay o tydzień wstecz', () => {
    expect(shiftDay('2026-09-24', -7)).toBe('2026-09-17');
  });
});

describe('qTime / fmtQ', () => {
  test('kwant 32 to 08:00 czasu lokalnego', () => {
    expect(qTime('2026-09-24', 32)).toBe(D(2026, 9, 24, 8));
  });

  test('kwant 0 to północ, 95 to 23:45', () => {
    expect(qTime('2026-09-24', 0)).toBe(D(2026, 9, 24, 0));
    expect(fmtQ('2026-09-24', 95)).toBe('23:45');
  });

  test('kwant 96 wyświetla się jako 24:00', () => {
    expect(fmtQ('2026-09-24', 96)).toBe('24:00');
  });

  test('w dobie zmiany czasu (23 h) kwant 32 to nadal 08:00 ściany', () => {
    expect(new Date(qTime('2026-03-29', 32)).getHours()).toBe(8);
    expect(fmtQ('2026-03-29', 32)).toBe('08:00');
  });

  test('w dobie powrotu czasu zimowego (25 h) kwant 32 to nadal 08:00', () => {
    expect(fmtQ('2026-10-25', 32)).toBe('08:00');
  });
});

describe('rel', () => {
  const now = D(2026, 9, 24, 10, 7);

  test('blok zakończony przed chwilą to przeszłość', () => {
    expect(rel('2026-09-24', 36, 40, now)).toBe('past');
  });

  test('blok obejmujący teraz to teraźniejszość', () => {
    expect(rel('2026-09-24', 40, 42, now)).toBe('now');
  });

  test('blok przyszły to przyszłość', () => {
    expect(rel('2026-09-24', 44, 46, now)).toBe('future');
  });

  test('blok kończący się dokładnie teraz to przeszłość', () => {
    expect(rel('2026-09-24', 38, 40, D(2026, 9, 24, 10))).toBe('past');
  });

  test('inny dzień liczy się względem tego samego zegara', () => {
    expect(rel('2026-09-23', 40, 42, now)).toBe('past');
    expect(rel('2026-09-25', 40, 42, now)).toBe('future');
  });
});

describe('nowQ', () => {
  test('zwraca kwant bieżącej chwili dla dzisiejszego dnia', () => {
    expect(nowQ('2026-09-24', D(2026, 9, 24, 10, 7))).toBe(40);
  });

  test('zwraca null dla innego dnia', () => {
    expect(nowQ('2026-09-23', D(2026, 9, 24, 10, 7))).toBeNull();
  });

  test('kwadrans zaokrągla w dół', () => {
    expect(nowQ('2026-09-24', D(2026, 9, 24, 10, 59))).toBe(43);
  });
});

describe('fmtDur', () => {
  test('minuty, godziny i mieszane', () => {
    expect(fmtDur(30)).toBe('30 min');
    expect(fmtDur(60)).toBe('1 h');
    expect(fmtDur(90)).toBe('1 h 30 min');
  });
});

test('today zwraca klucz dzisiejszego dnia', () => {
  expect(today()).toBe(dayKey(new Date()));
});
