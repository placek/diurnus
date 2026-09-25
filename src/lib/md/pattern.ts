import { formatRRule, fromLegacy, parseRRule } from '../rrule';
import type { LegacyRepeat, RRule } from '../rrule';

/** Wzorzec w pliku to reguła iCal (RRULE) w postaci kanonicznej. */
export const patternWord = (r: RRule): string => formatRRule(r);

export type PatternResult = { ok: true; rule: RRule } | { ok: false; error: string };

/**
 * Napis z klamer z powrotem na regułę. Przyjmuje RRULE (także z przedrostkiem
 * „RRULE:") i — dla plików sprzed RRULE — dawne polskie wzorce: „codziennie",
 * „co poniedziałek", „3. każdego miesiąca", „co rok 24 wrz".
 */
export function parsePattern(word: string): PatternResult {
  if (/^(RRULE:)?[A-Z]+=/i.test(word)) {
    const r = parseRRule(word);
    return r.ok ? r : { ok: false, error: `reguła „{${word}}": ${r.error}` };
  }
  const legacy = parseLegacy(word);
  return legacy
    ? { ok: true, rule: fromLegacy(legacy) }
    : {
        ok: false,
        error: `nieznany wzorzec „{${word}}" — oczekiwana reguła RRULE, np. {FREQ=WEEKLY;BYDAY=MO}`,
      };
}

// Dawne nazwy dni w bierniku, od niedzieli — tak jak Date#getDay.
const LEGACY_DAYS = [
  'niedzielę',
  'poniedziałek',
  'wtorek',
  'środę',
  'czwartek',
  'piątek',
  'sobotę',
];
const LEGACY_MONTHS = [
  'sty',
  'lut',
  'mar',
  'kwi',
  'maj',
  'cze',
  'lip',
  'sie',
  'wrz',
  'paź',
  'lis',
  'gru',
];

function parseLegacy(word: string): LegacyRepeat | null {
  if (word === 'codziennie') return { kind: 'daily' };
  const weekly = /^co (\S+)$/.exec(word);
  if (weekly) {
    const weekday = LEGACY_DAYS.indexOf(weekly[1]!);
    return weekday >= 0 ? { kind: 'weekly', weekday } : null;
  }
  const monthly = /^(\d{1,2})\. każdego miesiąca$/.exec(word);
  if (monthly) {
    const dayOfMonth = Number(monthly[1]);
    return dayOfMonth >= 1 && dayOfMonth <= 31 ? { kind: 'monthly', dayOfMonth } : null;
  }
  const yearly = /^co rok (\d{1,2}) (\S+)$/.exec(word);
  if (yearly) {
    const dayOfMonth = Number(yearly[1]);
    const month = LEGACY_MONTHS.indexOf(yearly[2]!) + 1;
    return month >= 1 && dayOfMonth >= 1 && dayOfMonth <= 31
      ? { kind: 'yearly', month, dayOfMonth }
      : null;
  }
  return null;
}
