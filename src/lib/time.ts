import { QDAY } from './types';

export const pad = (n: number) => String(n).padStart(2, '0');

export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const today = () => dayKey(new Date());

export function splitDay(k: string): [number, number, number] {
  const [y, m, d] = k.split('-').map(Number);
  return [y ?? 1970, m ?? 1, d ?? 1];
}

// Minuty przepełniają się celowo: Date normalizuje pola w czasie LOKALNYM,
// więc kwant 32 to 08:00 ściany także w dobie zmiany czasu, która ma 23 lub
// 25 godzin. Dodawanie milisekund dałoby tam inną godzinę.
export function qTime(day: string, q: number): number {
  const [y, m, d] = splitDay(day);
  return new Date(y, m - 1, d, 0, q * 15).getTime();
}

export function shiftDay(day: string, n: number): string {
  const [y, m, d] = splitDay(day);
  return dayKey(new Date(y, m - 1, d + n));
}

export function fmtQ(day: string, q: number): string {
  if (q >= QDAY) return '24:00';
  const t = new Date(qTime(day, q));
  return `${pad(t.getHours())}:${pad(t.getMinutes())}`;
}

export type Rel = 'past' | 'now' | 'future';

export function rel(day: string, q0: number, q1: number, now = Date.now()): Rel {
  if (qTime(day, q1) <= now) return 'past';
  if (qTime(day, q0) <= now) return 'now';
  return 'future';
}

export function nowQ(day: string, now = Date.now()): number | null {
  const d = new Date(now);
  if (dayKey(d) !== day) return null;
  return d.getHours() * 4 + Math.floor(d.getMinutes() / 15);
}

export function fmtDur(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Minuty, które da się wybrać: siatka dzieli godzinę na cztery kwadranse. */
export const QUARTERS = [0, 15, 30, 45] as const;

/** Godziny aktywnej części doby `[startH, endH)` — tylko tam siatka ma pola. */
export const activeHours = (startH: number, endH: number): number[] =>
  Array.from({ length: Math.max(0, endH - startH) }, (_, i) => startH + i);

/** Kwant z wybranej godziny i minuty; pusta godzina znaczy „bez pory". */
export function pickedQuantum(hour: string, minute: string): number | undefined {
  if (hour === '') return undefined;
  return Number(hour) * 4 + Math.floor(Number(minute) / 15);
}
