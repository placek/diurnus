export type Repeat =
  | { kind: 'daily' }
  | { kind: 'weekly'; weekday: number }
  | { kind: 'monthly'; dayOfMonth: number }
  | { kind: 'yearly'; month: number; dayOfMonth: number };

const pad = (n: number) => String(n).padStart(2, '0');
const key = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

const parse = (s: string): [number, number, number] => {
  const [y, m, d] = s.split('-').map(Number);
  return [y ?? 1970, m ?? 1, d ?? 1];
};

/** Dzień miesiąca przycięty do jego długości: 31 w lutym to 28 albo 29. */
export const clampToMonth = (year: number, month: number, dayOfMonth: number) =>
  Math.min(dayOfMonth, new Date(year, month, 0).getDate());

export const WEEKDAYS = [
  'niedzielę',
  'poniedziałek',
  'wtorek',
  'środę',
  'czwartek',
  'piątek',
  'sobotę',
] as const;

export const MONTHS = [
  'sty', 'lut', 'mar', 'kwi', 'maj', 'cze',
  'lip', 'sie', 'wrz', 'paź', 'lis', 'gru',
] as const;

/**
 * Pierwsze wystąpienie ŚCIŚLE późniejsze niż `after`. Ścisłość jest istotna:
 * gdyby funkcja mogła zwrócić dzień odniesienia, odhaczenie powtarzalnej
 * pozycji ustawiałoby jej następny termin na dziś i zapętlało ją.
 */
export function nextOccurrence(repeat: Repeat, after: string): string {
  const [y, m, d] = parse(after);

  if (repeat.kind === 'daily') {
    const next = new Date(y, m - 1, d + 1);
    return key(next.getFullYear(), next.getMonth() + 1, next.getDate());
  }

  if (repeat.kind === 'weekly') {
    const from = new Date(y, m - 1, d);
    // `|| 7` wymusza skok o tydzień, gdy dziś JEST tym dniem tygodnia.
    const delta = (repeat.weekday - from.getDay() + 7) % 7 || 7;
    const next = new Date(y, m - 1, d + delta);
    return key(next.getFullYear(), next.getMonth() + 1, next.getDate());
  }

  if (repeat.kind === 'monthly') {
    const thisMonth = clampToMonth(y, m, repeat.dayOfMonth);
    if (thisMonth > d) return key(y, m, thisMonth);
    const ny = m === 12 ? y + 1 : y;
    const nm = m === 12 ? 1 : m + 1;
    return key(ny, nm, clampToMonth(ny, nm, repeat.dayOfMonth));
  }

  const thisYear = clampToMonth(y, repeat.month, repeat.dayOfMonth);
  if (repeat.month > m || (repeat.month === m && thisYear > d)) {
    return key(y, repeat.month, thisYear);
  }
  return key(y + 1, repeat.month, clampToMonth(y + 1, repeat.month, repeat.dayOfMonth));
}

export function describeRepeat(repeat: Repeat): string {
  switch (repeat.kind) {
    case 'daily':
      return 'codziennie';
    case 'weekly':
      return `co ${WEEKDAYS[repeat.weekday] ?? '?'}`;
    case 'monthly':
      return `${repeat.dayOfMonth}. każdego miesiąca`;
    case 'yearly':
      return `co rok ${repeat.dayOfMonth} ${MONTHS[repeat.month - 1] ?? '?'}`;
  }
}
