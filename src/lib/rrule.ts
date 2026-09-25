/*
 * Reguły powtarzania w podzbiorze iCal (RFC 5545 RRULE), z dokładnością do dnia.
 *
 * Aplikacja zna tylko dni i jeden półgodzinny slot, więc nie ma tu częstotliwości
 * godzinowych ani BYHOUR/BYMINUTE — pora pozycji jest osobno, jako slot.
 * Obsługiwane: FREQ (DAILY, WEEKLY, MONTHLY, YEARLY), INTERVAL, BYDAY (także
 * z numerem: 2TU, -1FR), BYMONTHDAY (także od końca: -1), BYMONTH, BYSETPOS,
 * COUNT, UNTIL, WKST. Poza zakresem: BYWEEKNO, BYYEARDAY, EXDATE.
 *
 * Kotwica (DTSTART) wyznacza fazę INTERVAL i to, czego reguła nie mówi wprost
 * (dzień tygodnia, dzień miesiąca). Wzorzec trzyma najbliższe wystąpienie jako
 * kotwicę i COUNT jako liczbę POZOSTAŁYCH wystąpień. Przesunięcie kotwicy na
 * kolejne wystąpienie nie zmienia serii: wystąpienia leżą w okresach tej samej
 * fazy, a to, co domyślne, reguła ma zapisane jawnie (`pin`).
 */

export type Freq = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
export type Weekday = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';

export interface ByDay {
  day: Weekday;
  /** Numer w miesiącu albo roku: 2 = drugi, -1 = ostatni. Brak = każdy. */
  n?: number;
}

export interface RRule {
  freq: Freq;
  /** ≥ 1; 1 się nie zapisuje. */
  interval: number;
  byDay?: ByDay[];
  /** 1..31 albo -31..-1 (od końca miesiąca). */
  byMonthDay?: number[];
  /** 1..12 */
  byMonth?: number[];
  /** Wybór spośród wystąpień okresu: 1 = pierwsze, -1 = ostatnie. */
  bySetPos?: number[];
  /** Ile wystąpień zostało, licząc od kotwicy. */
  count?: number;
  /** Ostatni dopuszczalny dzień, włącznie (RRRR-MM-DD). */
  until?: string;
  /** Początek tygodnia; domyślnie poniedziałek. */
  wkst?: Weekday;
}

export const WEEKDAY_CODES: readonly Weekday[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const WORKDAYS: readonly Weekday[] = ['MO', 'TU', 'WE', 'TH', 'FR'];

/* ───────────── Dni jako liczby ───────────── */

const DAY_MS = 86_400_000;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Dzień jako liczba dni od 1970-01-01 (UTC — bez zmian czasu). */
export function dayNum(s: string): number {
  const m = DATE.exec(s);
  if (!m) throw new Error(`zła data ${s}`);
  return Math.round(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!) / DAY_MS);
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

export function dayStr(n: number): string {
  const d = new Date(n * DAY_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

const ymd = (n: number): [number, number, number] => {
  const d = new Date(n * DAY_MS);
  return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
};
const fromYmd = (y: number, m: number, d: number) => Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
/** 0 = poniedziałek … 6 = niedziela. 1970-01-01 był czwartkiem. */
const wdIndex = (n: number) => (((n + 3) % 7) + 7) % 7;
export const weekdayOf = (s: string): Weekday => WEEKDAY_CODES[wdIndex(dayNum(s))]!;

export const isRealDate = (s: string): boolean => {
  const m = DATE.exec(s);
  return !!m && +m[2]! >= 1 && +m[2]! <= 12 && +m[3]! >= 1 && +m[3]! <= daysInMonth(+m[1]!, +m[2]!);
};

/* ───────────── Rozwinięcie okresu ───────────── */

/** Dzień miesiąca z BYMONTHDAY (ujemny liczy od końca); `null`, gdy go nie ma. */
function monthDay(y: number, m: number, md: number): number | null {
  const len = daysInMonth(y, m);
  const d = md > 0 ? md : len + md + 1;
  return d >= 1 && d <= len ? fromYmd(y, m, d) : null;
}

/** Dni z BYDAY w przedziale [from, to]; numer liczy się w obrębie tego przedziału. */
function byDayIn(from: number, to: number, byDay: readonly ByDay[]): number[] {
  const out: number[] = [];
  for (const b of byDay) {
    const want = WEEKDAY_CODES.indexOf(b.day);
    const all: number[] = [];
    for (let n = from + ((want - wdIndex(from) + 7) % 7); n <= to; n += 7) all.push(n);
    if (b.n === undefined) out.push(...all);
    else {
      const pick = b.n > 0 ? all[b.n - 1] : all[all.length + b.n];
      if (pick !== undefined) out.push(pick);
    }
  }
  return out;
}

const uniqSorted = (xs: number[]) => [...new Set(xs)].sort((a, b) => a - b);

function inMonth(r: RRule, y: number, m: number, anchor: number): number[] {
  const first = fromYmd(y, m, 1);
  const last = fromYmd(y, m, daysInMonth(y, m));
  if (r.byMonthDay) {
    const days = r.byMonthDay
      .map((md) => monthDay(y, m, md))
      .filter((d): d is number => d !== null);
    if (!r.byDay) return days;
    const allowed = new Set(byDayIn(first, last, r.byDay));
    return days.filter((d) => allowed.has(d));
  }
  if (r.byDay) return byDayIn(first, last, r.byDay);
  const d = monthDay(y, m, ymd(anchor)[2]);
  return d === null ? [] : [d];
}

/** Wszystkie wystąpienia okresu `k` (liczonego od okresu kotwicy), rosnąco. */
function period(r: RRule, anchor: number, k: number): { days: number[]; start: number } {
  const [ay, am] = ymd(anchor);
  let days: number[];
  let start: number;
  switch (r.freq) {
    case 'DAILY': {
      start = anchor + k * r.interval;
      days = [start];
      if (r.byDay) {
        const wds = new Set(r.byDay.map((b) => b.day));
        days = days.filter((d) => wds.has(WEEKDAY_CODES[wdIndex(d)]!));
      }
      if (r.byMonthDay) {
        const [y, m] = ymd(start);
        const ok = new Set(r.byMonthDay.map((md) => monthDay(y, m, md)));
        days = days.filter((d) => ok.has(d));
      }
      break;
    }
    case 'WEEKLY': {
      const wk = WEEKDAY_CODES.indexOf(r.wkst ?? 'MO');
      const weekStart = anchor - ((wdIndex(anchor) - wk + 7) % 7);
      start = weekStart + 7 * k * r.interval;
      const byDay = r.byDay ?? [{ day: WEEKDAY_CODES[wdIndex(anchor)]! }];
      days = byDayIn(start, start + 6, byDay);
      break;
    }
    case 'MONTHLY': {
      const total = am - 1 + k * r.interval;
      const y = ay + Math.floor(total / 12);
      const m = (total % 12) + 1;
      start = fromYmd(y, m, 1);
      days = inMonth(r, y, m, anchor);
      break;
    }
    case 'YEARLY': {
      const y = ay + k * r.interval;
      start = fromYmd(y, 1, 1);
      if (r.byMonth || r.byMonthDay) {
        const months = r.byMonth ?? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
        days = months.flatMap((m) =>
          r.byMonthDay || r.byDay
            ? inMonth(r, y, m, anchor)
            : [monthDay(y, m, ymd(anchor)[2])].filter((d): d is number => d !== null),
        );
      } else if (r.byDay) {
        days = byDayIn(start, fromYmd(y, 12, 31), r.byDay);
      } else {
        const d = monthDay(y, am, ymd(anchor)[2]);
        days = d === null ? [] : [d];
      }
      break;
    }
  }
  if (r.byMonth && r.freq !== 'YEARLY') {
    const months = new Set(r.byMonth);
    days = days.filter((d) => months.has(ymd(d)[1]));
  }
  days = uniqSorted(days);
  if (r.bySetPos) {
    const set = days;
    days = uniqSorted(
      r.bySetPos
        .map((p) => (p > 0 ? set[p - 1] : set[set.length + p]))
        .filter((d): d is number => d !== undefined),
    );
  }
  return { days, start };
}

/** Horyzont szukania: cztery stulecia pokrywają pełen cykl kalendarza. */
const HORIZON_DAYS = 400 * 366;

/**
 * Wystąpienia od kotwicy włącznie, rosnąco, z COUNT i UNTIL. Reguła bez
 * żadnego wystąpienia w horyzoncie (np. 30 lutego) po prostu się kończy.
 */
export function* occurrences(r: RRule, anchor: string): Generator<string> {
  const a = dayNum(anchor);
  const until = r.until ? dayNum(r.until) : Infinity;
  let left = r.count ?? Infinity;
  for (let k = 0; left > 0; k++) {
    const { days, start } = period(r, a, k);
    if (start > a + HORIZON_DAYS || start > until) return;
    for (const d of days) {
      if (d < a) continue;
      if (d > until) return;
      yield dayStr(d);
      if (--left <= 0) return;
    }
  }
}

/** Pierwsze wystąpienie od `anchor` włącznie albo `null`. */
export const firstFrom = (r: RRule, anchor: string): string | null =>
  occurrences(r, anchor).next().value ?? null;

/**
 * Seria od kotwicy `anchor`, z pominięciem wszystkiego do `after` włącznie.
 * Każde pominięte wystąpienie zużywa jedno z COUNT — liczą się daty, nie kopie.
 * `null`: seria się skończyła.
 */
export function advance(
  r: RRule,
  anchor: string,
  after: string,
): { rule: RRule; next: string } | null {
  let used = 0;
  for (const d of occurrences(r, anchor)) {
    if (d > after) {
      const rule = r.count === undefined ? r : { ...r, count: r.count - used };
      return { rule, next: d };
    }
    used++;
  }
  return null;
}

/** Kilka kolejnych wystąpień — do podglądu w oknie. */
export function preview(r: RRule, anchor: string, n: number): string[] {
  const out: string[] = [];
  for (const d of occurrences(r, anchor)) {
    out.push(d);
    if (out.length >= n) break;
  }
  return out;
}

/**
 * To, co reguła bierze z kotwicy, zapisane wprost: dzień tygodnia dla WEEKLY,
 * dzień miesiąca dla MONTHLY, miesiąc i dzień dla YEARLY. Po tym przesunięcie
 * kotwicy na dowolne wystąpienie niczego nie zmienia.
 */
export function pin(r: RRule, anchor: string): RRule {
  const [, m, d] = ymd(dayNum(anchor));
  if (r.freq === 'WEEKLY' && !r.byDay) return { ...r, byDay: [{ day: weekdayOf(anchor) }] };
  if (r.freq === 'MONTHLY' && !r.byDay && !r.byMonthDay) return { ...r, byMonthDay: [d] };
  if (r.freq === 'YEARLY' && !r.byDay && !r.byMonthDay)
    return { ...r, byMonth: r.byMonth ?? [m], byMonthDay: [d] };
  return r;
}

/* ───────────── Tekst RRULE ───────────── */

export type ParseRule = { ok: true; rule: RRule } | { ok: false; error: string };

const INT = /^[+-]?\d+$/;

function ints(v: string, lo: number, hi: number, zero = false): number[] | null {
  const out: number[] = [];
  for (const p of v.split(',')) {
    if (!INT.test(p)) return null;
    const n = Number(p);
    if ((!zero && n === 0) || Math.abs(n) < lo || Math.abs(n) > hi) return null;
    out.push(n);
  }
  return out;
}

/** Ścisły odczyt reguły; przyjmuje też przedrostek „RRULE:". */
export function parseRRule(text: string): ParseRule {
  const fail = (error: string): ParseRule => ({ ok: false, error });
  const body = text.trim().replace(/^RRULE:/i, '');
  if (!body) return fail('pusta reguła');
  const parts = new Map<string, string>();
  for (const kv of body.split(';')) {
    const eq = kv.indexOf('=');
    if (eq <= 0) return fail(`„${kv}" nie jest parą KLUCZ=wartość`);
    const k = kv.slice(0, eq).toUpperCase();
    const v = kv.slice(eq + 1).toUpperCase();
    if (parts.has(k)) return fail(`${k} powtórzone`);
    if (!v) return fail(`${k} bez wartości`);
    parts.set(k, v);
  }

  const freq = parts.get('FREQ');
  if (!freq) return fail('brak FREQ');
  if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq))
    return fail(`FREQ=${freq} nie jest obsługiwane — tylko DAILY, WEEKLY, MONTHLY, YEARLY`);
  const r: RRule = { freq: freq as Freq, interval: 1 };

  for (const [k, v] of parts) {
    switch (k) {
      case 'FREQ':
        break;
      case 'INTERVAL': {
        const n = ints(v, 1, 999);
        if (!n || n.length !== 1 || n[0]! < 1) return fail('INTERVAL musi być liczbą 1–999');
        r.interval = n[0]!;
        break;
      }
      case 'COUNT': {
        const n = ints(v, 1, 9999);
        if (!n || n.length !== 1 || n[0]! < 1) return fail('COUNT musi być liczbą 1–9999');
        r.count = n[0]!;
        break;
      }
      case 'UNTIL': {
        const m = /^(\d{4})(\d{2})(\d{2})(T\d{6}Z?)?$/.exec(v);
        const s = m ? `${m[1]}-${m[2]}-${m[3]}` : '';
        if (!m || !isRealDate(s)) return fail('UNTIL musi być datą RRRRMMDD');
        r.until = s;
        break;
      }
      case 'BYMONTH': {
        const n = ints(v, 1, 12);
        if (!n || n.some((x) => x < 1)) return fail('BYMONTH to miesiące 1–12');
        r.byMonth = n;
        break;
      }
      case 'BYMONTHDAY': {
        const n = ints(v, 1, 31);
        if (!n) return fail('BYMONTHDAY to dni 1–31 albo -31…-1');
        r.byMonthDay = n;
        break;
      }
      case 'BYSETPOS': {
        const n = ints(v, 1, 366);
        if (!n) return fail('BYSETPOS to pozycje 1–366 albo -366…-1');
        r.bySetPos = n;
        break;
      }
      case 'BYDAY': {
        const out: ByDay[] = [];
        for (const p of v.split(',')) {
          const m = /^([+-]?\d{1,2})?(MO|TU|WE|TH|FR|SA|SU)$/.exec(p);
          if (!m) return fail(`„${p}" nie jest dniem BYDAY`);
          const b: ByDay = { day: m[2] as Weekday };
          if (m[1] !== undefined) {
            const n = Number(m[1]);
            if (n === 0 || Math.abs(n) > 53) return fail(`numer dnia „${p}" poza zakresem`);
            b.n = n;
          }
          out.push(b);
        }
        r.byDay = out;
        break;
      }
      case 'WKST':
        if (!(WEEKDAY_CODES as readonly string[]).includes(v)) return fail('WKST to dzień MO…SU');
        r.wkst = v as Weekday;
        break;
      default:
        return fail(`${k} nie jest obsługiwane`);
    }
  }
  const invalid = check(r);
  return invalid ? fail(invalid) : { ok: true, rule: canonical(r) };
}

/** Powód, dla którego reguła nie ma sensu; `null`, gdy ma. */
export function check(r: RRule): string | null {
  if (r.count !== undefined && r.until !== undefined) return 'COUNT i UNTIL naraz — wybierz jedno';
  if (r.byDay?.some((b) => b.n !== undefined)) {
    if (r.freq !== 'MONTHLY' && r.freq !== 'YEARLY')
      return 'numer przy dniu (np. 2TU) tylko przy MONTHLY i YEARLY';
    if (r.freq === 'MONTHLY' && r.byDay.some((b) => Math.abs(b.n ?? 0) > 5))
      return 'w miesiącu jest najwyżej 5 takich dni';
  }
  if (r.byMonthDay && r.freq === 'WEEKLY') return 'BYMONTHDAY nie łączy się z WEEKLY';
  if (r.bySetPos && !r.byDay && !r.byMonthDay && !r.byMonth)
    return 'BYSETPOS wymaga BYDAY, BYMONTHDAY albo BYMONTH';
  return null;
}

/** Postać kanoniczna: listy posortowane i bez powtórzeń, domyślne pominięte. */
export function canonical(r: RRule): RRule {
  const nums = (xs?: number[]) => (xs && xs.length ? uniqSorted(xs) : undefined);
  const out: RRule = { freq: r.freq, interval: r.interval };
  const byMonth = nums(r.byMonth);
  const byMonthDay = nums(r.byMonthDay);
  const bySetPos = nums(r.bySetPos);
  if (byMonth) out.byMonth = byMonth;
  if (byMonthDay) out.byMonthDay = byMonthDay;
  if (r.byDay?.length) {
    const key = (b: ByDay) => `${b.n ?? ''}${b.day}`;
    const seen = new Map(r.byDay.map((b) => [key(b), b]));
    out.byDay = [...seen.values()].sort(
      (a, b) =>
        (a.n ?? 0) - (b.n ?? 0) || WEEKDAY_CODES.indexOf(a.day) - WEEKDAY_CODES.indexOf(b.day),
    );
  }
  if (bySetPos) out.bySetPos = bySetPos;
  if (r.wkst && r.wkst !== 'MO') out.wkst = r.wkst;
  if (r.count !== undefined) out.count = r.count;
  if (r.until !== undefined) out.until = r.until;
  return out;
}

/** Tekst reguły w stałej kolejności części. */
export function formatRRule(r: RRule): string {
  const c = canonical(r);
  const parts = [`FREQ=${c.freq}`];
  if (c.interval !== 1) parts.push(`INTERVAL=${c.interval}`);
  if (c.byMonth) parts.push(`BYMONTH=${c.byMonth.join(',')}`);
  if (c.byMonthDay) parts.push(`BYMONTHDAY=${c.byMonthDay.join(',')}`);
  if (c.byDay) parts.push(`BYDAY=${c.byDay.map((b) => `${b.n ?? ''}${b.day}`).join(',')}`);
  if (c.bySetPos) parts.push(`BYSETPOS=${c.bySetPos.join(',')}`);
  if (c.wkst) parts.push(`WKST=${c.wkst}`);
  if (c.count !== undefined) parts.push(`COUNT=${c.count}`);
  if (c.until !== undefined) parts.push(`UNTIL=${c.until.replaceAll('-', '')}`);
  return parts.join(';');
}

export const sameRule = (a: RRule, b: RRule): boolean => formatRRule(a) === formatRRule(b);

/* ───────────── Opis po polsku ───────────── */

export const DAY_SHORT: Record<Weekday, string> = {
  MO: 'pn',
  TU: 'wt',
  WE: 'śr',
  TH: 'cz',
  FR: 'pt',
  SA: 'so',
  SU: 'nd',
};
/** Biernik: „co poniedziałek", „w środę". */
export const DAY_ACC: Record<Weekday, string> = {
  MO: 'poniedziałek',
  TU: 'wtorek',
  WE: 'środę',
  TH: 'czwartek',
  FR: 'piątek',
  SA: 'sobotę',
  SU: 'niedzielę',
};
const FEMININE = new Set<Weekday>(['WE', 'SA', 'SU']);

export const MONTHS = [
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
] as const;

/** 1 raz, 2 razy, 5 razy; 1 tydzień, 2 tygodnie, 5 tygodni. */
export function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  const d = n % 10;
  const t = n % 100;
  return d >= 2 && d <= 4 && (t < 12 || t > 14) ? few : many;
}

const joinAnd = (xs: string[]) =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} i ${xs.at(-1)}`;

function nthDay(b: ByDay): string {
  const fem = FEMININE.has(b.day);
  const n = b.n!;
  if (n === -1) return `${fem ? 'ostatnią' : 'ostatni'} ${DAY_ACC[b.day]}`;
  if (n === -2) return `${fem ? 'przedostatnią' : 'przedostatni'} ${DAY_ACC[b.day]}`;
  if (n < 0) return `${-n}. od końca ${DAY_ACC[b.day]}`;
  return `${n}. ${DAY_ACC[b.day]}`;
}

function monthDayWord(md: number): string {
  if (md === -1) return 'ostatniego dnia';
  if (md === -2) return 'przedostatniego dnia';
  return md > 0 ? `${md}.` : `${-md}. dnia od końca`;
}

const isWorkdays = (byDay?: ByDay[]) =>
  !!byDay &&
  byDay.length === 5 &&
  byDay.every((b) => b.n === undefined) &&
  WORKDAYS.every((d) => byDay.some((b) => b.day === d));

/** „30. lub ostatniego dnia" — tak zapisuje się dawne przycinanie do długości miesiąca. */
function clampDay(r: RRule): number | null {
  const md = r.byMonthDay;
  if (!md || r.byDay || !r.bySetPos || r.bySetPos.length !== 1 || r.bySetPos[0] !== -1) return null;
  if (md[0] !== 28 || md.some((d, i) => d !== 28 + i)) return null;
  return md.at(-1)!;
}

function every(r: RRule): string {
  const n = r.interval;
  switch (r.freq) {
    case 'DAILY':
      return n === 1 ? 'codziennie' : `co ${n} dni`;
    case 'WEEKLY':
      return n === 1 ? 'co tydzień' : `co ${n} ${plural(n, 'tydzień', 'tygodnie', 'tygodni')}`;
    case 'MONTHLY':
      return n === 1 ? 'co miesiąc' : `co ${n} ${plural(n, 'miesiąc', 'miesiące', 'miesięcy')}`;
    case 'YEARLY':
      return n === 1 ? 'co roku' : `co ${n} ${plural(n, 'rok', 'lata', 'lat')}`;
  }
}

function which(r: RRule): string {
  const parts: string[] = [];
  const clamp = clampDay(r);
  if (clamp !== null) parts.push(`${clamp}. lub ostatniego dnia`);
  else if (r.byMonthDay) parts.push(`dnia ${joinAnd(r.byMonthDay.map(monthDayWord))}`);
  if (r.byDay) {
    if (isWorkdays(r.byDay)) parts.push('w dni powszednie');
    else if (r.byDay.every((b) => b.n === undefined))
      parts.push(`w ${r.byDay.map((b) => DAY_SHORT[b.day]).join(', ')}`);
    else
      parts.push(
        `w ${joinAnd(r.byDay.map((b) => (b.n === undefined ? DAY_ACC[b.day] : nthDay(b))))}`,
      );
  }
  if (r.byMonth) parts.push(`w ${r.byMonth.map((m) => MONTHS[m - 1]).join(', ')}`);
  if (r.bySetPos && clamp === null) {
    const pos = r.bySetPos.map((p) =>
      p === -1 ? 'ostatni' : p === -2 ? 'przedostatni' : p > 0 ? `${p}.` : `${-p}. od końca`,
    );
    parts.push(`— ${joinAnd(pos)} z nich`);
  }
  return parts.join(' ');
}

function core(r: RRule): string {
  const single = r.byDay?.length === 1 ? r.byDay[0]! : null;
  // Najczęstsze reguły mówią się krócej niż ogólny wzór.
  if (r.freq === 'WEEKLY' && r.interval === 1 && !r.byMonth && !r.bySetPos) {
    if (single && single.n === undefined) return `co ${DAY_ACC[single.day]}`;
    if (isWorkdays(r.byDay)) return 'w dni powszednie';
  }
  if (r.freq === 'MONTHLY' && r.interval === 1 && !r.byMonth) {
    const md = r.byMonthDay;
    if (md?.length === 1 && !r.byDay && !r.bySetPos)
      return md[0]! > 0 ? `${md[0]}. każdego miesiąca` : `${monthDayWord(md[0]!)} miesiąca`;
    if (clampDay(r) !== null) return `${clampDay(r)}. lub ostatniego dnia miesiąca`;
    if (!md && single?.n !== undefined && !r.bySetPos) return `w ${nthDay(single)} miesiąca`;
    if (!md && isWorkdays(r.byDay) && r.bySetPos?.length === 1) {
      const p = r.bySetPos[0]!;
      if (p === 1) return 'pierwszy dzień powszedni miesiąca';
      if (p === -1) return 'ostatni dzień powszedni miesiąca';
    }
  }
  if (
    r.freq === 'YEARLY' &&
    r.byMonth?.length === 1 &&
    r.byMonthDay?.length === 1 &&
    !r.byDay &&
    !r.bySetPos
  ) {
    const md = r.byMonthDay[0]!;
    const mon = MONTHS[r.byMonth[0]! - 1];
    return `${every(r)} ${md > 0 ? `${md} ${mon}` : `${monthDayWord(md)} ${mon}`}`;
  }
  const w = which(r);
  return w ? `${every(r)} ${w}` : every(r);
}

const fmtDate = (s: string) => {
  const [y, m, d] = ymd(dayNum(s));
  return `${d} ${MONTHS[m - 1]} ${y}`;
};

/**
 * Opis reguły po polsku. `left` mówi, że COUNT to liczba pozostałych
 * wystąpień wzorca („jeszcze 3 razy"), a nie długość nowej serii („3 razy").
 */
export function describeRule(r: RRule, opts: { left?: boolean } = {}): string {
  let s = core(canonical(r));
  if (r.count !== undefined)
    s += `, ${opts.left ? 'jeszcze ' : ''}${r.count} ${plural(r.count, 'raz', 'razy', 'razy')}`;
  if (r.until !== undefined) s += `, do ${fmtDate(r.until)}`;
  return s;
}

/* ───────────── Dawne wzorce ───────────── */

/** Cztery wzorce sprzed RRULE — potrzebne już tylko do migracji i starych plików. */
export type LegacyRepeat =
  | { kind: 'daily' }
  | { kind: 'weekly'; weekday: number }
  | { kind: 'monthly'; dayOfMonth: number }
  | { kind: 'yearly'; month: number; dayOfMonth: number };

export const isLegacy = (x: unknown): x is LegacyRepeat =>
  !!x && typeof x === 'object' && typeof (x as { kind?: unknown }).kind === 'string';

/** Dni tygodnia jak w Date#getDay: 0 = niedziela. */
const JS_DAYS: readonly Weekday[] = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/**
 * Dokładny odpowiednik dawnego wzorca. Dawny dzień miesiąca 29–31 przycinał
 * się do długości miesiąca; iCal takie miesiące pomija. Żeby nic się nie
 * zmieniło: 31 to ostatni dzień (-1), a 29 i 30 — „ten dzień albo ostatni,
 * jeśli miesiąc krótszy" (28..N z BYSETPOS=-1).
 */
export function fromLegacy(r: LegacyRepeat): RRule {
  switch (r.kind) {
    case 'daily':
      return { freq: 'DAILY', interval: 1 };
    case 'weekly':
      return { freq: 'WEEKLY', interval: 1, byDay: [{ day: JS_DAYS[r.weekday] ?? 'MO' }] };
    case 'monthly': {
      const d = r.dayOfMonth;
      if (d <= 28) return { freq: 'MONTHLY', interval: 1, byMonthDay: [d] };
      if (d >= 31) return { freq: 'MONTHLY', interval: 1, byMonthDay: [-1] };
      return {
        freq: 'MONTHLY',
        interval: 1,
        byMonthDay: Array.from({ length: d - 27 }, (_, i) => 28 + i),
        bySetPos: [-1],
      };
    }
    case 'yearly': {
      // Najkrótsza długość miesiąca (luty 28). Dzień dłuższy od niej przycinał
      // się do ostatniego — dla każdego miesiąca to dokładnie -1.
      const shortest = r.month === 2 ? 28 : daysInMonth(2001, r.month);
      const d = r.dayOfMonth > shortest ? -1 : r.dayOfMonth;
      return { freq: 'YEARLY', interval: 1, byMonth: [r.month], byMonthDay: [d] };
    }
  }
}
