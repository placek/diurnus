import type { RRule } from '../rrule';
import { formatRRule, isRealDate, parseRRule } from '../rrule';
import { fmtSlot } from '../md/line';

/*
 * Jedna pozycja w formacie [x]it! (specyfikacja 1.1): linia ze znacznikiem
 * i ciąg dalszy — linie wcięte czterema spacjami.
 *
 *   [znacznik] tekst [-> data[Tgodzina]] [#repeat="RRULE"] [#kategoria] [#id=…|#from=…]
 *       linie opisu
 *       [ ] kroki
 *
 * Znaczniki: `[ ]` otwarte, `[x]` wykonane, `[~]` nieudane (w xit: „obsolete"),
 * `[?]` notatka. `[@]` („ongoing") czyta się jako otwarte. Priorytet xit (`!`,
 * `!!.`) zostaje częścią tekstu, więc wraca bajt w bajt.
 *
 * Człony stoją na końcu linii i czyta się je od końca, aż do pierwszego, który
 * członem nie jest — reszta to tekst. Tekst kończący się czymś, co czytałoby
 * się jako człon, dostaje `\` przed tym słowem; odczyt zdejmuje jeden.
 *
 * Czas to data z godziną ISO 8601, bez strefy: `-> 2026-10-23T14:15` — lokalny
 * czas ściany, jak wszystko w Diurnusie. Odczyt przyjmuje też sekundy `:00`.
 */

export type Marker = 'open' | 'done' | 'failed' | 'note';

export interface XLine {
  marker: Marker;
  text: string;
  date?: string;
  /** kwant początku slotu — zawsze z datą */
  slot?: number;
  pattern?: RRule;
  /** tag kategorii */
  tag?: string;
  /** własny identyfikator wzorca */
  id?: string;
  /** identyfikator wzorca, z którego pozycja jest kopią */
  from?: string;
  /** linie opisu, już bez wcięcia */
  desc?: string[];
  steps?: { text: string; done: boolean }[];
}

const BOX: Record<Marker, string> = { open: '[ ]', done: '[x]', failed: '[~]', note: '[?]' };
const FROM_BOX: Record<string, Marker> = {
  ' ': 'open',
  x: 'done',
  '~': 'failed',
  '?': 'note',
  '@': 'open',
};

/** Wcięcie ciągu dalszego w xit. */
export const INDENT = '    ';

/** Wartość tagu: bez cudzysłowów, gdy się da (litery, cyfry, `_`, `-`). */
const BARE = /^[\p{L}0-9_-]+$/u;
function tagValue(v: string): string {
  if (BARE.test(v)) return v;
  if (!v.includes('"')) return `"${v}"`;
  if (!v.includes("'")) return `'${v}'`;
  throw new Error('Identyfikator nie może mieć obu rodzajów cudzysłowu');
}

/** Słowo-tag xit: `#nazwa` albo `#nazwa=wartość`. */
const TAG_WORD = /^#([\p{L}0-9_-]+)(?:=("[^"]*"|'[^']*'|[\p{L}0-9_-]*))?$/u;
/** Argument `->`, który xit czyta jako termin: zaczyna się od roku. */
const DATE_ARG = /^\d{4}(?:[-/]|$)/;

/** Tagi, które Diurnus zdejmuje z końca linii jako człony. */
const MEMBER_NAMES = ['repeat', 'id', 'from'];

/** Czy słowo (bez ukośników na początku) czytałoby się jako człon. */
function isMember(word: string, isCat: (slug: string) => boolean): boolean {
  const t = TAG_WORD.exec(word.replace(/^\\+/, ''));
  if (!t) return false;
  const name = t[1]!.toLowerCase();
  return t[2] !== undefined ? MEMBER_NAMES.includes(name) : isCat(name);
}

/* ───────────── Ucieczki ───────────── */

const ARROW_TAIL = /(^| )(\\*)-> (\S+)$/;

/**
 * Tekst, którego koniec czytałby się jako człon, dostaje `\`: przed ostatnim
 * słowem, które jest kategorią albo `#repeat=`/`#id=`/`#from=`, i przed `->`,
 * za którym stoi coś jak data. Inne `#tagi` zostają tagami xit w tekście.
 */
export function escapeText(text: string, isCat: (slug: string) => boolean): string {
  let t = text;
  const arrow = ARROW_TAIL.exec(t);
  if (arrow && DATE_ARG.test(arrow[3]!))
    t = `${t.slice(0, arrow.index)}${arrow[1]}\\${arrow[2]}-> ${arrow[3]}`;
  const i = t.lastIndexOf(' ');
  if (isMember(t.slice(i + 1), isCat)) t = `${t.slice(0, i + 1)}\\${t.slice(i + 1)}`;
  return t;
}

/** Odwrotność `escapeText` — na tym, co zostało po zdjęciu członów. */
function unescapeText(text: string, isCat: (slug: string) => boolean): string {
  let t = text;
  const i = t.lastIndexOf(' ');
  const last = t.slice(i + 1);
  if (last.startsWith('\\') && isMember(last, isCat)) t = `${t.slice(0, i + 1)}${last.slice(1)}`;
  const arrow = ARROW_TAIL.exec(t);
  if (arrow && arrow[2] && DATE_ARG.test(arrow[3]!))
    t = `${t.slice(0, arrow.index)}${arrow[1]}${arrow[2].slice(1)}-> ${arrow[3]}`;
  return t;
}

/**
 * Linia opisu, która czytałaby się jako krok, albo pusta (xit nie zna pustych
 * linii w pozycji — pusta kończy grupę): dostaje `\`.
 */
const LOOKS_LIKE_STEP = /^\\*\[[ x]\](?: |$)/;
const ONLY_SLASHES = /^\\*$/;
const needsEscape = (d: string) => LOOKS_LIKE_STEP.test(d) || ONLY_SLASHES.test(d);

export const escapeDesc = (d: string) => (needsEscape(d) ? `\\${d}` : d);
export const unescapeDesc = (d: string) => (d.startsWith('\\') && needsEscape(d) ? d.slice(1) : d);

/* ───────────── Zapis ───────────── */

export function renderItem(l: XLine, isCat: (slug: string) => boolean): string {
  if (/[\r\n]/.test(l.text)) throw new Error('Tekst pozycji musi mieścić się w jednej linii');
  if (l.slot !== undefined && l.date === undefined) throw new Error('Godzina wymaga daty');
  if (l.steps?.length && l.marker === 'note') throw new Error('Notatka nie ma kroków');
  const parts = [BOX[l.marker]];
  const text = escapeText(l.text, isCat);
  if (text) parts.push(text);
  if (l.date !== undefined)
    parts.push('->', l.slot !== undefined ? `${l.date}T${fmtSlot(l.slot)}` : l.date);
  if (l.pattern) parts.push(`#repeat="${formatRRule(l.pattern)}"`);
  if (l.tag !== undefined) parts.push(`#${l.tag}`);
  if (l.id !== undefined) parts.push(`#id=${tagValue(l.id)}`);
  if (l.from !== undefined) parts.push(`#from=${tagValue(l.from)}`);
  const desc = (l.desc ?? []).map((d) => {
    if (/\r/.test(d)) throw new Error('Linia opisu nie może mieć znaku powrotu karetki');
    return INDENT + escapeDesc(d);
  });
  const steps = (l.steps ?? []).map((st) => {
    if (/[\r\n]/.test(st.text)) throw new Error('Krok musi mieścić się w jednej linii');
    const t = st.text.trim();
    return `${INDENT}${st.done ? '[x]' : '[ ]'}${t ? ' ' + t : ''}`;
  });
  return [parts.join(' '), ...desc, ...steps].join('\n');
}

/* ───────────── Odczyt ───────────── */

export type HeadResult = { ok: true; line: XLine } | { ok: false; error: string };
const fail = (error: string): HeadResult => ({ ok: false, error });

/** Linia ze znacznikiem: `[ ]`, `[x]`, `[@]`, `[~]`, `[?]`. */
export const HEAD = /^\[( |x|@|~|\?)\](?: (.*))?$/;

const TAIL_DATE = /(^| )-> (\S+)$/;
const DATE_TIME = /^(\d{4})[-/](\d{2})[-/](\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/;

const unquote = (v: string | undefined) =>
  v === undefined ? '' : /^(["']).*\1$/.test(v) ? v.slice(1, -1) : v;

/**
 * Linia ze znacznikiem na pozycję (bez opisu i kroków). `isCat` mówi, które
 * tagi to kategorie — inne tagi na końcu linii zostają tekstem.
 */
export function parseHead(src: string, isCat: (slug: string) => boolean): HeadResult {
  const m = HEAD.exec(src);
  if (!m) return fail('pozycja musi zaczynać się od znacznika [ ], [x], [@], [~] albo [?]');
  const line: XLine = { marker: FROM_BOX[m[1]!]!, text: '' };
  let rest = m[2] ?? '';

  for (;;) {
    const sp = rest.lastIndexOf(' ');
    const t = TAG_WORD.exec(rest.slice(sp + 1));
    if (t) {
      const name = t[1]!.toLowerCase();
      const value = unquote(t[2]);
      if (t[2] !== undefined) {
        if (name === 'repeat' && !line.pattern) {
          const r = parseRRule(value);
          if (!r.ok) return fail(`reguła „#repeat=${t[2]}": ${r.error}`);
          line.pattern = r.rule;
        } else if (name === 'id' && line.id === undefined && value) line.id = value;
        else if (name === 'from' && line.from === undefined && value) line.from = value;
        else break;
      } else if (line.tag === undefined && isCat(name)) line.tag = name;
      else break;
      rest = rest.slice(0, Math.max(sp, 0));
      continue;
    }
    const d = TAIL_DATE.exec(rest);
    if (d && line.date === undefined && DATE_ARG.test(d[2]!)) {
      const dt = DATE_TIME.exec(d[2]!);
      if (!dt) return fail(`„-> ${d[2]}" — Diurnus potrzebuje dnia (RRRR-MM-DD), nie okresu`);
      const date = `${dt[1]}-${dt[2]}-${dt[3]}`;
      if (!isRealDate(date)) return fail(`nieprawidłowa data „${d[2]}"`);
      line.date = date;
      if (dt[4] !== undefined) {
        const h = Number(dt[4]);
        const mi = Number(dt[5]);
        if (h > 23 || mi % 15 !== 0 || mi > 45 || (dt[6] !== undefined && dt[6] !== '00'))
          return fail(`godzina „${d[2]}" musi być pełnym kwadransem`);
        line.slot = h * 4 + mi / 15;
      }
      rest = rest.slice(0, d.index);
      continue;
    }
    break;
  }
  if (line.id !== undefined && line.from !== undefined) return fail('#id i #from naraz');
  line.text = unescapeText(rest, isCat);
  return { ok: true, line };
}

/** Linia kroku w ciągu dalszym, już bez wcięcia. */
export const STEP = /^\[( |x)\](?: (.*))?$/;
