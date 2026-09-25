import { test, expect } from 'vitest';
import {
  customFromRule,
  defaultCustom,
  monthModes,
  presetOf,
  presets,
  ruleFromCustom,
  shortDate,
  unitLabel,
} from '../src/lib/recurrence-form';
import type { Custom } from '../src/lib/recurrence-form';
import { formatRRule, parseRRule } from '../src/lib/rrule';
import type { RRule } from '../src/lib/rrule';

const rule = (s: string): RRule => (parseRRule(s) as { rule: RRule }).rule;
const fmt = (r: RRule | null) => (r ? formatRRule(r) : null);

// 2030-01-15 to wtorek; 2030-01-29 — ostatni wtorek; 2030-01-31 — ostatni dzień.
const TUE = '2030-01-15';

test('gotowe wzorce liczą się od wybranego dnia', () => {
  expect(presets(TUE).map((p) => [p.key, p.label, fmt(p.rule)])).toEqual([
    ['none', 'nie powtarzaj', null],
    ['daily', 'codziennie', 'FREQ=DAILY'],
    ['weekdays', 'w dni powszednie (pn–pt)', 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'],
    ['weekly', 'co wtorek', 'FREQ=WEEKLY;BYDAY=TU'],
    ['monthly', '15. każdego miesiąca', 'FREQ=MONTHLY;BYMONTHDAY=15'],
    ['yearly', 'co roku 15 sty', 'FREQ=YEARLY;BYMONTH=1;BYMONTHDAY=15'],
  ]);
});

test('opcje „co miesiąc": dzień, N. dzień tygodnia, ostatni, ostatni dzień', () => {
  expect(monthModes(TUE).map((m) => m.label)).toEqual(['dnia 15.', 'w 3. wtorek']);
  expect(monthModes('2030-01-29').map((m) => m.label)).toEqual(['dnia 29.', 'w ostatni wtorek']);
  expect(monthModes('2030-01-31').map((m) => m.label)).toEqual([
    'dnia 31.',
    'w ostatni czwartek',
    'ostatniego dnia',
  ]);
  expect(monthModes('2030-01-30').map((m) => m.label)).toContain('w ostatnią środę');
});

test('formularz „własne…" daje regułę dla wybranego dnia', () => {
  const c = (over: Partial<Custom>) => ({ ...defaultCustom(TUE), ...over });
  expect(fmt(ruleFromCustom(c({ unit: 'DAILY', interval: 3 }), TUE))).toBe('FREQ=DAILY;INTERVAL=3');
  expect(fmt(ruleFromCustom(c({ weekdays: ['WE', 'MO'], interval: 2 }), TUE))).toBe(
    'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE',
  );
  expect(fmt(ruleFromCustom(c({ weekdays: [] }), TUE))).toBe('FREQ=WEEKLY;BYDAY=TU');
  expect(fmt(ruleFromCustom(c({ unit: 'MONTHLY', monthMode: 'nth' }), TUE))).toBe(
    'FREQ=MONTHLY;BYDAY=3TU',
  );
  expect(fmt(ruleFromCustom(c({ unit: 'MONTHLY', monthMode: 'lastDay' }), '2030-01-31'))).toBe(
    'FREQ=MONTHLY;BYMONTHDAY=-1',
  );
  expect(fmt(ruleFromCustom(c({ unit: 'YEARLY', end: 'count', count: 5 }), TUE))).toBe(
    'FREQ=YEARLY;BYMONTH=1;BYMONTHDAY=15;COUNT=5',
  );
  expect(fmt(ruleFromCustom(c({ end: 'until', until: '2030-06-30' }), TUE))).toBe(
    'FREQ=WEEKLY;BYDAY=TU;UNTIL=20300630',
  );
  // Śmieci z pól liczbowych nie psują reguły.
  expect(fmt(ruleFromCustom(c({ interval: 0, end: 'count', count: NaN }), TUE))).toBe(
    'FREQ=WEEKLY;BYDAY=TU;COUNT=1',
  );
});

test('reguła wraca do formularza, jeśli da się ją w nim przedstawić', () => {
  for (const [s, day] of [
    ['FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=4', TUE],
    ['FREQ=MONTHLY;BYDAY=-1TU', '2030-01-29'],
    ['FREQ=MONTHLY;BYDAY=3TU;UNTIL=20301231', TUE],
    ['FREQ=DAILY;INTERVAL=5', TUE],
    ['FREQ=YEARLY;INTERVAL=2;BYMONTH=1;BYMONTHDAY=15', TUE],
  ] as const) {
    const c = customFromRule(rule(s), day);
    expect(c, s).not.toBeNull();
    expect(fmt(ruleFromCustom(c!, day))).toBe(s);
  }
});

test('reguły spoza formularza zostają „bez zmian"', () => {
  expect(customFromRule(rule('FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1'), TUE)).toBeNull();
  expect(customFromRule(rule('FREQ=MONTHLY;BYMONTHDAY=1,15'), TUE)).toBeNull();
  // Dzień miesiąca inny niż wybrany dzień też nie jest „dnia N." z formularza.
  expect(customFromRule(rule('FREQ=MONTHLY;BYMONTHDAY=3'), TUE)).toBeNull();
});

test('gotowy wzorzec rozpoznaje się po regule', () => {
  expect(presetOf(rule('FREQ=DAILY'), TUE)).toBe('daily');
  expect(presetOf(rule('FREQ=WEEKLY;BYDAY=TU'), TUE)).toBe('weekly');
  expect(presetOf(rule('FREQ=WEEKLY;BYDAY=MO'), TUE)).toBeNull();
  expect(presetOf(rule('FREQ=DAILY;COUNT=3'), TUE)).toBeNull();
});

test('podpisy: jednostki z odmianą i krótka data', () => {
  expect([1, 2, 5, 22].map((n) => unitLabel('WEEKLY', n))).toEqual([
    'tydzień',
    'tygodnie',
    'tygodni',
    'tygodnie',
  ]);
  expect(unitLabel('YEARLY', 3)).toBe('lata');
  expect(unitLabel('MONTHLY', 12)).toBe('miesięcy');
  expect(shortDate(TUE)).toBe('wt 15 sty');
});
