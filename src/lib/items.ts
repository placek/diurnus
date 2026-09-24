import type { Item, ItemType } from './types';

/** Notacja bullet journal. Jeden znak na typ, bez powtórzeń. */
export const MARK: Record<ItemType, string> = {
  task: '·',
  done: '×',
  note: '–',
};

/** Lista jednego dnia. `filter` zachowuje kolejność tablicy, więc pozycja
 *  w tablicy JEST kolejnością — nie ma osobnego pola `order`. */
export const dayItems = (items: readonly Item[], day: string): Item[] =>
  items.filter((i) => i.day === day);

export const newItem = (
  day: string | null,
  type: ItemType,
  created: number,
  makeId: () => string,
): Item => ({ id: makeId(), day, text: '', type, created });

// Indeks liczony w PEŁNEJ tablicy, nie w przefiltrowanej: dni mogą się
// przeplatać, a wstawka ma trafić tuż za swoją pozycją, nie za pozycją
// o tym samym numerze w innym dniu.
export function insertAfter(
  items: readonly Item[],
  afterId: string | null,
  item: Item,
): Item[] {
  const out = [...items];
  if (afterId === null) {
    const last = out.map((x) => x.day).lastIndexOf(item.day);
    out.splice(last < 0 ? out.length : last + 1, 0, item);
    return out;
  }
  const i = out.findIndex((x) => x.id === afterId);
  out.splice(i < 0 ? out.length : i + 1, 0, item);
  return out;
}

export const removeById = (items: readonly Item[], id: string): Item[] =>
  items.filter((i) => i.id !== id);

// Trzy znaczniki opisujące stan pozycji tutaj. Przenoszenie między dniami
// odbywa się przeciągnięciem do backlogu, nie zmianą znacznika.
export const CYCLE = ['task', 'done', 'note'] as const;

export function cycleType(type: ItemType, dir: 1 | -1 = 1): ItemType {
  const i = CYCLE.indexOf(type as (typeof CYCLE)[number]);
  if (i < 0) return 'task'; // wyjście ze stanu przeniesionego
  return CYCLE[(i + dir + CYCLE.length) % CYCLE.length]!;
}

/** Nowa pozycja dziedziczy typ, ale nigdy nie rodzi się w stanie końcowym. */
export const typeAfterEnter = (type: ItemType): ItemType =>
  type === 'note' ? 'note' : 'task';

export function moveItem(
  items: readonly Item[],
  id: string,
  toIndex: number,
  day: string,
): Item[] {
  const src = items.find((i) => i.id === id);
  if (!src || src.day !== day) return [...items];

  const inDay = dayItems(items, day);
  const from = inDay.findIndex((i) => i.id === id);
  const to = Math.min(Math.max(toIndex, 0), inDay.length - 1);
  if (from === to) return [...items];

  const rest = items.filter((i) => i.id !== id);
  // Sąsiad, przed którym pozycja ma wylądować — liczony na liście dnia BEZ niej.
  const withoutSrc = inDay.filter((i) => i.id !== id);
  const anchor = withoutSrc[to];

  const out = [...rest];
  const at = anchor ? out.findIndex((i) => i.id === anchor.id) : -1;
  out.splice(at < 0 ? out.length : at, 0, src);
  return out;
}
