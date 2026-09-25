import { MONTHS, WEEKDAYS, describeRepeat } from '../repeat';
import type { Repeat } from '../repeat';

/** Wzorzec w pliku to dokładnie ten napis, który pokazuje aplikacja. */
export const patternWord = (r: Repeat): string => describeRepeat(r);

/** Napis wzorca z powrotem na wzorzec; `null`, gdy to nie jest żaden z czterech. */
export function parsePattern(word: string): Repeat | null {
  if (word === 'codziennie') return { kind: 'daily' };

  const weekly = /^co (\S+)$/.exec(word);
  if (weekly) {
    const weekday = (WEEKDAYS as readonly string[]).indexOf(weekly[1]!);
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
    const month = (MONTHS as readonly string[]).indexOf(yearly[2]!) + 1;
    return month >= 1 && dayOfMonth >= 1 && dayOfMonth <= 31
      ? { kind: 'yearly', month, dayOfMonth }
      : null;
  }
  return null;
}
