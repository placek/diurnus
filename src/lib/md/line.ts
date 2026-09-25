import type { RRule } from '../rrule';
import { pad } from '../time';
import { parsePattern, patternWord } from './pattern';
import { TAG } from './slug';

/*
 * Jedna linia pozycji. Człony stoją zawsze w tej samej kolejności, każdy
 * opcjonalny, oddzielone jedną spacją:
 *
 *   * [znacznik] [data] [{wzorzec}] [GG:MM] [#tag] tekst [^id]
 *
 * Linia nie wie, w którym pliku stoi — co wolno gdzie, sprawdza plik.
 */

export interface Line {
  marker: 'note' | 'open' | 'done';
  date?: string;
  pattern?: RRule;
  /** kwant początku slotu */
  slot?: number;
  tag?: string;
  text: string;
  id?: string;
}

const MARKER = { open: '[ ]', done: '[x]' } as const;

/** Tekst zaczynający się tak, jak mógłby zacząć się człon, dostaje `\`. */
const NEEDS_LEAD = /^[\\[{#0-9]/;
/** Ostatnie słowo, które czytałoby się jako `^id`. */
const LOOKS_LIKE_ID = /^\\*\^/;

const lastSpace = (s: string) => s.lastIndexOf(' ');

/**
 * Najpierw początek, potem ostatnie słowo; odczyt robi to samo w odwrotnej
 * kolejności, więc jedno jest dokładną odwrotnością drugiego.
 */
export function escapeText(text: string): string {
  let t = NEEDS_LEAD.test(text) ? `\\${text}` : text;
  const i = lastSpace(t);
  if (LOOKS_LIKE_ID.test(t.slice(i + 1))) t = `${t.slice(0, i + 1)}\\${t.slice(i + 1)}`;
  return t;
}

export const fmtSlot = (q: number) => `${pad(Math.floor(q / 4))}:${pad((q % 4) * 15)}`;

export function renderLine(l: Line): string {
  if (/[\r\n]/.test(l.text)) throw new Error('Tekst pozycji musi mieścić się w jednej linii');
  const parts = ['*'];
  if (l.marker !== 'note') parts.push(MARKER[l.marker]);
  if (l.date !== undefined) parts.push(l.date);
  if (l.pattern) parts.push(`{${patternWord(l.pattern)}}`);
  if (l.slot !== undefined) parts.push(fmtSlot(l.slot));
  if (l.tag !== undefined) parts.push(`#${l.tag}`);
  if (l.text) parts.push(escapeText(l.text));
  if (l.id !== undefined) parts.push(`^${l.id}`);
  return parts.join(' ');
}

export function isRealDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
}

export type LineResult = { ok: true; line: Line } | { ok: false; error: string };
const fail = (error: string): LineResult => ({ ok: false, error });

/**
 * Rozbiór linii. Człony są czytane łapczywie i w ustalonej kolejności; coś, co
 * wygląda na człon, ale nim nie jest (`09:07`, `2026-02-30`, `#Praca`), to błąd,
 * a nie tekst — literówka nie może cicho zmienić znaczenia pozycji.
 */
export function parseLine(src: string): LineResult {
  let rest: string;
  if (src === '*') rest = '';
  else if (src.startsWith('* ')) rest = src.slice(2);
  else return fail('pozycja musi zaczynać się od „* "');

  const line: Line = { marker: 'note', text: '' };
  const take = (re: RegExp): RegExpExecArray | null => {
    const m = re.exec(rest);
    if (m) rest = rest.slice(m[0].length).replace(/^ /, '');
    return m;
  };

  const marker = take(/^\[( |x)\](?= |$)/);
  if (marker) line.marker = marker[1] === 'x' ? 'done' : 'open';

  const date = take(/^\d{4}-\d{2}-\d{2}(?= |$)/);
  if (date) {
    if (!isRealDate(date[0])) return fail(`nieprawidłowa data „${date[0]}"`);
    line.date = date[0];
  }

  const pattern = take(/^\{([^}]*)\}(?= |$)/);
  if (pattern) {
    const r = parsePattern(pattern[1]!);
    if (!r.ok) return fail(r.error);
    line.pattern = r.rule;
  }

  const time = take(/^(\d{1,2}):(\d{2})(?= |$)/);
  if (time) {
    const h = Number(time[1]);
    const mi = Number(time[2]);
    if (time[1]!.length !== 2 || h > 23 || mi % 15 !== 0 || mi > 45)
      return fail(`godzina „${time[0]}" musi być pełnym kwadransem GG:MM`);
    line.slot = h * 4 + mi / 15;
  }

  const tag = take(/^#(\S+)(?= |$)/);
  if (tag) {
    if (!TAG.test(tag[1]!)) return fail(`nieprawidłowy tag „#${tag[1]}"`);
    line.tag = tag[1]!;
  }

  // Na końcu: identyfikator, jeśli ostatnie słowo to `^coś`.
  const i = lastSpace(rest);
  if (/^\^\S+$/.test(rest.slice(i + 1))) {
    line.id = rest.slice(i + 2);
    rest = i < 0 ? '' : rest.slice(0, i);
  }
  // `\^coś` jako ostatnie słowo tekstu to tekst: zdejmujemy jeden ukośnik.
  const j = lastSpace(rest);
  if (/^\\+\^/.test(rest.slice(j + 1))) rest = rest.slice(0, j + 1) + rest.slice(j + 2);

  let text = rest;
  if (text.startsWith('\\')) text = text.slice(1);
  else if (NEEDS_LEAD.test(text)) {
    // Człon w złym miejscu albo tekst bez ucieczki: jedno i drugie jest niejednoznaczne.
    return fail(
      `„${text.split(' ')[0]}" stoi w miejscu tekstu — człon w złej kolejności albo brak „\\" przed tekstem`,
    );
  }
  line.text = text;
  return { ok: true, line };
}
