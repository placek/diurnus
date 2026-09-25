import { nextOccurrence } from './repeat';
import type { Repeat } from './repeat';
import { shiftDay } from './time';
import { QDAY } from './types';

/*
 * Maszyna stanów pozycji — zaakceptowany graf opisuje
 * docs/superpowers/specs/2026-09-25-diurnus-state-machine-design.md.
 *
 * Każda pozycja jest w dokładnie jednym stanie z zamkniętego zbioru. Siatka
 * dnia nie ma własnych danych: to rzut dzisiejszych zadań ze slotem.
 * `step()` jest czystą funkcją: ten sam stan i to samo zdarzenie dają zawsze
 * ten sam wynik. Zegar wchodzi wyłącznie zdarzeniem `advance` — północ
 * i początek dnia są przejściami jak każde inne, nie efektem ubocznym timera.
 * Zdarzenie, którego graf nie przewiduje, nie zmienia niczego po cichu:
 * zwraca nazwaną odmowę.
 */

/** Początek slotu w kwantach od północy. Slot trwa zawsze SLOT_LEN kwantów. */
export type Slot = number;
export const SLOT_LEN = 2; // 30 minut

/** Wiązanie czasowe pozycji backlogu. */
export type When =
  | { type: 'date'; date: string }
  | { type: 'dateSlot'; date: string; slot: Slot }
  /** `next` — najbliższe wystąpienie; ≤ dziś znaczy „zaległe, ponów o świcie". */
  | { type: 'recurring'; rule: Repeat; slot: Slot | null; next: string };

/** To samo, ale tak, jak podaje je użytkownik: `next` wylicza maszyna. */
export type WhenInput =
  | { type: 'date'; date: string }
  | { type: 'dateSlot'; date: string; slot: Slot }
  | { type: 'recurring'; rule: Repeat; slot: Slot | null };

export type State =
  | { tag: 'today-task'; done: boolean; slot: Slot | null }
  | { tag: 'today-note' }
  | { tag: 'backlog-task'; when: When | null }
  | { tag: 'backlog-note' }
  /** Zadania wykonane i notatki zostają w swoim dniu; tylko do odczytu. */
  | { tag: 'past-done'; day: string; slot: Slot | null }
  | { tag: 'past-note'; day: string };

export interface Item {
  readonly id: string;
  readonly text: string;
  readonly state: State;
}

export interface Machine {
  /** Dzień, dla którego stan jest aktualny; zmienia go tylko `advance`. */
  readonly today: string;
  readonly items: readonly Item[];
}

/** Aktywna część doby z ustawień, w kwantach: `[q0, q1)`. */
export interface DayHours {
  readonly q0: number;
  readonly q1: number;
}

export type Event =
  | { type: 'create'; id: string; text: string; place: 'today' | 'backlog' }
  /** `copyId` nazywa kopię, gdy odhaczana jest pozycja powtarzalna. */
  | { type: 'markDone'; id: string; copyId: string }
  | { type: 'markOpen'; id: string }
  | { type: 'toNote'; id: string }
  | { type: 'toTask'; id: string }
  | { type: 'setSlot'; id: string; slot: Slot | null }
  | { type: 'setWhen'; id: string; when: WhenInput | null }
  | { type: 'move'; id: string; to: 'today' | 'backlog' }
  | { type: 'remove'; id: string }
  /** Zegar: północ i początek dnia dla KAŻDEGO dnia aż do `to` włącznie. */
  | { type: 'advance'; to: string };

export type Refusal =
  'unknown-item' | 'duplicate-id' | 'not-allowed' | 'slot-taken' | 'slot-outside-day' | 'bad-date';

export type Result = { ok: true; machine: Machine } | { ok: false; reason: Refusal };

const ok = (machine: Machine): Result => ({ ok: true, machine });
const no = (reason: Refusal): Result => ({ ok: false, reason });

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function assertNever(x: never): never {
  throw new Error(`nieobsłużony przypadek: ${JSON.stringify(x)}`);
}

/* ───────────── Sloty ───────────── */

export const slotFits = (slot: Slot, day: DayHours): boolean =>
  Number.isInteger(slot) && slot >= day.q0 && slot + SLOT_LEN <= day.q1;

/** Czy slot nachodzi na slot innego dzisiejszego zadania (także wykonanego). */
export function slotTaken(items: readonly Item[], slot: Slot, exceptId?: string): boolean {
  return items.some(
    (i) =>
      i.id !== exceptId &&
      i.state.tag === 'today-task' &&
      i.state.slot !== null &&
      Math.abs(i.state.slot - slot) < SLOT_LEN,
  );
}

/** Odmowa zajęcia slotu w dziś albo `null`, gdy wolno. */
function claim(
  items: readonly Item[],
  slot: Slot,
  day: DayHours,
  exceptId?: string,
): Refusal | null {
  if (!slotFits(slot, day)) return 'slot-outside-day';
  if (slotTaken(items, slot, exceptId)) return 'slot-taken';
  return null;
}

/** Siatka: dzisiejsze zadania ze slotem, w kolejności godzin. */
export const gridOf = (m: Machine): Item[] =>
  m.items
    .filter((i) => i.state.tag === 'today-task' && i.state.slot !== null)
    .sort((a, b) => slotOf(a)! - slotOf(b)!);

const slotOf = (i: Item): Slot | null => (i.state.tag === 'today-task' ? i.state.slot : null);

/* ───────────── Przejścia ───────────── */

const put = (m: Machine, id: string, state: State): Machine => ({
  ...m,
  items: m.items.map((i) => (i.id === id ? { ...i, state } : i)),
});

export function step(m: Machine, e: Event, day: DayHours): Result {
  if (e.type === 'create') return create(m, e);
  if (e.type === 'advance') return advance(m, e.to, day);

  const item = m.items.find((i) => i.id === e.id);
  if (!item) return no('unknown-item');

  switch (e.type) {
    case 'markDone':
      return markDone(m, item, e.copyId, day);
    case 'markOpen':
      return item.state.tag === 'today-task' && item.state.done
        ? ok(put(m, item.id, { ...item.state, done: false }))
        : no('not-allowed');
    case 'toNote':
      return toNote(m, item);
    case 'toTask':
      if (item.state.tag === 'today-note')
        return ok(put(m, item.id, { tag: 'today-task', done: false, slot: null }));
      if (item.state.tag === 'backlog-note')
        return ok(put(m, item.id, { tag: 'backlog-task', when: null }));
      return no('not-allowed');
    case 'setSlot':
      return setSlot(m, item, e.slot, day);
    case 'setWhen':
      return setWhen(m, item, e.when, day);
    case 'move':
      return e.to === 'backlog' ? toBacklog(m, item) : toToday(m, item, day);
    case 'remove':
      return ok({ ...m, items: m.items.filter((i) => i.id !== item.id) });
    default:
      return assertNever(e);
  }
}

function create(m: Machine, e: Extract<Event, { type: 'create' }>): Result {
  if (m.items.some((i) => i.id === e.id)) return no('duplicate-id');
  const state: State =
    e.place === 'today'
      ? { tag: 'today-task', done: false, slot: null }
      : { tag: 'backlog-task', when: null };
  return ok({ ...m, items: [...m.items, { id: e.id, text: e.text, state }] });
}

function markDone(m: Machine, item: Item, copyId: string, day: DayHours): Result {
  const s = item.state;
  switch (s.tag) {
    case 'today-task':
      return s.done ? no('not-allowed') : ok(put(m, item.id, { ...s, done: true }));
    case 'backlog-task': {
      const w = s.when;
      // Odhaczone w backlogu ląduje w dziś jako wykonane.
      if (w === null || w.type === 'date')
        return ok(put(m, item.id, { tag: 'today-task', done: true, slot: null }));
      if (w.type === 'dateSlot') {
        const r = claim(m.items, w.slot, day, item.id);
        return r ? no(r) : ok(put(m, item.id, { tag: 'today-task', done: true, slot: w.slot }));
      }
      // Powtarzalna: wykonana kopia idzie do dziś, wzorzec zostaje i przesuwa
      // się za odhaczone wystąpienie. Zaległe (next ≤ dziś) przeskakuje za dziś.
      if (m.items.some((i) => i.id === copyId)) return no('duplicate-id');
      if (w.slot !== null) {
        const r = claim(m.items, w.slot, day);
        if (r) return no(r);
      }
      const after = w.next > m.today ? w.next : m.today;
      const template: State = { ...s, when: { ...w, next: nextOccurrence(w.rule, after) } };
      const copy: Item = {
        id: copyId,
        text: item.text,
        state: { tag: 'today-task', done: true, slot: w.slot },
      };
      return ok({ ...m, items: [...put(m, item.id, template).items, copy] });
    }
    case 'today-note':
    case 'backlog-note':
    case 'past-done':
    case 'past-note':
      return no('not-allowed');
    default:
      return assertNever(s);
  }
}

/** Notatka nie ma czasu, więc notatką staje się tylko zadanie otwarte i bez wiązania. */
function toNote(m: Machine, item: Item): Result {
  const s = item.state;
  if (s.tag === 'today-task' && !s.done && s.slot === null)
    return ok(put(m, item.id, { tag: 'today-note' }));
  if (s.tag === 'backlog-task' && s.when === null)
    return ok(put(m, item.id, { tag: 'backlog-note' }));
  return no('not-allowed');
}

function setSlot(m: Machine, item: Item, slot: Slot | null, day: DayHours): Result {
  const s = item.state;
  if (s.tag !== 'today-task' || s.done) return no('not-allowed');
  if (slot !== null) {
    const r = claim(m.items, slot, day, item.id);
    if (r) return no(r);
  }
  return ok(put(m, item.id, { ...s, slot }));
}

function setWhen(m: Machine, item: Item, when: WhenInput | null, day: DayHours): Result {
  if (item.state.tag !== 'backlog-task') return no('not-allowed');
  if (when === null) return ok(put(m, item.id, { tag: 'backlog-task', when: null }));
  switch (when.type) {
    case 'date':
      if (!DATE.test(when.date)) return no('bad-date');
      return ok(put(m, item.id, { tag: 'backlog-task', when }));
    case 'dateSlot':
      if (!DATE.test(when.date)) return no('bad-date');
      // W backlogu slot nie koliduje z niczym; musi tylko mieścić się w dniu.
      if (!slotFits(when.slot, day)) return no('slot-outside-day');
      return ok(put(m, item.id, { tag: 'backlog-task', when }));
    case 'recurring':
      if (when.slot !== null && !slotFits(when.slot, day)) return no('slot-outside-day');
      // Pierwsze wystąpienie liczone od jutra: dzisiejszy świt już minął.
      return ok(
        put(m, item.id, {
          tag: 'backlog-task',
          when: { ...when, next: nextOccurrence(when.rule, m.today) },
        }),
      );
    default:
      return assertNever(when);
  }
}

function toBacklog(m: Machine, item: Item): Result {
  const s = item.state;
  if (s.tag === 'today-note') return ok(put(m, item.id, { tag: 'backlog-note' }));
  if (s.tag !== 'today-task' || s.done) return no('not-allowed');
  // Zadanie ze slotem zabiera go ze sobą, z dzisiejszą datą.
  const when: When | null =
    s.slot === null ? null : { type: 'dateSlot', date: m.today, slot: s.slot };
  return ok(put(m, item.id, { tag: 'backlog-task', when }));
}

function toToday(m: Machine, item: Item, day: DayHours): Result {
  const s = item.state;
  if (s.tag === 'backlog-note') return ok(put(m, item.id, { tag: 'today-note' }));
  if (s.tag !== 'backlog-task') return no('not-allowed');
  const w = s.when;
  if (w === null || w.type === 'date')
    return ok(put(m, item.id, { tag: 'today-task', done: false, slot: null }));
  if (w.type === 'dateSlot') {
    // Data przepada, slot zostaje — o ile jest wolny.
    const r = claim(m.items, w.slot, day, item.id);
    return r ? no(r) : ok(put(m, item.id, { tag: 'today-task', done: false, slot: w.slot }));
  }
  return no('not-allowed'); // wzorzec przychodzi sam, kopią
}

/* ───────────── Zegar ───────────── */

function advance(m: Machine, to: string, day: DayHours): Result {
  if (!DATE.test(to) || to < m.today) return no('bad-date');
  let cur = m;
  // Dzień po dniu: aplikacja zamknięta na tydzień przechodzi każdą północ.
  while (cur.today < to) cur = dayStart(midnight(cur), shiftDay(cur.today, 1), day);
  return ok(cur);
}

/** Wykonane i notatki zostają w swoim dniu; otwarte zadania idą dalej bez slotu. */
function midnight(m: Machine): Machine {
  const prev = m.today;
  return {
    ...m,
    items: m.items.map((i): Item => {
      const s = i.state;
      if (s.tag === 'today-note') return { ...i, state: { tag: 'past-note', day: prev } };
      if (s.tag !== 'today-task') return i;
      if (s.done) return { ...i, state: { tag: 'past-done', day: prev, slot: s.slot } };
      return s.slot === null ? i : { ...i, state: { ...s, slot: null } };
    }),
  };
}

/**
 * Przyjścia z backlogu w dniu `d`. Najpierw pozycje z datą, potem kopie
 * wzorców: konkretna data jest mocniejszym zobowiązaniem niż wzorzec, więc
 * przy sporze o slot wygrywa. W obrębie każdej grupy decyduje kolejność
 * tablicy. Pozycja, której slot jest zajęty albo poza dniem, zostaje
 * w backlogu z datą i czeka na kolejny świt.
 */
function dayStart(m: Machine, d: string, day: DayHours): Machine {
  let items: Item[] = [...m.items];
  const set = (id: string, state: State) => {
    items = items.map((i) => (i.id === id ? { ...i, state } : i));
  };

  for (const orig of m.items) {
    const s = orig.state;
    if (s.tag !== 'backlog-task' || s.when === null) continue;
    const w = s.when;
    if (w.type === 'date' && w.date <= d)
      set(orig.id, { tag: 'today-task', done: false, slot: null });
    if (w.type === 'dateSlot' && w.date <= d && claim(items, w.slot, day, orig.id) === null)
      set(orig.id, { tag: 'today-task', done: false, slot: w.slot });
  }

  for (const orig of m.items) {
    const s = orig.state;
    if (s.tag !== 'backlog-task' || s.when?.type !== 'recurring') continue;
    const w = s.when;
    if (w.next > d) continue;
    const copyId = `${orig.id}@${d}`;
    if (items.some((i) => i.id === copyId)) continue;
    if (w.slot !== null && claim(items, w.slot, day) !== null) continue;
    set(orig.id, { ...s, when: { ...w, next: nextOccurrence(w.rule, d) } });
    items = [
      ...items,
      { id: copyId, text: orig.text, state: { tag: 'today-task', done: false, slot: w.slot } },
    ];
  }
  return { today: d, items };
}

/* ───────────── Niezmienniki ───────────── */

/** Lista naruszeń; pusta znaczy, że stan jest poprawny. */
export function violations(m: Machine, day: DayHours): string[] {
  const out: string[] = [];
  const ids = new Set<string>();
  const slots: Slot[] = [];

  for (const i of m.items) {
    if (ids.has(i.id)) out.push(`powtórzony identyfikator ${i.id}`);
    ids.add(i.id);
    const s = i.state;
    switch (s.tag) {
      case 'today-task':
        if (s.slot !== null) {
          if (!slotFits(s.slot, day)) out.push(`${i.id}: slot poza dniem`);
          slots.push(s.slot);
        }
        break;
      case 'backlog-task':
        if (s.when?.type === 'dateSlot' || s.when?.type === 'recurring') {
          const slot = s.when.slot;
          if (slot !== null && (slot < 0 || slot + SLOT_LEN > QDAY))
            out.push(`${i.id}: slot poza dobą`);
        }
        if (s.when && s.when.type !== 'recurring' && !DATE.test(s.when.date))
          out.push(`${i.id}: zła data`);
        break;
      case 'past-done':
      case 'past-note':
        if (s.day >= m.today) out.push(`${i.id}: przeszłość nie jest przeszła`);
        break;
      case 'today-note':
      case 'backlog-note':
        break;
      default:
        assertNever(s);
    }
  }

  slots.sort((a, b) => a - b);
  for (let k = 1; k < slots.length; k++)
    if (slots[k]! - slots[k - 1]! < SLOT_LEN)
      out.push(`nakładające się sloty ${slots[k - 1]} i ${slots[k]}`);

  return out;
}
