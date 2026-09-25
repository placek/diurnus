import {
  DAY_ACC,
  DAY_SHORT,
  MONTHS,
  WEEKDAY_CODES,
  formatRRule,
  isRealDate,
  weekdayOf,
} from './rrule';
import type { RRule, Weekday } from './rrule';

/*
 * Formularz powtarzania w okienku terminu: gotowe wzorce i „własne…" — wszystko
 * liczone od wybranego dnia, tak jak w kalendarzach. Czysta logika, bez DOM.
 */

export type Unit = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
/** Jak liczyć dzień w miesiącu przy „co miesiąc": z dnia, który wybrano. */
export type MonthMode = 'day' | 'nth' | 'lastWeekday' | 'lastDay';
export type EndMode = 'never' | 'count' | 'until';

export interface Custom {
  interval: number;
  unit: Unit;
  /** dni tygodnia przy WEEKLY */
  weekdays: Weekday[];
  monthMode: MonthMode;
  end: EndMode;
  count: number;
  until: string;
}

export type PresetKey =
  'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly' | 'custom' | 'keep';

const WORKDAYS: Weekday[] = ['MO', 'TU', 'WE', 'TH', 'FR'];

const parts = (day: string) => day.split('-').map(Number) as [number, number, number];
const monthLen = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Który to dzień tygodnia w miesiącu: 1..5. */
export const nthInMonth = (day: string) => Math.ceil(parts(day)[2] / 7);
/** Czy to ostatni taki dzień tygodnia w miesiącu. */
export const isLastWeekday = (day: string) => {
  const [y, m, d] = parts(day);
  return d + 7 > monthLen(y, m);
};
export const isLastDay = (day: string) => {
  const [y, m, d] = parts(day);
  return d === monthLen(y, m);
};

/** Gotowe wzorce dla wybranego dnia; `null` znaczy „nie powtarzaj". */
export function presets(day: string): { key: PresetKey; label: string; rule: RRule | null }[] {
  const [, m, d] = parts(day);
  const wd = weekdayOf(day);
  return [
    { key: 'none', label: 'nie powtarzaj', rule: null },
    { key: 'daily', label: 'codziennie', rule: { freq: 'DAILY', interval: 1 } },
    {
      key: 'weekdays',
      label: 'w dni powszednie (pn–pt)',
      rule: { freq: 'WEEKLY', interval: 1, byDay: WORKDAYS.map((day) => ({ day })) },
    },
    {
      key: 'weekly',
      label: `co ${DAY_ACC[wd]}`,
      rule: { freq: 'WEEKLY', interval: 1, byDay: [{ day: wd }] },
    },
    {
      key: 'monthly',
      label: `${d}. każdego miesiąca`,
      rule: { freq: 'MONTHLY', interval: 1, byMonthDay: [d] },
    },
    {
      key: 'yearly',
      label: `co roku ${d} ${MONTHS[m - 1]}`,
      rule: { freq: 'YEARLY', interval: 1, byMonth: [m], byMonthDay: [d] },
    },
  ];
}

/** Opcje „co miesiąc" dla wybranego dnia, z podpisami. */
export function monthModes(day: string): { mode: MonthMode; label: string }[] {
  const d = parts(day)[2];
  const wd = weekdayOf(day);
  const fem = wd === 'WE' || wd === 'SA' || wd === 'SU';
  const out: { mode: MonthMode; label: string }[] = [{ mode: 'day', label: `dnia ${d}.` }];
  if (nthInMonth(day) <= 4)
    out.push({ mode: 'nth', label: `w ${nthInMonth(day)}. ${DAY_ACC[wd]}` });
  if (isLastWeekday(day))
    out.push({ mode: 'lastWeekday', label: `w ${fem ? 'ostatnią' : 'ostatni'} ${DAY_ACC[wd]}` });
  if (isLastDay(day)) out.push({ mode: 'lastDay', label: 'ostatniego dnia' });
  return out;
}

export function defaultCustom(day: string): Custom {
  const [y, m] = parts(day);
  const until = `${m >= 10 ? y + 1 : y}-${String(((m + 2) % 12) + 1).padStart(2, '0')}-01`;
  return {
    interval: 1,
    unit: 'WEEKLY',
    weekdays: [weekdayOf(day)],
    monthMode: 'day',
    end: 'never',
    count: 10,
    until,
  };
}

/** Reguła z formularza „własne…" dla wybranego dnia. */
export function ruleFromCustom(c: Custom, day: string): RRule {
  const [, m, d] = parts(day);
  const wd = weekdayOf(day);
  const interval = Math.max(1, Math.floor(c.interval) || 1);
  let r: RRule;
  switch (c.unit) {
    case 'DAILY':
      r = { freq: 'DAILY', interval };
      break;
    case 'WEEKLY': {
      const days = WEEKDAY_CODES.filter((w) => c.weekdays.includes(w));
      r = { freq: 'WEEKLY', interval, byDay: (days.length ? days : [wd]).map((day) => ({ day })) };
      break;
    }
    case 'MONTHLY':
      r =
        c.monthMode === 'nth'
          ? { freq: 'MONTHLY', interval, byDay: [{ day: wd, n: nthInMonth(day) }] }
          : c.monthMode === 'lastWeekday'
            ? { freq: 'MONTHLY', interval, byDay: [{ day: wd, n: -1 }] }
            : c.monthMode === 'lastDay'
              ? { freq: 'MONTHLY', interval, byMonthDay: [-1] }
              : { freq: 'MONTHLY', interval, byMonthDay: [d] };
      break;
    case 'YEARLY':
      r = { freq: 'YEARLY', interval, byMonth: [m], byMonthDay: [d] };
      break;
  }
  if (c.end === 'count') r.count = Math.max(1, Math.floor(c.count) || 1);
  if (c.end === 'until' && c.until) r.until = c.until;
  return r;
}

/**
 * Formularz, który daje dokładnie tę regułę dla tego dnia; `null`, gdy reguły
 * nie da się w nim przedstawić (wtedy okienko proponuje „zostaw jak jest").
 */
export function customFromRule(r: RRule, day: string): Custom | null {
  const want = formatRRule(r);
  const base = defaultCustom(day);
  const weekdays = r.byDay?.every((b) => b.n === undefined)
    ? r.byDay.map((b) => b.day)
    : base.weekdays;
  const end: EndMode = r.count !== undefined ? 'count' : r.until !== undefined ? 'until' : 'never';
  for (const monthMode of ['day', 'nth', 'lastWeekday', 'lastDay'] as MonthMode[]) {
    const c: Custom = {
      ...base,
      interval: r.interval,
      unit: r.freq,
      weekdays,
      monthMode,
      end,
      count: r.count ?? base.count,
      until: r.until ?? base.until,
    };
    if (formatRRule(ruleFromCustom(c, day)) === want) return c;
  }
  return null;
}

/** Gotowy wzorzec o tej samej regule, jeśli jest. */
export function presetOf(r: RRule, day: string): PresetKey | null {
  const want = formatRRule(r);
  return presets(day).find((p) => p.rule && formatRRule(p.rule) === want)?.key ?? null;
}

/** Nazwa jednostki dla liczby: „dzień", „2 tygodnie", „5 miesięcy". */
export function unitLabel(unit: Unit, n: number): string {
  const one = { DAILY: 'dzień', WEEKLY: 'tydzień', MONTHLY: 'miesiąc', YEARLY: 'rok' }[unit];
  const few = { DAILY: 'dni', WEEKLY: 'tygodnie', MONTHLY: 'miesiące', YEARLY: 'lata' }[unit];
  const many = { DAILY: 'dni', WEEKLY: 'tygodni', MONTHLY: 'miesięcy', YEARLY: 'lat' }[unit];
  if (n === 1) return one;
  const d = n % 10;
  const t = n % 100;
  return d >= 2 && d <= 4 && (t < 12 || t > 14) ? few : many;
}

/** Krótka data do podglądu: „pn 28 wrz". */
export function shortDate(day: string): string {
  const [, m, d] = parts(day);
  return `${DAY_SHORT[weekdayOf(day)]} ${d} ${MONTHS[m - 1]}`;
}

/** Pole daty w przeglądarce bywa puste albo niedokończone. */
export const validDay = (day: string): boolean => isRealDate(day);
