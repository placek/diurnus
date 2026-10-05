import { normalize } from '../model';
import { advance, pin } from '../rrule';
import { shiftDay } from '../time';
import { slotFits, violations } from '../machine';
import type { DayHours, Item, ItemState } from '../machine';
import type { State } from '../types';
import { projectOf } from '../categories';
import { backlogGroups, todayList } from '../view';
import { parseConfig, renderConfig } from './config';
import { descIndent, descLines, parseLine, renderLine } from './line';
import type { Line } from './line';
import { tagsFor } from './slug';

/*
 * Stan ↔ pliki. Dziś i backlog to stan żywy; pliki minionych dni to archiwum
 * wykonanych i notatek. Zapis jest kanoniczny, odczyt ścisły: plik, którego
 * nie da się przedstawić jako stan, jest odrzucany w całości.
 */

export const BACKLOG = 'BACKLOG.md';
export const CONFIG = '.diurnus.toml';
export const dayFile = (day: string) => `${day}.md`;
const DAY_FILE = /^(\d{4}-\d{2}-\d{2})\.md$/;

export type Files = Record<string, string>;

export interface FileError {
  file: string | null;
  /** numer linii od 1; `null` — błąd całego pliku */
  line: number | null;
  message: string;
}

export type ParseResult = { ok: true; state: State } | { ok: false; errors: FileError[] };

/* ───────────── Zapis ───────────── */

/** `inProject` — kategoria projektu, pod którego nagłówkiem stoi linia: jej tag jest zbędny. */
function lineOf(i: Item, tags: Map<string, string>, inProject?: string): Line {
  const s = i.state;
  const tag = i.cat !== undefined && i.cat !== inProject ? tags.get(i.cat) : undefined;
  const desc = descLines(i.desc);
  const base = {
    text: i.text,
    ...(tag !== undefined ? { tag } : {}),
    ...(desc.length ? { desc } : {}),
  };
  // Kopia wzorca niesie identyfikator wzorca; sam wzorzec — własny.
  const from = i.from !== undefined ? { id: i.from } : {};
  switch (s.tag) {
    case 'today-task':
      return {
        marker: s.done ? 'done' : 'open',
        ...(s.slot !== null ? { slot: s.slot } : {}),
        ...base,
        ...from,
      };
    case 'past-done':
      return { marker: 'done', ...(s.slot !== null ? { slot: s.slot } : {}), ...base, ...from };
    case 'today-note':
    case 'backlog-note':
    case 'past-note':
      return { marker: 'note', ...base, ...from };
    case 'backlog-task': {
      const w = s.when;
      if (!w) return { marker: 'open', ...base, ...from };
      if (w.type === 'date') return { marker: 'open', date: w.date, ...base, ...from };
      if (w.type === 'dateSlot')
        return { marker: 'open', date: w.date, slot: w.slot, ...base, ...from };
      return {
        marker: 'open',
        date: w.next,
        pattern: w.rule,
        ...(w.slot !== null ? { slot: w.slot } : {}),
        ...base,
        id: i.id,
      };
    }
  }
}

const file = (heading: string, lines: string[]) =>
  lines.length ? `${heading}\n\n${lines.join('\n')}\n` : `${heading}\n`;

/**
 * Backlog: najpierw pozycje spoza projektów, potem sekcja `## Nazwa` na każdy
 * projekt, który ma pozycje. Pod nagłówkiem linia nie powtarza tagu projektu —
 * tag stoi tylko przy podkategorii projektu.
 */
function renderBacklog(s: State, tags: Map<string, string>): string {
  const groups = backlogGroups(s.items, s.cats);
  const parts = ['# Backlog'];
  for (const g of groups) {
    if (!g.items.length) continue;
    if (g.project) parts.push('', `## ${g.project.name.trim()}`);
    parts.push('', g.items.map((i) => renderLine(lineOf(i, tags, g.project?.id))).join('\n'));
  }
  return parts.join('\n') + '\n';
}

export function renderFiles(s: State): Files {
  const tags = tagsFor(s.cats);
  const line = (i: Item) => renderLine(lineOf(i, tags));
  const out: Files = {
    [CONFIG]: renderConfig({ cats: s.cats, day: s.day }),
    [dayFile(s.today)]: file(`# ${s.today}`, todayList(s.items).map(line)),
    [BACKLOG]: renderBacklog(s, tags),
  };
  // Archiwum: każdy miniony dzień, w którym coś zostało, w kolejności pozycji.
  const past = new Map<string, Item[]>();
  for (const i of s.items) {
    if (i.state.tag !== 'past-done' && i.state.tag !== 'past-note') continue;
    const d = i.state.day;
    past.set(d, [...(past.get(d) ?? []), i]);
  }
  for (const [d, items] of past) out[dayFile(d)] = file(`# ${d}`, items.map(line));
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
  cats: State['cats'];
  errors: FileError[];
}

/** Stan pozycji z linii, zgodnie z tym, co wolno w danym pliku; `string` to powód odmowy. */
function stateOf(l: Line, ctx: Ctx): { state: ItemState; patternId?: string } | string {
  const { kind } = ctx;
  if (kind.type !== 'backlog' && (l.date !== undefined || l.pattern))
    return 'data i wzorzec należą do backlogu, nie do pliku dnia';

  if (l.marker === 'note') {
    if (l.slot !== undefined || l.date !== undefined || l.pattern)
      return 'notatka nie ma czasu, daty ani wzorca';
    if (kind.type === 'backlog') return { state: { tag: 'backlog-note' } };
    if (kind.type === 'past') return { state: { tag: 'past-note', day: kind.day } };
    return { state: { tag: 'today-note' } };
  }

  const slot = l.slot ?? null;
  if (kind.type === 'today')
    return { state: { tag: 'today-task', done: l.marker === 'done', slot } };
  if (kind.type === 'past') {
    if (l.marker === 'open')
      return 'otwarte zadanie nie zostaje w minionym dniu — o północy przechodzi dalej';
    return { state: { tag: 'past-done', day: kind.day, slot } };
  }

  // Backlog.
  if (l.marker === 'done') return 'wykonane nie mieszka w backlogu — odhaczone trafia do dziś';
  if (slot !== null && !slotFits(slot, ctx.hours))
    return 'godzina nie mieści się w dniu z ustawień';
  if (l.pattern) {
    // Data w linii to najbliższe wystąpienie, a COUNT — ile zostało od niego.
    // Wzorzec wpisany bez daty zaczyna się od pierwszego wystąpienia po dziś.
    // Data, która nie pasuje do reguły, jest początkiem serii: liczy się
    // pierwsze pasujące od niej.
    const anchor = l.date ?? ctx.today;
    const rule = pin(l.pattern, anchor);
    const first = advance(rule, anchor, l.date ? shiftDay(l.date, -1) : ctx.today);
    if (!first) return 'reguła nie ma już żadnego wystąpienia';
    return {
      state: {
        tag: 'backlog-task',
        when: { type: 'recurring', rule: first.rule, slot, next: first.next },
      },
      ...(l.id !== undefined ? { patternId: l.id } : {}),
    };
  }
  if (l.date === undefined) {
    if (slot !== null) return 'godzina w backlogu wymaga daty';
    return { state: { tag: 'backlog-task', when: null } };
  }
  return {
    state: {
      tag: 'backlog-task',
      when:
        slot === null ? { type: 'date', date: l.date } : { type: 'dateSlot', date: l.date, slot },
    },
  };
}

function parseItems(text: string, heading: string, ctx: Ctx): Item[] {
  const lines = text.split('\n').map((l) => l.replace(/\r$/, ''));
  if (lines.at(-1) === '') lines.pop();
  const err = (line: number | null, message: string) =>
    ctx.errors.push({ file: ctx.name, line, message });

  if (lines[0] !== heading) {
    err(1, `pierwsza linia musi być nagłówkiem „${heading}"`);
    return [];
  }
  const items: Item[] = [];
  /** Pozycja, pod którą mogą stać linie opisu, i jej wcięcie; `null` — przerwa po błędzie. */
  let last: { item: Item; indent: number; desc: string[]; blanks: number } | null = null;
  /** sekcja projektu, w której stoją kolejne linie backlogu; `null` — przed pierwszym `##` */
  let section: State['cats'][number] | null = null;
  const seen = new Set<string>();
  let broken = false;
  const close = () => {
    if (last?.desc.length) {
      const i = items.indexOf(last.item);
      items[i] = { ...last.item, desc: last.desc.join('\n') };
    }
    last = null;
  };
  lines.slice(1).forEach((src, n) => {
    const no = n + 2;
    if (src.trim() === '') {
      if (last) last.blanks++;
      return;
    }
    // Wcięta linia to opis pozycji nad nią.
    if (/^[ \t]/.test(src)) {
      if (broken) return; // opis pozycji, której nie przyjęto — błąd już zgłoszony
      if (!last) return err(no, 'wcięta linia opisu bez pozycji nad nią');
      const cut = /^[ \t]*/.exec(src)![0].length;
      const body = src.slice(Math.min(cut, last.indent)).replace(/\s+$/, '');
      for (; last.blanks > 0; last.blanks--) last.desc.push('');
      last.desc.push(body);
      return;
    }
    close();
    broken = true;
    // Nagłówek projektu: kolejne linie należą do niego.
    const h = /^##(?:\s+(.*))?$/.exec(src);
    if (h) {
      if (ctx.kind.type !== 'backlog')
        return err(no, 'nagłówki projektów (##) są tylko w BACKLOG.md');
      const name = (h[1] ?? '').trim();
      const p = ctx.cats.find(
        (c) => c.project && !c.archived && c.name.trim().toLowerCase() === name.toLowerCase(),
      );
      if (!p) return err(no, `nieznany projekt „${name}" — nie ma go w ${CONFIG}`);
      if (seen.has(p.id)) return err(no, `projekt „${name}" ma już swoją sekcję`);
      seen.add(p.id);
      section = p;
      broken = false;
      return;
    }
    const p = parseLine(src);
    if (!p.ok) return err(no, p.error);
    const l = p.line;
    const st = stateOf(l, ctx);
    if (typeof st === 'string') return err(no, st);
    let cat: string | undefined;
    if (l.tag !== undefined) {
      cat = ctx.catOfTag.get(l.tag);
      if (cat === undefined) return err(no, `nieznany tag „#${l.tag}" — nie ma go w ${CONFIG}`);
      if (section && projectOf(ctx.cats, cat)?.id !== section.id)
        return err(no, `„#${l.tag}" nie należy do projektu „${section.name.trim()}"`);
    } else if (section) cat = section.id;
    const isPattern = st.state.tag === 'backlog-task' && st.state.when?.type === 'recurring';
    const item: Item = {
      id: isPattern && l.id !== undefined ? l.id : `${ctx.name}:${no}`,
      text: l.text,
      state: st.state,
      ...(cat !== undefined ? { cat } : {}),
      ...(!isPattern && l.id !== undefined ? { from: l.id } : {}),
    };
    items.push(item);
    broken = false;
    last = { item, indent: descIndent(l.marker), desc: [], blanks: 0 };
  });
  close();
  return items;
}

export function parseFiles(files: Files): ParseResult {
  const errors: FileError[] = [];

  for (const name of Object.keys(files))
    if (name !== BACKLOG && name !== CONFIG && !DAY_FILE.test(name))
      errors.push({ file: name, line: null, message: 'nieznany plik' });

  const days = Object.keys(files)
    .map((n) => DAY_FILE.exec(n)?.[1])
    .filter((d): d is string => d !== undefined)
    .sort();
  const today = days.at(-1);
  if (!today) errors.push({ file: null, line: null, message: 'brak pliku dnia RRRR-MM-DD.md' });

  const cfgText = files[CONFIG];
  const cfg = cfgText === undefined ? defaultConfig() : parseConfig(cfgText);
  if (!cfg.ok) for (const m of cfg.errors) errors.push({ file: CONFIG, line: null, message: m });
  if (!today || !cfg.ok) return { ok: false, errors };

  const { cats, day } = cfg.config;
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
    items.push(...parseItems(files[name]!, `# ${d}`, ctx(name, kind)));
  }
  if (files[BACKLOG] !== undefined)
    items.push(...parseItems(files[BACKLOG], '# Backlog', ctx(BACKLOG, { type: 'backlog' })));

  if (errors.length) return { ok: false, errors };

  // Niezmienniki maszyny: to, czego aplikacja nie umie pokazać, nie wchodzi.
  for (const v of violations({ today, items }, hours))
    errors.push({ file: null, line: null, message: v });
  if (errors.length) return { ok: false, errors };

  return { ok: true, state: { v: 7, cats, day, today, items } };
}

// Brak pliku ustawień: domyślne kategorie i doba, z tagami z nazw.
function defaultConfig(): { ok: true; config: { cats: State['cats']; day: State['day'] } } {
  const s = normalize(null);
  const tags = tagsFor(s.cats);
  const cats = s.cats.map((c) => ({
    ...c,
    id: tags.get(c.id)!,
    tag: tags.get(c.id)!,
    parent: c.parent ? tags.get(c.parent)! : null,
  }));
  return { ok: true, config: { cats, day: s.day } };
}
