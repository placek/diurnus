import { advance, pin } from '../rrule';
import { shiftDay } from '../time';
import { slotFits, violations } from '../machine';
import type { DayHours, Item, ItemState, Step } from '../machine';
import type { Category, State } from '../types';
import { projectOf } from '../categories';
import { backlogGroups, todayList } from '../view';
import { parseConfig, renderConfig } from '../md/config';
import { CONFIG, defaultConfig } from '../md/files';
import type { FileError, Files, ParseResult } from '../md/files';
import { descLines } from '../md/line';
import { tagsFor } from '../md/slug';
import { INDENT, STEP, parseHead, renderItem, unescapeDesc } from './line';
import type { XLine } from './line';

/*
 * Stan ↔ pliki [x]it!. Te same zasady co w plikach Markdown: dziś i backlog to
 * stan żywy, minione dni — archiwum wykonanych, nieudanych i notatek. Zapis jest
 * kanoniczny, odczyt ścisły: plik, którego nie da się przedstawić jako stan,
 * jest odrzucany w całości.
 *
 * Plik dnia nie ma nagłówka — datę niesie nazwa. Backlog to grupy xit: najpierw
 * pozycje spoza projektów, potem grupa na każdy projekt, z jego nazwą jako
 * tytułem, oddzielone pustą linią.
 */

export const BACKLOG = 'BACKLOG.xit';
export const dayFile = (day: string) => `${day}.xit`;
export const DAY_FILE = /^(\d{4}-\d{2}-\d{2})\.xit$/;

/* ───────────── Zapis ───────────── */

/**
 * `today` — data, którą niesie godzina dzisiejszego zadania; `inProject` —
 * kategoria projektu, w którego grupie stoi pozycja: jej tag jest zbędny.
 */
function lineOf(i: Item, tags: Map<string, string>, today: string, inProject?: string): XLine {
  const s = i.state;
  const tag = i.cat !== undefined && i.cat !== inProject ? tags.get(i.cat) : undefined;
  const desc = descLines(i.desc);
  const steps = (i.steps ?? []).map((st) => ({ text: st.text, done: st.done }));
  const base = {
    text: i.text,
    ...(tag !== undefined ? { tag } : {}),
    ...(desc.length ? { desc } : {}),
    ...(steps.length ? { steps } : {}),
    ...(i.from !== undefined ? { from: i.from } : {}),
  };
  switch (s.tag) {
    case 'today-task':
    case 'past-done': {
      const date = s.tag === 'past-done' ? s.day : today;
      const marker = s.failed ? 'failed' : s.tag === 'past-done' || s.done ? 'done' : 'open';
      return {
        marker,
        ...(s.slot !== null ? { date, slot: s.slot } : {}),
        ...base,
      };
    }
    case 'today-note':
    case 'backlog-note':
    case 'past-note':
      return { marker: 'note', ...base };
    case 'backlog-task': {
      const w = s.when;
      if (!w) return { marker: 'open', ...base };
      if (w.type === 'date') return { marker: 'open', date: w.date, ...base };
      if (w.type === 'dateSlot') return { marker: 'open', date: w.date, slot: w.slot, ...base };
      const { from: _from, ...rest } = base;
      return {
        marker: 'open',
        date: w.next,
        pattern: w.rule,
        ...(w.slot !== null ? { slot: w.slot } : {}),
        ...rest,
        id: i.id,
      };
    }
  }
}

/** Tytuł grupy nie może zaczynać się od `[` (byłby pozycją) ani od spacji. */
const escapeTitle = (t: string) => (/^[\\[]/.test(t) ? `\\${t}` : t);
const unescapeTitle = (t: string) => (/^\\[\\[]/.test(t) ? t.slice(1) : t);

export function renderXit(s: State): Files {
  const tags = tagsFor(s.cats);
  const slugs = new Set(tags.values());
  const isCat = (slug: string) => slugs.has(slug);
  const line = (i: Item, inProject?: string) =>
    renderItem(lineOf(i, tags, s.today, inProject), isCat);
  const day = (items: Item[]) => items.map((i) => line(i) + '\n').join('');

  const groups: string[] = [];
  for (const g of backlogGroups(s.items, s.cats)) {
    if (!g.items.length) continue;
    const body = g.items.map((i) => line(i, g.project?.id)).join('\n');
    groups.push(g.project ? `${escapeTitle(g.project.name.trim())}\n${body}` : body);
  }

  const out: Files = {
    [CONFIG]: renderConfig({
      format: 'xit',
      cats: s.cats,
      day: s.day,
      ...(s.theme !== undefined ? { theme: s.theme } : {}),
    }),
    [dayFile(s.today)]: day(todayList(s.items)),
    [BACKLOG]: groups.length ? groups.join('\n\n') + '\n' : '',
  };
  // Archiwum: każdy miniony dzień, w którym coś zostało, w kolejności pozycji.
  const past = new Map<string, Item[]>();
  for (const i of s.items) {
    if (i.state.tag !== 'past-done' && i.state.tag !== 'past-note') continue;
    const d = i.state.day;
    past.set(d, [...(past.get(d) ?? []), i]);
  }
  for (const [d, items] of past) out[dayFile(d)] = day(items);
  return out;
}

/* ───────────── Odczyt ───────────── */

type Kind = { type: 'today'; day: string } | { type: 'past'; day: string } | { type: 'backlog' };

interface Ctx {
  name: string;
  kind: Kind;
  today: string;
  hours: DayHours;
  catOfTag: Map<string, string>;
  cats: Category[];
  errors: FileError[];
}

/** Stan pozycji z linii, zgodnie z tym, co wolno w danym pliku; `string` to powód odmowy. */
function stateOf(l: XLine, ctx: Ctx): ItemState | string {
  const { kind } = ctx;
  if (l.id !== undefined && !l.pattern) return '#id ma tylko wzorzec (#repeat)';
  if (l.from !== undefined && l.pattern) return 'wzorzec nie jest kopią — #from nie pasuje';

  if (kind.type !== 'backlog') {
    if (l.pattern) return 'wzorzec należy do backlogu, nie do pliku dnia';
    if (l.date !== undefined && l.date !== kind.day)
      return `inna data niż dzień pliku (${kind.day}) — pozycje z datą należą do backlogu`;
  }

  if (l.marker === 'note') {
    if (l.date !== undefined || l.pattern) return 'notatka nie ma terminu ani wzorca';
    if (kind.type === 'backlog') return { tag: 'backlog-note' };
    if (kind.type === 'past') return { tag: 'past-note', day: kind.day };
    return { tag: 'today-note' };
  }

  const slot = l.slot ?? null;
  const failed = l.marker === 'failed' ? { failed: true as const } : {};
  if (kind.type === 'today')
    return { tag: 'today-task', done: l.marker === 'done', slot, ...failed };
  if (kind.type === 'past') {
    if (l.marker === 'open')
      return 'otwarte zadanie nie zostaje w minionym dniu — o północy przechodzi dalej';
    return { tag: 'past-done', day: kind.day, slot, ...failed };
  }

  // Backlog.
  if (l.marker === 'done') return 'wykonane nie mieszka w backlogu — odhaczone trafia do dziś';
  if (l.marker === 'failed') return 'nieudane nie mieszka w backlogu — zamknięte trafia do dziś';
  if (slot !== null && !slotFits(slot, ctx.hours))
    return 'godzina nie mieści się w dniu z ustawień';
  if (l.pattern) {
    // Data to najbliższe wystąpienie, a COUNT — ile zostało od niego. Wzorzec
    // bez daty zaczyna się od pierwszego wystąpienia po dziś; data, która nie
    // pasuje do reguły, jest początkiem serii.
    const anchor = l.date ?? ctx.today;
    const rule = pin(l.pattern, anchor);
    const first = advance(rule, anchor, l.date ? shiftDay(l.date, -1) : ctx.today);
    if (!first) return 'reguła nie ma już żadnego wystąpienia';
    return {
      tag: 'backlog-task',
      when: { type: 'recurring', rule: first.rule, slot, next: first.next },
    };
  }
  if (l.date === undefined) return { tag: 'backlog-task', when: null };
  return {
    tag: 'backlog-task',
    when: slot === null ? { type: 'date', date: l.date } : { type: 'dateSlot', date: l.date, slot },
  };
}

function parseItems(text: string, ctx: Ctx): Item[] {
  const lines = text.split('\n').map((l) => l.replace(/\r$/, ''));
  if (lines.at(-1) === '') lines.pop();
  const err = (line: number | null, message: string) =>
    ctx.errors.push({ file: ctx.name, line, message });
  const isCat = (slug: string) => ctx.catOfTag.has(slug);

  const items: Item[] = [];
  /** Pozycja, pod którą mogą stać linie opisu i kroki. */
  let last: { item: Item; task: boolean; desc: string[]; steps: Step[] } | null = null;
  /** projekt grupy, w której stoją kolejne pozycje backlogu; `null` — grupa bez tytułu */
  let section: Category | null = null;
  /** czy bieżąca grupa ma już jakąś linię — tytuł może być tylko pierwszy */
  let inGroup = false;
  /** linia nad nami nie weszła — jej ciąg dalszy pomijamy, błąd już zgłoszony */
  let broken = false;
  const seen = new Set<string>();
  const close = () => {
    if (last && (last.desc.length || last.steps.length)) {
      const i = items.indexOf(last.item);
      items[i] = {
        ...last.item,
        ...(last.desc.length ? { desc: last.desc.join('\n') } : {}),
        ...(last.steps.length ? { steps: last.steps } : {}),
      };
    }
    last = null;
  };

  lines.forEach((src, n) => {
    const no = n + 1;
    // Pusta linia kończy grupę.
    if (src.trim() === '') {
      close();
      section = null;
      inGroup = false;
      broken = false;
      return;
    }
    if (src.startsWith(INDENT)) {
      if (broken) return;
      if (!last) return err(no, 'wcięta linia bez pozycji nad nią');
      const body = src.slice(INDENT.length).replace(/\s+$/, '');
      const step = last.task ? STEP.exec(body) : null;
      if (step) last.steps.push({ text: step[2] ?? '', done: step[1] === 'x' });
      else last.desc.push(unescapeDesc(body));
      return;
    }
    close();
    broken = true;
    if (/^[ \t]/.test(src)) return err(no, 'ciąg dalszy pozycji wcina się czterema spacjami');

    if (!src.startsWith('[')) {
      // Tytuł grupy: w backlogu nazwa projektu.
      if (ctx.kind.type !== 'backlog') return err(no, 'tytuły grup są tylko w ' + BACKLOG);
      if (inGroup) return err(no, 'tytuł grupy musi być jej pierwszą linią — brak pustej linii?');
      inGroup = true;
      const name = unescapeTitle(src).trim();
      const p = ctx.cats.find(
        (c) => c.project && !c.archived && c.name.trim().toLowerCase() === name.toLowerCase(),
      );
      if (!p) return err(no, `nieznany projekt „${name}" — nie ma go w ${CONFIG}`);
      if (seen.has(p.id)) return err(no, `projekt „${name}" ma już swoją grupę`);
      seen.add(p.id);
      section = p;
      broken = false;
      return;
    }
    inGroup = true;
    const h = parseHead(src, isCat);
    if (!h.ok) return err(no, h.error);
    const l = h.line;
    const st = stateOf(l, ctx);
    if (typeof st === 'string') return err(no, st);
    let cat: string | undefined;
    if (l.tag !== undefined) {
      cat = ctx.catOfTag.get(l.tag)!;
      if (section && projectOf(ctx.cats, cat)?.id !== section.id)
        return err(no, `„#${l.tag}" nie należy do projektu „${section.name.trim()}"`);
    } else if (section) cat = section.id;
    const item: Item = {
      id: l.id ?? `${ctx.name}:${no}`,
      text: l.text,
      state: st,
      ...(cat !== undefined ? { cat } : {}),
      ...(l.from !== undefined ? { from: l.from } : {}),
    };
    items.push(item);
    broken = false;
    last = { item, task: l.marker !== 'note', desc: [], steps: [] };
  });
  close();
  return items;
}

export function parseXit(files: Files): ParseResult {
  const errors: FileError[] = [];

  for (const name of Object.keys(files))
    if (name !== BACKLOG && name !== CONFIG && !DAY_FILE.test(name))
      errors.push({ file: name, line: null, message: 'nieznany plik' });

  const days = Object.keys(files)
    .map((n) => DAY_FILE.exec(n)?.[1])
    .filter((d): d is string => d !== undefined)
    .sort();
  const today = days.at(-1);
  if (!today) errors.push({ file: null, line: null, message: 'brak pliku dnia RRRR-MM-DD.xit' });

  const cfgText = files[CONFIG];
  const cfg = cfgText === undefined ? defaultConfig() : parseConfig(cfgText);
  if (!cfg.ok) for (const m of cfg.errors) errors.push({ file: CONFIG, line: null, message: m });
  if (!today || !cfg.ok) return { ok: false, errors };

  const { cats, day, theme } = cfg.config;
  const hours = { q0: day.start * 4, q1: day.end * 4 };
  const catOfTag = new Map(cats.map((c) => [c.tag!, c.id]));
  const ctx = (name: string, kind: Kind): Ctx => ({
    name,
    kind,
    today,
    hours,
    catOfTag,
    cats,
    errors,
  });

  const items: Item[] = [];
  for (const d of days) {
    const name = dayFile(d);
    const kind: Kind = d === today ? { type: 'today', day: d } : { type: 'past', day: d };
    items.push(...parseItems(files[name]!, ctx(name, kind)));
  }
  if (files[BACKLOG] !== undefined)
    items.push(...parseItems(files[BACKLOG], ctx(BACKLOG, { type: 'backlog' })));

  if (errors.length) return { ok: false, errors };

  // Niezmienniki maszyny: to, czego aplikacja nie umie pokazać, nie wchodzi.
  for (const v of violations({ today, items }, hours))
    errors.push({ file: null, line: null, message: v });
  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    state: { v: 7, cats, day, today, items, ...(theme !== undefined ? { theme } : {}) },
  };
}
