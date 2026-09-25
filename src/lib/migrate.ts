import { slotFits, slotTaken } from './machine';
import type { DayHours, Item, ItemState, When } from './machine';
import { nextOccurrence } from './repeat';
import type { Repeat } from './repeat';
import type { Category, DaySettings, State } from './types';

/*
 * Jednorazowe przejście z v5 (bloki + pozycje) do v6 (pozycje-stany maszyny).
 *
 * v5 trzymało rzecz z godziną w dwóch rekordach: bloku na siatce i pozycji
 * na liście, uzgadnianych po każdej zmianie. v6 ma jeden rekord na rzecz,
 * więc para blok–pozycja zlewa się w jedną pozycję ze slotem.
 *
 * Reguły, dzień po dniu względem `today`:
 * - backlog (bez daty albo data późniejsza niż dziś): wzorzec, data albo data
 *   ze slotem; notatka traci datę, bo notatka nie ma czasu;
 * - dziś: blok potwierdzony to wykonane zadanie ze slotem, każdy inny to
 *   otwarte zadanie ze slotem; pozycja swobodna z godziną (`at`), której v5
 *   nie pokazywało, dostaje ją jako slot;
 * - przeszłość: wykonane i notatki zostają w swoim dniu, otwarte zadania
 *   przechodzą do dziś bez slotu, jak o północy; niepotwierdzone bloki
 *   przeszłości przepadają — v5 też ich nigdy nie przenosiło, to zapis czasu,
 *   który minął bez wykonania;
 * - bloki odrzuconych sugestii przepadają.
 *
 * Slot musi mieć 30 minut, mieścić się w dniu i nie nachodzić na inny. Bloki
 * v5 mogły mieć 15 minut i stać obok siebie; pierwszy w kolejności zachowuje
 * slot, kolejny traci go i zostaje zwykłym zadaniem.
 */

interface V5Block {
  id: string;
  day: string;
  q: number;
  len: number;
  cat: string;
  title: string;
  status: 'suggested' | 'planned' | 'active' | 'confirmed' | 'discarded';
  created: number;
}

interface V5Item {
  id: string;
  day: string | null;
  text: string;
  type: 'task' | 'done' | 'note';
  created: number;
  block?: string;
  cat?: string;
  at?: number;
  repeat?: Repeat;
  nextOn?: string;
}

export interface V5State {
  v: 5;
  cats: Category[];
  day: DaySettings;
  blocks: V5Block[];
  items: V5Item[];
}

export const hoursOf = (d: DaySettings): DayHours => ({ q0: d.start * 4, q1: d.end * 4 });

export function fromV5(s: V5State, today: string): State {
  const hours = hoursOf(s.day);
  const blocks = new Map(s.blocks.map((b) => [b.id, b]));
  const used = new Set<string>();
  const out: Item[] = [];

  /** Slot do dziś: tylko gdy mieści się w dniu i jest wolny. */
  const todaySlot = (q: number | undefined): number | null =>
    q !== undefined && slotFits(q, hours) && !slotTaken(out, q) ? q : null;

  const push = (base: Omit<Item, 'state'>, state: ItemState) => out.push({ ...base, state });

  for (const i of s.items) {
    const linked = i.block ? blocks.get(i.block) : undefined;
    const block = linked && linked.status !== 'discarded' ? linked : undefined;
    if (linked) used.add(linked.id);

    const cat = block?.cat ?? i.cat;
    const base: Omit<Item, 'state'> = {
      id: i.id,
      text: block ? i.text || block.title : i.text,
      created: i.created,
      ...(cat ? { cat } : {}),
    };

    if (i.day === null || i.day > today) {
      push(base, backlogState(i, today, hours));
      continue;
    }

    if (block) {
      if (i.day === today) push(base, fromBlock(block, todaySlot(block.q)));
      else if (block.status === 'confirmed')
        push(base, { tag: 'past-done', day: i.day, slot: block.q });
      continue; // niepotwierdzony blok przeszłości przepada
    }

    if (i.type === 'note') {
      push(base, i.day === today ? { tag: 'today-note' } : { tag: 'past-note', day: i.day });
    } else if (i.type === 'done') {
      push(
        base,
        i.day === today
          ? { tag: 'today-task', done: true, slot: null }
          : { tag: 'past-done', day: i.day, slot: null },
      );
    } else {
      // Otwarte zadanie: dziś albo przeniesione z przeszłości, jak o północy.
      const slot = i.day === today ? todaySlot(i.at) : null;
      push(base, { tag: 'today-task', done: false, slot });
    }
  }

  // Bloki bez pozycji: v5 dorabiało je leniwie, więc mogło ich nie zdążyć.
  for (const b of s.blocks) {
    if (used.has(b.id) || b.status === 'discarded') continue;
    const base: Omit<Item, 'state'> = { id: b.id, text: b.title, created: b.created, cat: b.cat };
    if (b.day === today) push(base, fromBlock(b, todaySlot(b.q)));
    else if (b.day > today)
      push(base, {
        tag: 'backlog-task',
        when: slotFits(b.q, hours)
          ? { type: 'dateSlot', date: b.day, slot: b.q }
          : { type: 'date', date: b.day },
      });
    else if (b.status === 'confirmed') push(base, { tag: 'past-done', day: b.day, slot: b.q });
  }

  return { v: 6, cats: s.cats, day: s.day, today, items: out };
}

function fromBlock(b: V5Block, slot: number | null): ItemState {
  return { tag: 'today-task', done: b.status === 'confirmed', slot };
}

function backlogState(i: V5Item, today: string, hours: DayHours): ItemState {
  if (i.type === 'note') return { tag: 'backlog-note' };
  // Wykonane w backlogu v6 nie zna: odhaczone trafia do dziś.
  if (i.type === 'done') return { tag: 'today-task', done: true, slot: null };

  let when: When | null = null;
  if (i.repeat) {
    when = {
      type: 'recurring',
      rule: i.repeat,
      slot: null,
      next: i.nextOn ?? nextOccurrence(i.repeat, today),
    };
  } else if (i.day !== null) {
    when =
      i.at !== undefined && slotFits(i.at, hours)
        ? { type: 'dateSlot', date: i.day, slot: i.at }
        : { type: 'date', date: i.day };
  }
  return { tag: 'backlog-task', when };
}
