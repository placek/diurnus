import { SLOT_LEN, slotFits, slotTaken } from './machine';
import type { DayHours, Item, Slot, When } from './machine';
import { rel, splitDay } from './time';
import type { Rel } from './time';
import { QDAY } from './types';
import type { Category, ItemType } from './types';

/*
 * Odczyty stanu maszyny na potrzeby widoku. Nic tu nie zmienia stanu:
 * zmiany idą wyłącznie przez zdarzenia maszyny.
 */

export const isToday = (i: Item): boolean =>
  i.state.tag === 'today-task' || i.state.tag === 'today-note';

export const isBacklog = (i: Item): boolean =>
  i.state.tag === 'backlog-task' || i.state.tag === 'backlog-note';

/** Znacznik na liście: zadanie, wykonane albo notatka. */
export function kindOf(i: Item): ItemType {
  const s = i.state;
  if (s.tag === 'today-note' || s.tag === 'backlog-note' || s.tag === 'past-note') return 'note';
  if (s.tag === 'past-done' || (s.tag === 'today-task' && s.done)) return 'done';
  return 'task';
}

export const slotOf = (i: Item): Slot | null =>
  i.state.tag === 'today-task' ? i.state.slot : null;

export const whenOf = (i: Item): When | null =>
  i.state.tag === 'backlog-task' ? i.state.when : null;

export const isDone = (i: Item): boolean => i.state.tag === 'today-task' && i.state.done;

/** Dzisiejsze zadania ze slotem w kolejności godzin — to one są siatką. */
export const timedToday = (items: readonly Item[]): Item[] =>
  items.filter((i) => slotOf(i) !== null).sort((a, b) => slotOf(a)! - slotOf(b)!);

/** Dzisiejsze pozycje bez slotu, w kolejności tablicy. */
export const freeToday = (items: readonly Item[]): Item[] =>
  items.filter((i) => isToday(i) && slotOf(i) === null);

/** Dzisiejsze wykonane w kolejności odhaczenia — to kolejność tablicy (patrz `markDone`). */
export const doneToday = (items: readonly Item[]): Item[] => items.filter(isDone);

/** Dzisiejsze nieodhaczone zadania ze slotem, według godzin. */
export const openTimed = (items: readonly Item[]): Item[] =>
  timedToday(items).filter((i) => !isDone(i));

/** Dzisiejsze nieodhaczone pozycje bez slotu, w kolejności tablicy. Tylko one się przestawiają. */
export const openFree = (items: readonly Item[]): Item[] =>
  freeToday(items).filter((i) => !isDone(i));

/**
 * Lista dnia w kolejności wyświetlania: najpierw wykonane w kolejności odhaczenia,
 * potem plan według godzin, potem reszta w kolejności własnej.
 */
export const todayList = (items: readonly Item[]): Item[] => [
  ...doneToday(items),
  ...openTimed(items),
  ...openFree(items),
];

/** Mapa kwant → zadanie ze slotem. Slot zajmuje zawsze SLOT_LEN kwantów. */
export function occ(items: readonly Item[]): (Item | null)[] {
  const o: (Item | null)[] = new Array(QDAY).fill(null);
  for (const i of timedToday(items)) {
    const s = slotOf(i)!;
    for (let q = Math.max(0, s); q < Math.min(s + SLOT_LEN, QDAY); q++) o[q] = i;
  }
  return o;
}

/** Czy zadanie `exceptId` (albo nowe) mogłoby zająć slot zaczynający się w `q`. */
export const canClaim = (
  items: readonly Item[],
  q: Slot,
  hours: DayHours,
  exceptId?: string,
): boolean => slotFits(q, hours) && !slotTaken(items, q, exceptId);

/** Gdzie slot leży względem teraz. */
export const phase = (day: string, slot: Slot, now: number): Rel =>
  rel(day, slot, slot + SLOT_LEN, now);

/**
 * Jeden schemat barw dla obu list. Upływ czasu zmienia wyłącznie kolor,
 * nigdy stan — wykonanie oznacza tylko użytkownik.
 *   incoming — przed nami, active — slot trwa, done — zrobione,
 *   missed — slot minął, a rzecz nie, note — notatka nie jest zobowiązaniem
 */
export type Tone = 'incoming' | 'active' | 'done' | 'missed' | 'note';

export function itemTone(i: Item, day: string, now: number): Tone {
  const kind = kindOf(i);
  if (kind === 'note') return 'note';
  if (kind === 'done') return 'done';
  const slot = slotOf(i);
  if (slot === null) return 'incoming';
  const p = phase(day, slot, now);
  return p === 'now' ? 'active' : p === 'past' ? 'missed' : 'incoming';
}

/** Zadanie, którego slot właśnie trwa, jeśli jest otwarte. */
export const activeNow = (items: readonly Item[], day: string, now: number): Item | undefined =>
  timedToday(items).find((i) => !isDone(i) && phase(day, slotOf(i)!, now) === 'now');

const sortDate = (i: Item): string | null => {
  const w = whenOf(i);
  if (!w) return null;
  return w.type === 'recurring' ? w.next : w.date;
};

const sortSlot = (i: Item): number => {
  const w = whenOf(i);
  return w && w.type !== 'date' && w.slot !== null ? w.slot : -1;
};

/** Ile najbliższych dni dostaje względny termin i barwę bliskości. */
export const SOON_DAYS = 5;

/**
 * Bliskość terminu pozycji backlogu: ile dni zostało i jak to powiedzieć.
 * `null`, gdy pozycja nie ma terminu albo termin jest dalej niż SOON_DAYS.
 * Termin dziś lub miniony — pozycja, której slot był zajęty — jest najpilniejszy.
 */
export function soonOf(i: Item, today: string): { days: number; label: string } | null {
  const date = sortDate(i);
  if (date === null) return null;
  // Różnica dat kalendarzowych w UTC: doba zmiany czasu nie przesuwa wyniku.
  const utc = (d: string) => {
    const [y, m, dd] = splitDay(d);
    return Date.UTC(y, m - 1, dd);
  };
  const days = Math.round((utc(date) - utc(today)) / 86_400_000);
  if (days > SOON_DAYS) return null;
  const label =
    days < 0 ? 'po terminie' : days === 0 ? 'dziś' : days === 1 ? 'jutro' : `za ${days} dni`;
  return { days, label };
}

/** Backlog: najpierw pozycje z terminem według daty i godziny, potem reszta w kolejności tablicy. */
export function backlogList(items: readonly Item[]): Item[] {
  const all = items.filter(isBacklog);
  const dated = all.filter((i) => sortDate(i) !== null);
  const undated = all.filter((i) => sortDate(i) === null);
  dated.sort(
    (a, b) =>
      (sortDate(a) as string).localeCompare(sortDate(b) as string) || sortSlot(a) - sortSlot(b),
  );
  return [...dated, ...undated];
}

/** Kategoria pozycji albo `null`, gdy jej nie ma lub została usunięta. */
export const categoryOf = (i: Item, cats: readonly Category[]): Category | null =>
  (i.cat && cats.find((c) => c.id === i.cat)) || null;
