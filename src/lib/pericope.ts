import { splitDay } from './time';

/*
 * Perykopa Ewangelii według św. Jana na bieżący tydzień: numer od 1 do 45,
 * jeden na tydzień. Tydzień to tydzień ISO 8601 (od poniedziałku; pierwszy ma
 * pierwszy czwartek roku). Tygodnie 1–45 dają perykopy 1–45, a dalsze zaczynają
 * cykl od nowa: tydzień 46 to perykopa 1, tydzień 53 — perykopa 8.
 */

export const PERICOPES = 45;

/** Rok i numer tygodnia ISO 8601 dla daty `RRRR-MM-DD`. */
export function isoWeek(day: string): { year: number; week: number } {
  const [y, m, d] = splitDay(day);
  const t = new Date(Date.UTC(y, m - 1, d));
  // Czwartek tego tygodnia wyznacza jego rok.
  const dow = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dow);
  const year = t.getUTCFullYear();
  const week = Math.ceil(((t.getTime() - Date.UTC(year, 0, 1)) / 86_400_000 + 1) / 7);
  return { year, week };
}

/** Numer perykopy (1–45) na tydzień, w którym leży dzień. */
export function pericopeOf(day: string): { week: number; number: number } {
  const { week } = isoWeek(day);
  return { week, number: ((week - 1) % PERICOPES) + 1 };
}
