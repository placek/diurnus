import { test, expect, describe } from 'vitest';
import {
  advance,
  canonical,
  describeRule,
  firstFrom,
  formatRRule,
  fromLegacy,
  parseRRule,
  pin,
  plural,
  preview,
} from '../src/lib/rrule';
import type { LegacyRepeat, RRule } from '../src/lib/rrule';

const rule = (s: string): RRule => {
  const r = parseRRule(s);
  if (!r.ok) throw new Error(r.error);
  return r.rule;
};
const dates = (s: string, anchor: string, n = 6) => preview(rule(s), anchor, n);

describe('odczyt i zapis', () => {
  test.each([
    ['FREQ=DAILY'],
    ['FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE'],
    ['FREQ=MONTHLY;BYDAY=-1FR'],
    ['FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1'],
    ['FREQ=YEARLY;BYMONTH=9;BYMONTHDAY=24'],
    ['FREQ=DAILY;COUNT=10'],
    ['FREQ=WEEKLY;BYDAY=SA;UNTIL=20261231'],
    ['FREQ=MONTHLY;BYMONTHDAY=28,29,30;BYSETPOS=-1'],
    ['FREQ=WEEKLY;BYDAY=SU;WKST=SU'],
  ])('%s przechodzi odczyt i zapis bez zmian', (s) => {
    expect(formatRRule(rule(s))).toBe(s);
  });

  test('zapis jest kanoniczny: kolejność części, listy posortowane, domyślne pominięte', () => {
    expect(formatRRule(rule('rrule:byday=we,mo,mo;interval=1;freq=weekly'))).toBe(
      'FREQ=WEEKLY;BYDAY=MO,WE',
    );
    expect(formatRRule(rule('FREQ=MONTHLY;BYMONTHDAY=15,1,-1;WKST=MO'))).toBe(
      'FREQ=MONTHLY;BYMONTHDAY=-1,1,15',
    );
    expect(formatRRule(rule('FREQ=YEARLY;UNTIL=20271231T235959Z'))).toBe(
      'FREQ=YEARLY;UNTIL=20271231',
    );
  });

  test.each([
    ['', /pusta/],
    ['BYDAY=MO', /brak FREQ/],
    ['FREQ=HOURLY', /nie jest obsługiwane/],
    ['FREQ=DAILY;BYHOUR=9', /BYHOUR nie jest obsługiwane/],
    ['FREQ=YEARLY;BYWEEKNO=20', /BYWEEKNO/],
    ['FREQ=DAILY;FREQ=WEEKLY', /powtórzone/],
    ['FREQ=DAILY;INTERVAL=0', /INTERVAL/],
    ['FREQ=DAILY;COUNT=3;UNTIL=20261231', /COUNT i UNTIL/],
    ['FREQ=WEEKLY;BYDAY=2MO', /tylko przy MONTHLY i YEARLY/],
    ['FREQ=MONTHLY;BYDAY=6MO', /najwyżej 5/],
    ['FREQ=WEEKLY;BYMONTHDAY=1', /nie łączy się z WEEKLY/],
    ['FREQ=DAILY;BYSETPOS=1', /wymaga/],
    ['FREQ=MONTHLY;BYMONTHDAY=32', /BYMONTHDAY/],
    ['FREQ=MONTHLY;BYMONTHDAY=0', /BYMONTHDAY/],
    ['FREQ=YEARLY;BYMONTH=13', /BYMONTH/],
    ['FREQ=WEEKLY;BYDAY=XX', /nie jest dniem/],
    ['FREQ=DAILY;UNTIL=20260230', /UNTIL/],
    ['FREQ', /KLUCZ=wartość/],
  ])('%j jest odrzucane', (s, why) => {
    const r = parseRRule(s);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(why);
  });
});

describe('wystąpienia', () => {
  test('codziennie i co N dni', () => {
    expect(dates('FREQ=DAILY', '2026-12-30', 3)).toEqual(['2026-12-30', '2026-12-31', '2027-01-01']);
    expect(dates('FREQ=DAILY;INTERVAL=3', '2026-09-25', 3)).toEqual([
      '2026-09-25',
      '2026-09-28',
      '2026-10-01',
    ]);
  });

  test('co 2 tygodnie w pn i śr — faza liczy się od tygodnia kotwicy', () => {
    // 2026-09-25 to piątek: jego tydzień nie ma już pn ani śr.
    expect(dates('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE', '2026-09-25', 4)).toEqual([
      '2026-10-05',
      '2026-10-07',
      '2026-10-19',
      '2026-10-21',
    ]);
  });

  test('tydzień zaczyna się od WKST', () => {
    // Niedziela 2026-09-27: z WKST=SU należy do tygodnia z 28.09 (pn) włącznie.
    expect(dates('FREQ=WEEKLY;INTERVAL=2;BYDAY=SU,MO;WKST=SU', '2026-09-27', 3)).toEqual([
      '2026-09-27',
      '2026-09-28',
      '2026-10-11',
    ]);
    expect(dates('FREQ=WEEKLY;INTERVAL=2;BYDAY=SU,MO', '2026-09-27', 3)).toEqual([
      '2026-09-27',
      '2026-10-05',
      '2026-10-11',
    ]);
  });

  test('ostatni piątek i drugi wtorek miesiąca', () => {
    expect(dates('FREQ=MONTHLY;BYDAY=-1FR', '2026-09-01', 3)).toEqual([
      '2026-09-25',
      '2026-10-30',
      '2026-11-27',
    ]);
    expect(dates('FREQ=MONTHLY;BYDAY=2TU', '2026-09-01', 2)).toEqual(['2026-09-08', '2026-10-13']);
  });

  test('ostatni dzień powszedni miesiąca', () => {
    // Październik 2026 kończy się w sobotę, więc ostatni powszedni to piątek 30.
    expect(dates('FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1', '2026-10-01', 3)).toEqual([
      '2026-10-30',
      '2026-11-30',
      '2026-12-31',
    ]);
  });

  test('BYMONTHDAY=31 w iCal pomija miesiące bez 31.', () => {
    expect(dates('FREQ=MONTHLY;BYMONTHDAY=31', '2026-01-01', 4)).toEqual([
      '2026-01-31',
      '2026-03-31',
      '2026-05-31',
      '2026-07-31',
    ]);
  });

  test('ostatni dzień miesiąca i 30. albo ostatni', () => {
    expect(dates('FREQ=MONTHLY;BYMONTHDAY=-1', '2028-01-15', 3)).toEqual([
      '2028-01-31',
      '2028-02-29',
      '2028-03-31',
    ]);
    expect(dates('FREQ=MONTHLY;BYMONTHDAY=28,29,30;BYSETPOS=-1', '2026-01-01', 3)).toEqual([
      '2026-01-30',
      '2026-02-28',
      '2026-03-30',
    ]);
  });

  test('co roku: data, 29 lutego i czwarty czwartek listopada', () => {
    expect(dates('FREQ=YEARLY;BYMONTH=9;BYMONTHDAY=24', '2026-09-25', 2)).toEqual([
      '2027-09-24',
      '2028-09-24',
    ]);
    expect(dates('FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29', '2026-01-01', 2)).toEqual([
      '2028-02-29',
      '2032-02-29',
    ]);
    expect(dates('FREQ=YEARLY;BYMONTH=11;BYDAY=4TH', '2026-01-01', 2)).toEqual([
      '2026-11-26',
      '2027-11-25',
    ]);
  });

  test('BYMONTH ogranicza częstsze reguły', () => {
    expect(dates('FREQ=WEEKLY;BYDAY=SA;BYMONTH=12', '2026-11-25', 3)).toEqual([
      '2026-12-05',
      '2026-12-12',
      '2026-12-19',
    ]);
  });

  test('COUNT i UNTIL kończą serię', () => {
    expect(dates('FREQ=DAILY;COUNT=3', '2026-09-25', 9)).toEqual([
      '2026-09-25',
      '2026-09-26',
      '2026-09-27',
    ]);
    expect(dates('FREQ=WEEKLY;BYDAY=FR;UNTIL=20261009', '2026-09-25', 9)).toEqual([
      '2026-09-25',
      '2026-10-02',
      '2026-10-09',
    ]);
  });

  test('reguła bez żadnego wystąpienia nie zawiesza się', () => {
    expect(firstFrom(rule('FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=30'), '2026-01-01')).toBeNull();
    expect(firstFrom(rule('FREQ=DAILY;BYMONTH=2;BYMONTHDAY=31'), '2026-01-01')).toBeNull();
  });

  test('kotwica spoza reguły: pierwsze wystąpienie to pierwsze pasujące od niej', () => {
    // Czwartek z regułą „co poniedziałek".
    expect(firstFrom(rule('FREQ=WEEKLY;BYDAY=MO'), '2026-10-01')).toBe('2026-10-05');
  });
});

describe('przesuwanie wzorca', () => {
  test('pomija wszystko do `after` włącznie i zużywa COUNT za każdą datę', () => {
    const r = rule('FREQ=DAILY;COUNT=5');
    expect(advance(r, '2026-09-25', '2026-09-27')).toEqual({
      rule: { ...r, count: 2 },
      next: '2026-09-28',
    });
    expect(advance(r, '2026-09-25', '2026-09-29')).toBeNull();
  });

  test('przesunięta kotwica nie zmienia serii (faza INTERVAL zostaje)', () => {
    const r = rule('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=6');
    const all = preview(r, '2026-10-05', 10);
    let anchor = '2026-10-05';
    let cur: RRule = r;
    const walked = [anchor];
    for (;;) {
      const a = advance(cur, anchor, anchor);
      if (!a) break;
      walked.push(a.next);
      anchor = a.next;
      cur = a.rule;
    }
    expect(walked).toEqual(all);
    expect(all).toHaveLength(6);
  });

  test('pin zapisuje wprost to, co reguła brała z kotwicy', () => {
    expect(formatRRule(pin(rule('FREQ=WEEKLY'), '2026-09-25'))).toBe('FREQ=WEEKLY;BYDAY=FR');
    expect(formatRRule(pin(rule('FREQ=MONTHLY'), '2026-09-25'))).toBe(
      'FREQ=MONTHLY;BYMONTHDAY=25',
    );
    expect(formatRRule(pin(rule('FREQ=YEARLY'), '2026-09-25'))).toBe(
      'FREQ=YEARLY;BYMONTH=9;BYMONTHDAY=25',
    );
    expect(formatRRule(pin(rule('FREQ=DAILY'), '2026-09-25'))).toBe('FREQ=DAILY');
  });
});

describe('opis po polsku', () => {
  test.each([
    ['FREQ=DAILY', 'codziennie'],
    ['FREQ=DAILY;INTERVAL=3', 'co 3 dni'],
    ['FREQ=WEEKLY;BYDAY=MO', 'co poniedziałek'],
    ['FREQ=WEEKLY;BYDAY=WE', 'co środę'],
    ['FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', 'w dni powszednie'],
    ['FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE', 'co 2 tygodnie w pn, śr'],
    ['FREQ=WEEKLY;INTERVAL=5;BYDAY=SA', 'co 5 tygodni w so'],
    ['FREQ=MONTHLY;BYMONTHDAY=3', '3. każdego miesiąca'],
    ['FREQ=MONTHLY;BYMONTHDAY=-1', 'ostatniego dnia miesiąca'],
    ['FREQ=MONTHLY;BYMONTHDAY=28,29,30;BYSETPOS=-1', '30. lub ostatniego dnia miesiąca'],
    ['FREQ=MONTHLY;BYMONTHDAY=1,15', 'co miesiąc dnia 1. i 15.'],
    ['FREQ=MONTHLY;BYDAY=-1FR', 'w ostatni piątek miesiąca'],
    ['FREQ=MONTHLY;BYDAY=-1SU', 'w ostatnią niedzielę miesiąca'],
    ['FREQ=MONTHLY;BYDAY=2TU', 'w 2. wtorek miesiąca'],
    ['FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1', 'ostatni dzień powszedni miesiąca'],
    ['FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=10', 'co 3 miesiące dnia 10.'],
    ['FREQ=YEARLY;BYMONTH=9;BYMONTHDAY=24', 'co roku 24 wrz'],
    ['FREQ=YEARLY;INTERVAL=2;BYMONTH=2;BYMONTHDAY=-1', 'co 2 lata ostatniego dnia lut'],
    ['FREQ=YEARLY;BYMONTH=11;BYDAY=4TH', 'co roku w 4. czwartek w lis'],
    ['FREQ=DAILY;COUNT=7', 'codziennie, 7 razy'],
    ['FREQ=WEEKLY;BYDAY=SA;UNTIL=20261231', 'co sobotę, do 31 gru 2026'],
  ])('%s → %s', (s, text) => {
    expect(describeRule(rule(s))).toBe(text);
  });

  test('wzorzec mówi, ile razy jeszcze', () => {
    expect(describeRule(rule('FREQ=DAILY;COUNT=1'), { left: true })).toBe('codziennie, jeszcze 1 raz');
    expect(describeRule(rule('FREQ=DAILY;COUNT=22'), { left: true })).toBe(
      'codziennie, jeszcze 22 razy',
    );
  });

  test('odmiana liczebników', () => {
    const t = (n: number) => plural(n, 'tydzień', 'tygodnie', 'tygodni');
    expect([1, 2, 4, 5, 11, 12, 14, 21, 22, 25].map(t)).toEqual([
      'tydzień',
      'tygodnie',
      'tygodnie',
      'tygodni',
      'tygodni',
      'tygodni',
      'tygodni',
      'tygodni',
      'tygodnie',
      'tygodni',
    ]);
  });
});

/* ───────────── Dawne wzorce: dokładnie te same daty ───────────── */

// Wierna kopia dawnego nextOccurrence — punkt odniesienia dla konwersji.
const pad = (n: number) => String(n).padStart(2, '0');
const key = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const clamp = (y: number, m: number, d: number) => Math.min(d, new Date(y, m, 0).getDate());
function legacyNext(r: LegacyRepeat, after: string): string {
  const [y, m, d] = after.split('-').map(Number) as [number, number, number];
  if (r.kind === 'daily') {
    const n = new Date(y, m - 1, d + 1);
    return key(n.getFullYear(), n.getMonth() + 1, n.getDate());
  }
  if (r.kind === 'weekly') {
    const from = new Date(y, m - 1, d);
    const delta = (r.weekday - from.getDay() + 7) % 7 || 7;
    const n = new Date(y, m - 1, d + delta);
    return key(n.getFullYear(), n.getMonth() + 1, n.getDate());
  }
  if (r.kind === 'monthly') {
    const t = clamp(y, m, r.dayOfMonth);
    if (t > d) return key(y, m, t);
    const ny = m === 12 ? y + 1 : y;
    const nm = m === 12 ? 1 : m + 1;
    return key(ny, nm, clamp(ny, nm, r.dayOfMonth));
  }
  const t = clamp(y, r.month, r.dayOfMonth);
  if (r.month > m || (r.month === m && t > d)) return key(y, r.month, t);
  return key(y + 1, r.month, clamp(y + 1, r.month, r.dayOfMonth));
}

const newNext = (r: LegacyRepeat, after: string) => advance(fromLegacy(r), after, after)?.next;

test('dawne wzorce przechodzą na RRULE bez zmiany żadnej daty', () => {
  let seed = 7;
  const rand = (n: number) => {
    seed = (seed * 48271) % 2147483647;
    return seed % n;
  };
  const rules: LegacyRepeat[] = [{ kind: 'daily' }];
  for (let w = 0; w < 7; w++) rules.push({ kind: 'weekly', weekday: w });
  for (let d = 1; d <= 31; d++) rules.push({ kind: 'monthly', dayOfMonth: d });
  for (const [m, d] of [
    [1, 31], [2, 28], [2, 29], [2, 30], [2, 31], [4, 30], [4, 31], [9, 24], [12, 31],
  ] as const)
    rules.push({ kind: 'yearly', month: m, dayOfMonth: d });

  for (let i = 0; i < 4000; i++) {
    const r = rules[rand(rules.length)]!;
    const y = 2024 + rand(6);
    const m = 1 + rand(12);
    const d = 1 + rand(new Date(y, m, 0).getDate());
    const after = key(y, m, d);
    expect(newNext(r, after), `${JSON.stringify(r)} po ${after}`).toBe(legacyNext(r, after));
  }
});

test('konwersja dawnych wzorców na RRULE', () => {
  const f = (r: LegacyRepeat) => formatRRule(fromLegacy(r));
  expect(f({ kind: 'daily' })).toBe('FREQ=DAILY');
  expect(f({ kind: 'weekly', weekday: 0 })).toBe('FREQ=WEEKLY;BYDAY=SU');
  expect(f({ kind: 'monthly', dayOfMonth: 3 })).toBe('FREQ=MONTHLY;BYMONTHDAY=3');
  expect(f({ kind: 'monthly', dayOfMonth: 30 })).toBe(
    'FREQ=MONTHLY;BYMONTHDAY=28,29,30;BYSETPOS=-1',
  );
  expect(f({ kind: 'monthly', dayOfMonth: 31 })).toBe('FREQ=MONTHLY;BYMONTHDAY=-1');
  expect(f({ kind: 'yearly', month: 2, dayOfMonth: 29 })).toBe(
    'FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1',
  );
  expect(f({ kind: 'yearly', month: 9, dayOfMonth: 24 })).toBe(
    'FREQ=YEARLY;BYMONTH=9;BYMONTHDAY=24',
  );
  expect(canonical(fromLegacy({ kind: 'daily' }))).toEqual({ freq: 'DAILY', interval: 1 });
});
